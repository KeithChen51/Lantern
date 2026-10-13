import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink, open, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ClientError, CLIENT_ID, SCOPE, validateOrigin } from './transport.js';

export const defaultDirectory = () => join(homedir(), '.lighthouse');
export const credentialKey = origin => createHash('sha256').update(`${validateOrigin(origin)}\0${CLIENT_ID}\0${SCOPE}`).digest('hex');
export async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ClientError('unsafe_storage_path');
  if (process.platform !== 'win32' && (stat.mode & 0o077)) throw new ClientError('unsafe_storage_permissions');
}
export async function atomicWrite(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, value, { flag: 'wx', mode: 0o600 }); await rename(temp, path); }
  finally { await unlink(temp).catch(() => {}); }
}
export async function runProcess(command, args, input = '', { timeoutMs = 15000, maxBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let bytes = 0; let failed = false;
    const fail = () => { if (!failed) { failed = true; child.kill(); reject(new ClientError('secure_backend_unavailable', 'OS credential store unavailable; no plaintext fallback is permitted.')); } };
    const timer = setTimeout(fail, timeoutMs);
    child.on('error', fail); child.stdin.on('error', fail);
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > maxBytes) fail(); else output += chunk; });
    child.stderr.on('data', chunk => { bytes += chunk.length; if (bytes > maxBytes) fail(); });
    child.on('close', code => { clearTimeout(timer); if (failed) return; if (code !== 0) fail(); else resolve(output.trim()); });
    child.stdin.end(input);
  });
}
const DPAPI = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $x=[Console]::In.ReadToEnd() | ConvertFrom-Json; $entropy=[Text.Encoding]::UTF8.GetBytes('lighthouse-cli'); if($x.operation -eq 'encrypt'){$b=[Text.Encoding]::UTF8.GetBytes([string]$x.value); $r=[Security.Cryptography.ProtectedData]::Protect($b,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))} else {$b=[Convert]::FromBase64String([string]$x.value); $r=[Security.Cryptography.ProtectedData]::Unprotect($b,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($r))}";
// Only this nonsecret helper source is written to disk. Keychain payloads travel on stdin.
const KEYCHAIN = `import Foundation
import Security
let input = FileHandle.standardInput.readDataToEndOfFile()
let x = try JSONSerialization.jsonObject(with: input) as! [String:String]
let q: [String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"lighthouse-cli",kSecAttrAccount as String:x["key"]!]
switch x["operation"]! {
case "get":
 var query=q; query[kSecReturnData as String]=true; query[kSecMatchLimit as String]=kSecMatchLimitOne
 var result:CFTypeRef?; let status=SecItemCopyMatching(query as CFDictionary,&result)
 if status == errSecSuccess { FileHandle.standardOutput.write(result as! Data) } else if status != errSecItemNotFound { exit(1) }
case "set":
 let data=x["value"]!.data(using:.utf8)!
 let status=SecItemUpdate(q as CFDictionary,[kSecValueData as String:data] as CFDictionary)
 if status == errSecItemNotFound { var add=q; add[kSecValueData as String]=data; add[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly; if SecItemAdd(add as CFDictionary,nil) != errSecSuccess {exit(1)} } else if status != errSecSuccess {exit(1)}
case "delete": let status=SecItemDelete(q as CFDictionary); if status != errSecSuccess && status != errSecItemNotFound {exit(1)}
default: exit(1)
}
`;
export class SecureStore {
  constructor({ directory = defaultDirectory(), platform = process.platform, runner = runProcess } = {}) { this.directory = directory; this.platform = platform; this.runner = runner; }
  async operation(origin, operation, value) {
    const key = credentialKey(origin);
    await privateDirectory(this.directory);
    if (this.platform === 'win32') {
      const path = join(this.directory, `${key}.dpapi`);
      if (operation === 'delete') { await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; }); return null; }
      const args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(DPAPI, 'utf16le').toString('base64')];
      if (operation === 'set') { const encrypted = await this.runner('powershell.exe', args, JSON.stringify({ operation: 'encrypt', value })); if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted)) throw new ClientError('invalid_secure_backend_response'); await atomicWrite(path, encrypted); return null; }
      let encrypted;
      try { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new ClientError('unsafe_storage_path'); encrypted = await readFile(path, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      return this.runner('powershell.exe', args, JSON.stringify({ operation: 'decrypt', value: encrypted }));
    }
    if (this.platform === 'darwin') {
      const helper = join(this.directory, 'keychain-helper-v1.swift');
      await atomicWrite(helper, KEYCHAIN);
      return this.runner('/usr/bin/swift', [helper], JSON.stringify({ key, operation, ...(value === undefined ? {} : { value }) }));
    }
    if (this.platform === 'linux') {
      const attributes = ['service', 'lighthouse-cli', 'origin-key', key];
      if (operation === 'set') return this.runner('secret-tool', ['store', '--label=Lighthouse knowledge access', ...attributes], value);
      if (operation === 'delete') return this.runner('secret-tool', ['clear', ...attributes]);
      // secret-tool exits 1 for both unavailable service and missing item. Fail closed;
      // login can create a new entry; status never pretends unavailable storage is anonymous.
      return this.runner('secret-tool', ['lookup', ...attributes]);
    }
    throw new ClientError('secure_backend_unavailable');
  }
  async get(origin) { const text = await this.operation(origin, 'get'); if (!text) return null; let data; try { data = JSON.parse(text); } catch { throw new ClientError('invalid_credential'); } validateCredential(data, origin); return data; }
  async set(origin, credential) { validateCredential(credential, origin); await this.operation(origin, 'set', JSON.stringify(credential)); }
  async delete(origin) { await this.operation(origin, 'delete'); }
}
export function validateCredential(data, origin) {
  const token = value => typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/[\x00-\x20\x7f]/.test(value);
  if (!data || data.origin !== validateOrigin(origin) || data.clientId !== CLIENT_ID || data.scope !== SCOPE || !token(data.accessToken) || !token(data.refreshToken) || !Number.isFinite(data.expiresAt) || !Number.isFinite(data.grantExpiresAt) || data.expiresAt > data.grantExpiresAt) throw new ClientError('invalid_credential');
}
export class MemoryStore {
  constructor() { this.values = new Map(); }
  async get(origin) { return this.values.get(origin) ?? null; }
  async set(origin, value) { validateCredential(value, origin); this.values.set(origin, structuredClone(value)); }
  async delete(origin) { this.values.delete(origin); }
}
export class FileLock {
  constructor({ directory = defaultDirectory(), timeoutMs = 15000, intervalMs = 75 } = {}) { this.directory = directory; this.timeoutMs = timeoutMs; this.intervalMs = intervalMs; }
  async run(origin, task) {
    await privateDirectory(this.directory);
    const path = join(this.directory, `${credentialKey(origin)}.lock`);
    const started = Date.now(); let handle;
    for (;;) {
      try { handle = await open(path, 'wx', 0o600); await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now(), nonce: randomUUID() })); break; }
      catch (error) {
        if (handle) { await handle.close(); await unlink(path).catch(() => {}); throw error; }
        // Windows can report EPERM while another process holds an exclusive-create
        // file. Treat it as contention only after confirming the lock exists.
        if (error.code !== 'EEXIST' && !(error.code === 'EPERM' && await lstat(path).then(stat => stat.isFile() && !stat.isSymbolicLink(), () => false))) throw error;
        if (Date.now() - started >= this.timeoutMs) throw new ClientError('credential_lock_timeout', 'Credential lock timed out. Stop other lighthouse processes before removing an abandoned .lock file.');
        await new Promise(resolve => setTimeout(resolve, this.intervalMs));
      }
    }
    try { return await task(); } finally { await handle.close(); await unlink(path); }
  }
}
