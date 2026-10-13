import { lstat, realpath, open, unlink } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { Transport, ClientError, CLIENT_ID, SCOPE, validateOrigin } from './transport.js';
import { SecureStore, FileLock, validateCredential } from './credentials.js';

const identifier = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9._~-]{0,199}$/.test(value) || value === '..') throw new ClientError('invalid_identifier'); return encodeURIComponent(value); };
export function versionUri(id, versionId) { return `lighthouse://resources/${identifier(id)}/versions/${identifier(versionId)}`; }
export function parseVersionUri(value) { const match = /^lighthouse:\/\/resources\/([^/?#]+)\/versions\/([^/?#]+)$/.exec(value); if (!match) throw new ClientError('invalid_resource_uri'); const resourceId = decodeURIComponent(match[1]); const versionId = decodeURIComponent(match[2]); identifier(resourceId); identifier(versionId); return { resourceId, versionId }; }
export class LighthouseClient {
  constructor(origin, { transport, store = new SecureStore(), lock = new FileLock(), now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), deviceTimeoutMs = 10 * 60 * 1000 } = {}) {
    this.origin = validateOrigin(origin); this.transport = transport ?? new Transport(this.origin); this.store = store; this.lock = lock; this.now = now; this.sleep = sleep; this.deviceTimeoutMs = deviceTimeoutMs;
  }
  credential(response, grantExpiresAt) {
    const token = value => typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/[\x00-\x20\x7f]/.test(value);
    if (!response || response.token_type !== 'Bearer' || response.scope !== SCOPE || !token(response.access_token) || !token(response.refresh_token) || !Number.isInteger(response.expires_in) || response.expires_in <= 0 || response.expires_in > 300) throw new ClientError('invalid_token_response');
    return { origin: this.origin, clientId: CLIENT_ID, scope: SCOPE, accessToken: response.access_token, refreshToken: response.refresh_token, expiresAt: Math.min(this.now() + response.expires_in * 1000, grantExpiresAt), grantExpiresAt };
  }
  async login({ deviceName = 'lighthouse', onVerification = () => {}, openBrowser = false, opener = openVerification } = {}) {
    const device = await this.transport.request('/api/auth/device/authorize', { method: 'POST', form: { client_id: CLIENT_ID, scope: SCOPE, device_name: deviceName.slice(0, 100) } });
    if (typeof device.device_code !== 'string' || !device.device_code || typeof device.user_code !== 'string' || !/^[A-Za-z0-9 -]{1,64}$/.test(device.user_code) || !Number.isInteger(device.expires_in) || device.expires_in <= 0 || !Number.isInteger(device.interval) || device.interval < 1 || device.interval > 60) throw new ClientError('invalid_device_response');
    const verification = this.verificationUrl(device.verification_uri);
    const complete = device.verification_uri_complete ? this.verificationUrl(device.verification_uri_complete) : verification;
    await onVerification({ verificationUri: verification, userCode: device.user_code, expiresIn: device.expires_in });
    if (openBrowser) await opener(complete);
    const deadline = this.now() + Math.min(device.expires_in * 1000, this.deviceTimeoutMs);
    let interval = device.interval * 1000;
    for (;;) {
      await this.sleep(Math.min(interval, Math.max(0, deadline - this.now())));
      if (this.now() >= deadline) throw new ClientError('expired_token');
      try {
        const response = await this.transport.request('/api/auth/token', { method: 'POST', form: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: device.device_code, client_id: CLIENT_ID } });
        const credential = this.credential(response, this.now() + 8 * 60 * 60 * 1000);
        await this.lock.run(this.origin, () => this.store.set(this.origin, credential));
        return { authenticated: true, server: this.origin, scope: SCOPE, expiresAt: credential.grantExpiresAt };
      } catch (error) { if (error.code === 'authorization_pending') continue; if (error.code === 'slow_down') { interval += 5000; continue; } throw error; }
    }
  }
  verificationUrl(value) { let url; try { url = new URL(value); } catch { throw new ClientError('invalid_device_response'); } if (url.protocol !== 'https:' || url.origin !== this.origin || url.username || url.password || url.hash) throw new ClientError('invalid_device_response'); return url.href; }
  async accessToken() {
    return this.lock.run(this.origin, async () => {
      const credential = await this.store.get(this.origin);
      if (!credential) throw new ClientError('login_required', 'Run lighthouse auth login first.');
      validateCredential(credential, this.origin);
      if (credential.grantExpiresAt <= this.now()) { await this.store.delete(this.origin); throw new ClientError('grant_expired'); }
      if (credential.expiresAt > this.now() + 30000) return credential.accessToken;
      try {
        const response = await this.transport.request('/api/auth/token', { method: 'POST', form: { grant_type: 'refresh_token', refresh_token: credential.refreshToken, client_id: CLIENT_ID } });
        const updated = this.credential(response, credential.grantExpiresAt);
        await this.store.set(this.origin, updated);
        return updated.accessToken;
      } catch (error) { if (['invalid_grant', 'access_denied', 'expired_token'].includes(error.code)) await this.store.delete(this.origin); throw error; }
    });
  }
  async authorized(path, options) { return this.transport.request(path, { ...options, token: await this.accessToken() }); }
  async status() { const identity = await this.authorized('/api/client/v1/me'); return { server: this.origin, authenticated: true, identity }; }
  async logout() {
    return this.lock.run(this.origin, async () => {
      const credential = await this.store.get(this.origin);
      if (!credential) return { authenticated: false, revoked: false };
      validateCredential(credential, this.origin);
      let token = credential.accessToken;
      if (credential.expiresAt <= this.now() + 30000 && credential.grantExpiresAt > this.now()) {
        const response = await this.transport.request('/api/auth/token', { method: 'POST', form: { grant_type: 'refresh_token', refresh_token: credential.refreshToken, client_id: CLIENT_ID } });
        const updated = this.credential(response, credential.grantExpiresAt); await this.store.set(this.origin, updated); token = updated.accessToken;
      }
      if (credential.grantExpiresAt <= this.now()) { await this.store.delete(this.origin); return { authenticated: false, revoked: false, expired: true }; }
      await this.transport.request('/api/client/v1/auth/revoke', { method: 'POST', token });
      await this.store.delete(this.origin);
      return { authenticated: false, revoked: true };
    });
  }
  async knowledge(operation, args = {}) {
    const allowed = { browse: new Set(['folderId', 'offset', 'limit']), search: new Set(['query', 'type', 'tag', 'visibility', 'offset', 'limit']), get: new Set(['resourceId', 'versionId']), outline: new Set(['resourceId', 'versionId', 'sectionOffset', 'sectionLimit', 'fileOffset', 'fileLimit']), read: new Set(['resourceId', 'versionId', 'offset', 'startLine', 'lineCount']), files: new Set(['resourceId', 'versionId', 'offset', 'limit']), file_read: new Set(['resourceId', 'versionId', 'path', 'offset']) };
    if (!Object.hasOwn(allowed, operation)) throw new ClientError('unknown_operation');
    if (Object.keys(args).some(key => !allowed[operation].has(key))) throw new ClientError('invalid_arguments');
    const { resourceId, ...query } = args;
    if (query.versionId !== undefined) identifier(query.versionId);
    if (query.folderId !== undefined) identifier(query.folderId);
    for (const key of ['offset', 'sectionOffset', 'fileOffset']) if (query[key] !== undefined && (!Number.isInteger(query[key]) || query[key] < 0)) throw new ClientError('invalid_arguments');
    for (const key of ['limit', 'sectionLimit', 'fileLimit', 'lineCount', 'startLine']) if (query[key] !== undefined && (!Number.isInteger(query[key]) || query[key] < 1 || query[key] > (key === 'lineCount' ? 120 : key === 'startLine' ? 10000000 : 100))) throw new ClientError('invalid_arguments');
    if (query.offset !== undefined && query.startLine !== undefined) throw new ClientError('invalid_arguments');
    if (operation === 'search' && (typeof query.query !== 'string' || !query.query || query.query.length > 2000)) throw new ClientError('invalid_arguments');
    for (const key of ['type', 'tag', 'visibility']) if (query[key] !== undefined && (typeof query[key] !== 'string' || query[key].length > 100)) throw new ClientError('invalid_arguments');
    if (['browse', 'search'].includes(operation)) return this.authorized(operation === 'browse' ? '/api/client/v1/resources/browse' : '/api/client/v1/resources', { query });
    const path = `/api/client/v1/resources/${identifier(resourceId)}${operation === 'get' ? '' : `/${operation === 'file_read' ? 'files/read' : operation}`}`;
    if (operation === 'file_read') {
      if (typeof query.path !== 'string' || !query.path || query.path.length > 1000 || /[\x00-\x1f]/.test(query.path)) throw new ClientError('invalid_arguments');
    }
    return this.authorized(path, { query });
  }
  async download(args, output) {
    if (Object.keys(args).some(key => !['resourceId', 'versionId', 'fileId'].includes(key)) || !args.versionId) throw new ClientError('invalid_arguments');
    identifier(args.versionId); identifier(args.fileId);
    const bytes = await this.authorized(`/api/client/v1/resources/${identifier(args.resourceId)}/download`, { query: { versionId: args.versionId, fileId: args.fileId }, binary: true });
    const file = await writeDownload(output, bytes);
    return { resourceId: args.resourceId, versionId: args.versionId, fileId: args.fileId, bytes: bytes.length, output: file };
  }
}
export async function writeDownload(output, bytes) {
  if (typeof output !== 'string' || !output || /[\x00-\x1f]/.test(output) || /[<>:"|?*]/.test(basename(output)) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(basename(output)) || /[. ]$/.test(basename(output))) throw new ClientError('unsafe_output_path');
  const absolute = resolve(output); const parent = dirname(absolute);
  // Explicit destination, existing real parent, exclusive create: no overwrites or symlink targets.
  if (resolve(await realpath(parent)) !== resolve(parent)) throw new ClientError('unsafe_output_path');
  const stat = await lstat(parent); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ClientError('unsafe_output_path');
  const handle = await open(absolute, 'wx', 0o600);
  try { await handle.writeFile(bytes); } catch (error) { await handle.close(); await unlink(absolute); throw error; }
  await handle.close(); return absolute;
}
export async function openVerification(url, { platform = process.platform, spawnProcess = spawn } = {}) {
  const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new ClientError('invalid_device_response');
  const command = platform === 'win32' ? 'rundll32.exe' : platform === 'darwin' ? '/usr/bin/open' : 'xdg-open';
  const args = platform === 'win32' ? ['url.dll,FileProtocolHandler', parsed.href] : [parsed.href];
  await new Promise((resolvePromise, reject) => { const child = spawnProcess(command, args, { shell: false, windowsHide: true, stdio: 'ignore' }); child.once('error', () => reject(new ClientError('browser_open_failed'))); child.once('exit', code => code === 0 ? resolvePromise() : reject(new ClientError('browser_open_failed'))); });
}
