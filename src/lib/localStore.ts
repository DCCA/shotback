import type { Annotation } from "@/types/annotation";

export interface LocalShare {
  id: string;
  pageUrl: string;
  imageDataUrl: string;
  annotations: Annotation[];
  generalFeedback: string;
  createdAt: string;
}

const PREFIX = "share:";

function randomId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
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

export async function saveLocalShare(input: {
  pageUrl: string;
  imageDataUrl: string;
  annotations: Annotation[];
  generalFeedback: string;
}): Promise<LocalShare> {
  const id = randomId();
  const share: LocalShare = {
    id,
    pageUrl: input.pageUrl,
    imageDataUrl: input.imageDataUrl,
    annotations: input.annotations,
    generalFeedback: input.generalFeedback,
    createdAt: new Date().toISOString()
  };

  await setStorage({ [`${PREFIX}${id}`]: share });
  return share;
}

export async function getLocalShare(id: string): Promise<LocalShare | null> {
  return getStorage<LocalShare>(`${PREFIX}${id}`);
}

export function buildLocalShareUrl(id: string): string {
  return chrome.runtime.getURL(`viewer.html?share=${encodeURIComponent(id)}`);
}
