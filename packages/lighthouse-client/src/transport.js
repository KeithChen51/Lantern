export const CLIENT_ID = 'lighthouse-cli';
export const SCOPE = 'knowledge:read';
export class ClientError extends Error {
  constructor(code, message = code) { super(message); this.name = 'ClientError'; this.code = code; }
}
export function validateOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new ClientError('invalid_server', 'Provide an HTTPS server origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new ClientError('invalid_server', 'Server must be an HTTPS origin without path, credentials, query or fragment.');
  }
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new ClientError('unsafe_tls', 'TLS certificate validation must be enabled.');
  return url.origin;
}
const ALLOWED_PATH = /^\/api\/(?:auth\/(?:device\/authorize|token)|client\/v1\/(?:me|auth\/revoke|resources(?:\/browse|\/[A-Za-z0-9._~-]+(?:\/(?:outline|read|files(?:\/read)?|download))?)?))$/;
const OAUTH_ERRORS = new Set(['authorization_pending', 'slow_down', 'access_denied', 'expired_token', 'invalid_grant', 'invalid_client', 'invalid_scope', 'invalid_request']);
export class Transport {
  constructor(origin, { fetch: fetcher = globalThis.fetch, timeoutMs = 15000, maxBytes = 2 * 1024 * 1024, binaryMaxBytes = 16 * 1024 * 1024 } = {}) {
    this.origin = validateOrigin(origin); this.fetch = fetcher; this.timeoutMs = timeoutMs; this.maxBytes = maxBytes; this.binaryMaxBytes = binaryMaxBytes;
  }
  async request(path, { method = 'GET', query = {}, form, token, binary = false, signal } = {}) {
    validateOrigin(this.origin);
    if (!ALLOWED_PATH.test(path) || !['GET', 'POST'].includes(method)) throw new ClientError('invalid_endpoint');
    const isPost = path === '/api/auth/device/authorize' || path === '/api/auth/token' || path === '/api/client/v1/auth/revoke';
    if ((method === 'POST') !== isPost) throw new ClientError('invalid_endpoint');
    const url = new URL(path, this.origin);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    const headers = { Accept: binary ? 'application/octet-stream' : 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const abort = new AbortController();
    const aborted = new Promise((_, reject) => abort.signal.addEventListener('abort', () => reject(new ClientError('request_timeout')), { once: true }));
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);
    const onAbort = () => abort.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) abort.abort();
    try {
      const response = await Promise.race([this.fetch(url, { method, headers, body: form ? new URLSearchParams(form) : undefined, redirect: 'manual', credentials: 'omit', signal: abort.signal }), aborted]);
      if (response.status >= 300 && response.status < 400 || response.redirected || response.url && new URL(response.url).origin !== this.origin) throw new ClientError('redirect_rejected');
      const responseLimit = binary && response.ok ? this.binaryMaxBytes : this.maxBytes;
      const length = Number(response.headers.get('content-length'));
      if (length > responseLimit) throw new ClientError('response_too_large');
      const reader = response.body?.getReader();
      let size = 0; const chunks = [];
      if (reader) {
        try {
          for (;;) { const { done, value } = await Promise.race([reader.read(), aborted]); if (done) break; size += value.length; if (size > responseLimit) throw new ClientError('response_too_large'); chunks.push(Buffer.from(value)); }
        } finally { reader.cancel().catch(() => {}); }
      }
      const bytes = Buffer.concat(chunks);
      if (response.status === 204) return null;
      if (binary && response.ok) return bytes;
      let data;
      try { data = JSON.parse(bytes.toString('utf8')); } catch { throw new ClientError('invalid_response', 'Server returned invalid JSON.'); }
      if (!response.ok) {
        if (data && OAUTH_ERRORS.has(data.error)) throw new ClientError(data.error);
        throw new ClientError(`http_${response.status}`, `Server request failed (${response.status}).`);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ClientError('invalid_response');
      return data;
    } catch (error) {
      if (error instanceof ClientError) throw error;
      throw new ClientError(abort.signal.aborted ? 'request_timeout' : 'network_error');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  }
}
