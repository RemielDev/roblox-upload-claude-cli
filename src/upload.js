import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { recordUpload, log } from './db.js';

const ASSETS_API = 'https://apis.roblox.com/assets/v1/assets';
const OPERATIONS_API = 'https://apis.roblox.com/assets/v1/operations';

const EXT_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.tga': 'image/tga',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.fbx': 'model/fbx',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

const EXT_TO_ASSET_TYPE = {
  '.png': 'Decal',
  '.jpg': 'Decal',
  '.jpeg': 'Decal',
  '.bmp': 'Decal',
  '.tga': 'Decal',
  '.mp3': 'Audio',
  '.ogg': 'Audio',
  '.fbx': 'Model',
  '.mp4': 'Video',
  '.mov': 'Video',
};

function inferAssetType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_ASSET_TYPE[ext];
}

function inferMime(filePath) {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

export function getApiKey() {
  const key = process.env.ROBLOX_API_KEY;
  if (!key || !key.trim()) {
    const msg = [
      '',
      'ROBLOX_API_KEY is not set.',
      '',
      'This tool deliberately does NOT persist the API key. Each new shell',
      'session must export it explicitly.',
      '',
      'Get a key at: https://create.roblox.com/dashboard/credentials',
      '  - Add the "Assets" API system to it',
      '  - Grant Read + Write',
      '  - Add your current public IP to the allowlist (or 0.0.0.0/0 for testing)',
      '',
      'Then in PowerShell:   $env:ROBLOX_API_KEY = "<your-key>"',
      'Or in bash:           export ROBLOX_API_KEY=<your-key>',
      '',
    ].join('\n');
    throw new Error(msg);
  }
  return key.trim();
}

export function getCreator(creatorArg) {
  const raw = creatorArg ?? process.env.ROBLOX_CREATOR;
  if (!raw) {
    throw new Error(
      'No creator specified. Pass --creator user:<userId> or group:<groupId>, ' +
      'or set ROBLOX_CREATOR env var.'
    );
  }
  const [type, id] = raw.split(':');
  const t = type?.toLowerCase();
  if (!id || (t !== 'user' && t !== 'group')) {
    throw new Error(`Invalid creator "${raw}". Format: user:<id> or group:<id>`);
  }
  return t === 'user'
    ? { type: 'User', id, payload: { userId: id } }
    : { type: 'Group', id, payload: { groupId: id } };
}

async function pollOperation(apiKey, operationId, { timeoutMs = 60000, intervalMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${OPERATIONS_API}/${operationId}`, {
      headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Operation poll failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    if (data.done) {
      if (data.error) {
        throw new Error(`Operation errored: ${JSON.stringify(data.error)}`);
      }
      const assetId = data.response?.assetId;
      if (!assetId) {
        throw new Error(`Operation completed without assetId: ${JSON.stringify(data)}`);
      }
      return { assetId, response: data.response };
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Operation ${operationId} timed out after ${timeoutMs}ms`);
}

export async function uploadAsset(filePath, opts = {}) {
  const started = Date.now();
  const apiKey = getApiKey();
  const creator = getCreator(opts.creator);

  const assetType = opts.assetType ?? inferAssetType(filePath);
  if (!assetType) {
    throw new Error(`Unsupported file extension: ${extname(filePath)} (${filePath})`);
  }
  const mime = inferMime(filePath);
  const filename = basename(filePath);
  const displayName = opts.name ?? filename.replace(extname(filename), '');
  const description = opts.description ?? '';
  const fileSize = statSync(filePath).size;

  const requestPayload = {
    assetType,
    displayName,
    description,
    creationContext: { creator: creator.payload },
  };

  const fileBuffer = readFileSync(filePath);
  const form = new FormData();
  form.append('request', JSON.stringify(requestPayload));
  form.append('fileContent', new Blob([fileBuffer], { type: mime }), filename);

  const res = await fetch(ASSETS_API, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    const err = `Upload request failed (${res.status}): ${body}`;
    recordUpload({
      filename, file_path: filePath, file_size: fileSize, asset_type: assetType,
      status: 'failed', error: err, display_name: displayName, description,
      creator_type: creator.type, creator_id: creator.id,
      duration_ms: Date.now() - started, session_label: opts.sessionLabel,
    });
    log('error', 'upload_request_failed', { file: filePath, status: res.status, body });
    throw new Error(err);
  }

  const initial = await res.json();
  const operationId = initial.operationId ?? initial.path?.split('/').pop();
  if (!operationId) {
    const err = `Could not extract operationId from response: ${JSON.stringify(initial)}`;
    recordUpload({
      filename, file_path: filePath, file_size: fileSize, asset_type: assetType,
      status: 'failed', error: err, display_name: displayName, description,
      creator_type: creator.type, creator_id: creator.id,
      duration_ms: Date.now() - started, session_label: opts.sessionLabel,
    });
    throw new Error(err);
  }

  try {
    const { assetId, response } = await pollOperation(apiKey, operationId, {
      timeoutMs: opts.timeoutMs ?? 90000,
    });
    recordUpload({
      filename, file_path: filePath, file_size: fileSize, asset_type: assetType,
      asset_id: assetId, operation_id: operationId, status: 'success',
      display_name: displayName, description,
      creator_type: creator.type, creator_id: creator.id,
      duration_ms: Date.now() - started, session_label: opts.sessionLabel,
    });
    log('info', 'upload_success', { file: filePath, assetId });
    return { assetId, operationId, response, filename };
  } catch (e) {
    recordUpload({
      filename, file_path: filePath, file_size: fileSize, asset_type: assetType,
      operation_id: operationId, status: 'failed', error: e.message,
      display_name: displayName, description,
      creator_type: creator.type, creator_id: creator.id,
      duration_ms: Date.now() - started, session_label: opts.sessionLabel,
    });
    log('error', 'upload_polling_failed', { file: filePath, operationId, error: e.message });
    throw e;
  }
}
