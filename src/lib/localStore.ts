import type { Annotation } from "@/types/annotation";
import { deleteImageBlob, getImageBlob, putImageBlob } from "@/lib/shareDb";

export interface LocalShare {
  id: string;
  pageUrl: string;
  imageDataUrl: string;
  annotations: Annotation[];
  generalFeedback: string;
  createdAt: string;
}

export interface LocalShareMeta {
  id: string;
  pageUrl: string;
  annotations: Annotation[];
  generalFeedback: string;
  createdAt: string;
  imageBlobKey: string;
  imageByteSize: number;
  schemaVersion: 2;
}

interface LegacyLocalShareRecord {
  id: string;
  pageUrl: string;
  imageDataUrl: string;
  annotations: Annotation[];
  generalFeedback: string;
  createdAt: string;
}

export interface ShareRetentionPolicy {
  maxCount: number;
  maxAgeDays: number;
}

const PREFIX = "share:";
const SCHEMA_VERSION = 2;

export const DEFAULT_RETENTION_POLICY: ShareRetentionPolicy = {
  maxCount: 50,
  maxAgeDays: 30
};

function randomId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function imageBlobKey(id: string): string {
  return `share-image:${id}`;
}

function setStorage(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

function removeStorage(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

function getStorage<T>(key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve((result[key] as T | undefined) ?? null);
    });
  });
}

function getAllStorage(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(result);
    });
  });
}

function isV2Meta(value: unknown): value is LocalShareMeta {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === SCHEMA_VERSION &&
    typeof record.id === "string" &&
    typeof record.imageBlobKey === "string" &&
    typeof record.createdAt === "string"
  );
}

function isLegacyRecord(value: unknown): value is LegacyLocalShareRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.imageDataUrl === "string" &&
    typeof record.createdAt === "string"
  );
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  if (parts.length !== 2) {
    throw new Error("Invalid image data format");
  }

  const mimeMatch = parts[0].match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] ?? "application/octet-stream";
  const binary = decodeBase64(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function decodeBase64(input: string): string {
  if (typeof atob === "function") {
    return atob(input);
  }
  const bufferCtor = (globalThis as unknown as {
    Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } };
  }).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(input, "base64").toString("binary");
  }
  throw new Error("Base64 decoder not available");
}

function encodeBase64(binary: string): string {
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  const bufferCtor = (globalThis as unknown as {
    Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } };
  }).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(binary, "binary").toString("base64");
  }
  throw new Error("Base64 encoder not available");
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = encodeBase64(binary);
  return `data:${blob.type || "application/octet-stream"};base64,${base64}`;
}

function parseIsoDate(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function shareStorageKey(id: string): string {
  return `${PREFIX}${id}`;
}

function toLocalShareMeta(id: string, input: {
  pageUrl: string;
  annotations: Annotation[];
  generalFeedback: string;
  createdAt: string;
  blobKey: string;
  imageByteSize: number;
}): LocalShareMeta {
  return {
    id,
    pageUrl: input.pageUrl,
    annotations: input.annotations,
    generalFeedback: input.generalFeedback,
    createdAt: input.createdAt,
    imageBlobKey: input.blobKey,
    imageByteSize: input.imageByteSize,
    schemaVersion: SCHEMA_VERSION
  };
}

async function migrateLegacyRecord(key: string, legacy: LegacyLocalShareRecord): Promise<LocalShareMeta> {
  const blob = dataUrlToBlob(legacy.imageDataUrl);
  const blobKey = imageBlobKey(legacy.id);
  await putImageBlob(blobKey, blob);
  const meta = toLocalShareMeta(legacy.id, {
    pageUrl: legacy.pageUrl,
    annotations: legacy.annotations,
    generalFeedback: legacy.generalFeedback,
    createdAt: legacy.createdAt,
    blobKey,
    imageByteSize: blob.size
  });
  await setStorage({ [key]: meta });
  return meta;
}

async function readLocalShareMeta(id: string): Promise<LocalShareMeta | null> {
  const key = shareStorageKey(id);
  const record = await getStorage<unknown>(key);
  if (!record) return null;
  if (isV2Meta(record)) return record;
  if (isLegacyRecord(record)) {
    return migrateLegacyRecord(key, record);
  }

  throw new Error("Share record has unsupported format");
}

function getMetaEntries(items: Record<string, unknown>): Array<{ key: string; meta: LocalShareMeta }> {
  const entries: Array<{ key: string; meta: LocalShareMeta }> = [];
  for (const [key, value] of Object.entries(items)) {
    if (!key.startsWith(PREFIX)) continue;
    if (!isV2Meta(value)) continue;
    entries.push({ key, meta: value });
  }
  return entries;
}

async function deleteShareByMeta(meta: LocalShareMeta): Promise<void> {
  await removeStorage([shareStorageKey(meta.id)]);
  await deleteImageBlob(meta.imageBlobKey).catch(() => undefined);
}

export async function saveLocalShare(input: {
  pageUrl: string;
  imageDataUrl: string;
  annotations: Annotation[];
  generalFeedback: string;
}): Promise<LocalShareMeta> {
  const id = randomId();
  const createdAt = new Date().toISOString();
  const blob = dataUrlToBlob(input.imageDataUrl);
  const blobKey = imageBlobKey(id);
  const meta = toLocalShareMeta(id, {
    pageUrl: input.pageUrl,
    annotations: input.annotations,
    generalFeedback: input.generalFeedback,
    createdAt,
    blobKey,
    imageByteSize: blob.size
  });

  await putImageBlob(blobKey, blob);
  try {
    await setStorage({ [shareStorageKey(id)]: meta });
  } catch (error) {
    await deleteImageBlob(blobKey).catch(() => undefined);
    throw error;
  }

  await pruneLocalShares();
  return meta;
}

export async function getLocalShare(id: string): Promise<LocalShare | null> {
  const meta = await readLocalShareMeta(id);
  if (!meta) return null;

  const blob = await getImageBlob(meta.imageBlobKey);
  if (!blob) {
    throw new Error("Share image data is missing");
  }

  return {
    id: meta.id,
    pageUrl: meta.pageUrl,
    annotations: meta.annotations,
    generalFeedback: meta.generalFeedback,
    createdAt: meta.createdAt,
    imageDataUrl: await blobToDataUrl(blob)
  };
}

export async function deleteLocalShare(id: string): Promise<void> {
  const meta = await readLocalShareMeta(id);
  if (!meta) return;
  await deleteShareByMeta(meta);
}

export async function listLocalShares(): Promise<LocalShareMeta[]> {
  const items = await getAllStorage();
  const entries = getMetaEntries(items);
  return entries
    .map((entry) => entry.meta)
    .sort((a, b) => parseIsoDate(b.createdAt) - parseIsoDate(a.createdAt));
}

export async function pruneLocalShares(
  policy: ShareRetentionPolicy = DEFAULT_RETENTION_POLICY
): Promise<{ deletedCount: number }> {
  const items = await getAllStorage();
  const entries = getMetaEntries(items);
  const now = Date.now();
  const maxAgeMs = Math.max(0, policy.maxAgeDays) * 24 * 60 * 60 * 1000;
  const sortedOldestFirst = [...entries].sort(
    (a, b) => parseIsoDate(a.meta.createdAt) - parseIsoDate(b.meta.createdAt)
  );

  const toDelete = new Map<string, LocalShareMeta>();
  for (const entry of sortedOldestFirst) {
    const ageMs = now - parseIsoDate(entry.meta.createdAt);
    if (maxAgeMs > 0 && ageMs > maxAgeMs) {
      toDelete.set(entry.meta.id, entry.meta);
    }
  }

  const maxCount = Math.max(0, policy.maxCount);
  let remaining = sortedOldestFirst.length - toDelete.size;
  if (maxCount >= 0 && remaining > maxCount) {
    for (const entry of sortedOldestFirst) {
      if (toDelete.has(entry.meta.id)) continue;
      toDelete.set(entry.meta.id, entry.meta);
      remaining -= 1;
      if (remaining <= maxCount) break;
    }
  }

  for (const meta of toDelete.values()) {
    await deleteShareByMeta(meta);
  }

  return { deletedCount: toDelete.size };
}

export function buildLocalShareUrl(id: string): string {
  return chrome.runtime.getURL(`viewer.html?share=${encodeURIComponent(id)}`);
}
