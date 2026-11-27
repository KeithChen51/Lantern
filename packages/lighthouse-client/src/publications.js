import { open, realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { ClientError } from './transport.js';

const MAX_HTML_BYTES = 666 * 1024;
const MAX_COVER_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_BYTES = 64 * 1024;
const idPattern = /^[A-Za-z0-9_-][A-Za-z0-9._~-]{0,119}$/;
const requestPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new ClientError('invalid_publication_input');
}
function text(value, maximum, required = true) {
  if (value === undefined && !required) return;
  if (typeof value !== 'string' || required && !value.trim() || Buffer.byteLength(value) > maximum || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new ClientError('invalid_publication_input');
}
function identifier(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new ClientError('invalid_identifier');
  return encodeURIComponent(value);
}
function requestId(value) {
  if (typeof value !== 'string' || !requestPattern.test(value)) throw new ClientError('invalid_request_id', 'Provide a UUID requestId and reuse it when retrying the same operation.');
}
function audience(value) {
  object(value, ['kind', 'ids']);
  object(value, value.kind === 'all' ? ['kind'] : ['kind', 'ids']);
  if (value.kind === 'all') return;
  const maximum = value.kind === 'members' ? 1000 : value.kind === 'departments' ? 100 : 0;
  if (!Array.isArray(value.ids) || value.ids.length < 1 || value.ids.length > maximum || new Set(value.ids).size !== value.ids.length) throw new ClientError('invalid_audience');
  for (const id of value.ids) {
    if (typeof id !== 'string' || !(value.kind === 'members' ? /^[A-Za-z0-9_.@-]{1,128}$/.test(id) && id !== '@all' : /^[1-9][0-9]{0,15}$/.test(id))) throw new ClientError('invalid_audience');
  }
}

export function publicationRequest(operation, args = {}) {
  if (operation === 'list') {
    object(args, []);
    return { path: '/api/admin/wecom-publications/tasks' };
  }
  if (operation === 'status') {
    object(args, ['taskId']);
    return { path: `/api/admin/wecom-publications/tasks/${identifier(args.taskId)}` };
  }
  if (operation === 'retry') {
    object(args, ['taskId', 'channel', 'requestId']);
    identifier(args.taskId);
    requestId(args.requestId);
    if (!['group', 'auto'].includes(args.channel)) throw new ClientError('invalid_channel');
    return { path: `/api/admin/wecom-publications/tasks/${identifier(args.taskId)}/retry`, options: { method: 'POST', json: { channel: args.channel, requestId: args.requestId } } };
  }
  if (operation !== 'schedule') throw new ClientError('unknown_operation');
  object(args, ['draftId', 'scheduledAt', 'requestId', 'targets']);
  identifier(args.draftId);
  requestId(args.requestId);
  if (typeof args.scheduledAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(args.scheduledAt) || !Number.isFinite(Date.parse(args.scheduledAt))) throw new ClientError('invalid_schedule_time', 'Provide an ISO time with an explicit timezone, such as 2030-01-01T09:00:00+08:00.');
  const localTime = args.scheduledAt.slice(0, 19);
  if (new Date(`${localTime}Z`).toISOString().slice(0, 19) !== localTime) throw new ClientError('invalid_schedule_time');
  if (!Array.isArray(args.targets) || args.targets.length < 1 || args.targets.length > 2) throw new ClientError('invalid_targets');
  const channels = new Set();
  for (const target of args.targets) {
    object(target, ['channel', 'audience']);
    if (!['group', 'auto'].includes(target.channel) || channels.has(target.channel)) throw new ClientError('invalid_channel');
    channels.add(target.channel);
    audience(target.audience);
  }
  return { path: '/api/admin/wecom-publications/tasks', options: { method: 'POST', json: args } };
}

async function readBoundedFile(path, maximum) {
  if (typeof path !== 'string' || !path || /[\x00-\x1f]/.test(path)) throw new ClientError('invalid_file_path');
  let file;
  try {
    const absolute = await realpath(resolve(path));
    if (!(await stat(absolute)).isFile()) throw new ClientError('invalid_file_size');
    file = await open(absolute, 'r');
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > maximum) throw new ClientError('invalid_file_size');
    const bytes = Buffer.alloc(maximum + 1);
    let size = 0;
    while (size <= maximum) {
      const result = await file.read(bytes, size, bytes.length - size, size);
      if (result.bytesRead === 0) break;
      size += result.bytesRead;
    }
    if (size < 1 || size > maximum) throw new ClientError('invalid_file_size');
    return bytes.subarray(0, size);
  } catch (error) {
    if (error instanceof ClientError) throw error;
    throw new ClientError('file_unavailable', 'The selected file could not be read.');
  } finally { await file?.close(); }
}
function decodeJson(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ClientError('invalid_publication_input', 'Input must be valid UTF-8 JSON.'); }
}
function imageType(name, bytes) {
  const extension = extname(name).toLowerCase();
  if (extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (['.jpg', '.jpeg'].includes(extension) && bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  throw new ClientError('invalid_image', 'Images must be PNG or JPEG files with the matching extension.');
}
export function validateDraftForm(form) {
  if (!(form instanceof FormData)) throw new ClientError('invalid_publication_input');
  const allowed = new Set(['title', 'digest', 'author', 'sourceUrl', 'html', 'cover', 'images']);
  for (const key of form.keys()) if (!allowed.has(key) || key !== 'images' && form.getAll(key).length !== 1) throw new ClientError('invalid_publication_input');
  text(form.get('title'), 128);
  text(form.get('digest'), 512);
  for (const [key, maximum] of [['author', 64], ['sourceUrl', 2048]]) if (form.has(key)) text(form.get(key), maximum, false);
  const html = form.get('html');
  const cover = form.get('cover');
  const images = form.getAll('images');
  if (!(html instanceof Blob) || html.size < 1 || html.size > MAX_HTML_BYTES || !(cover instanceof Blob) || cover.size < 5 || cover.size > MAX_COVER_BYTES || images.length > 10) throw new ClientError('invalid_file_size');
  if (images.some(image => !(image instanceof Blob) || image.size < 5 || image.size > MAX_IMAGE_BYTES)) throw new ClientError('invalid_file_size');
  const names = images.map(image => image.name);
  if (new Set(names).size !== names.length) throw new ClientError('duplicate_image_name');
}
export async function readPublicationInput(operation, inputPath) {
  const absolute = resolve(inputPath);
  const manifest = decodeJson(await readBoundedFile(absolute, MAX_INPUT_BYTES));
  if (operation !== 'draft') {
    publicationRequest(operation, manifest);
    return manifest;
  }
  object(manifest, ['title', 'digest', 'author', 'sourceUrl', 'html', 'cover', 'images']);
  text(manifest.title, 128);
  text(manifest.digest, 512);
  text(manifest.author, 64, false);
  text(manifest.sourceUrl, 2048, false);
  if (!Array.isArray(manifest.images) || manifest.images.length > 10) throw new ClientError('invalid_publication_input');
  const pathFor = value => {
    if (typeof value !== 'string' || !value || /[\x00-\x1f]/.test(value)) throw new ClientError('invalid_file_path');
    return resolve(dirname(absolute), value);
  };
  const form = new FormData();
  for (const key of ['title', 'digest', 'author', 'sourceUrl']) if (manifest[key] !== undefined) form.append(key, manifest[key]);
  const htmlPath = pathFor(manifest.html);
  const htmlBytes = await readBoundedFile(htmlPath, MAX_HTML_BYTES);
  try { new TextDecoder('utf-8', { fatal: true }).decode(htmlBytes); }
  catch { throw new ClientError('invalid_html', 'HTML must use UTF-8 encoding.'); }
  form.append('html', new Blob([htmlBytes], { type: 'text/html' }), basename(htmlPath));
  const files = [['cover', manifest.cover], ...manifest.images.map(path => ['images', path])];
  for (const [key, path] of files) {
    const filePath = pathFor(path);
    const bytes = await readBoundedFile(filePath, key === 'cover' ? MAX_COVER_BYTES : MAX_IMAGE_BYTES);
    form.append(key, new Blob([bytes], { type: imageType(filePath, bytes) }), basename(filePath));
  }
  validateDraftForm(form);
  return form;
}
