import { CONFIG_FILENAME, REBALANCE_FILENAME } from '../config/google';
import { getAccessToken } from './googleAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

async function driveRequest(path, opts = {}) {
  const token = getAccessToken();
  const res = await fetch(DRIVE_API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  return res;
}

async function findFileId(filename) {
  const res = await driveRequest(
    `/files?spaces=appDataFolder&q=name%3D'${filename}'&fields=files(id)`
  );
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function findConfigFileId() {
  return findFileId(CONFIG_FILENAME);
}

async function saveJsonFile(filename, data) {
  const fileId = await findFileId(filename);
  const metadata = {
    name: filename,
    ...(fileId ? {} : { parents: ['appDataFolder'] }),
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('media', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const url = fileId
    ? `${UPLOAD_API}/files/${fileId}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;
  const token = getAccessToken();
  const res = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Drive save ${res.status}: ${await res.text()}`);
}

export async function loadFundConfig() {
  const fileId = await findConfigFileId();
  if (!fileId) return [];
  const res = await driveRequest(`/files/${fileId}?alt=media`);
  return res.json();
}

export async function saveFundConfig(funds) {
  return saveJsonFile(CONFIG_FILENAME, funds);
}

export async function loadRebalancePlan() {
  const fileId = await findFileId(REBALANCE_FILENAME);
  if (!fileId) return {};
  const res = await driveRequest(`/files/${fileId}?alt=media`);
  return res.json();
}

export async function saveRebalancePlan(plan) {
  return saveJsonFile(REBALANCE_FILENAME, plan);
}
