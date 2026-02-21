import { beforeEach, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import {
  deleteLocalShare,
  getLocalShare,
  listLocalShares,
  pruneLocalShares,
  saveLocalShare
} from "../src/lib/localStore";
import { deleteImageBlob, getImageBlob, putImageBlob } from "@/lib/shareDb";

vi.mock("@/lib/shareDb", () => {
  const blobs = new Map<string, Blob>();
  return {
    putImageBlob: vi.fn(async (key: string, blob: Blob) => {
      blobs.set(key, blob);
    }),
    getImageBlob: vi.fn(async (key: string) => blobs.get(key) ?? null),
    deleteImageBlob: vi.fn(async (key: string) => {
      blobs.delete(key);
    })
  };
});

let storageState: Record<string, unknown>;
let nextSetError: string | null;

function installChromeMock(): void {
  const runtimeState: { lastError?: { message: string } } = {};
  (globalThis as unknown as { chrome: chrome }).chrome = {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      lastError: undefined
    },
    storage: {
      local: {
        get: (keys: string[] | string | null, callback: (items: Record<string, unknown>) => void) => {
          runtimeState.lastError = undefined;
          const all = { ...storageState };
          if (keys === null) {
            (globalThis as unknown as { chrome: chrome }).chrome.runtime.lastError = undefined;
            callback(all);
            return;
          }

          const keyList = Array.isArray(keys) ? keys : [keys];
          const picked: Record<string, unknown> = {};
          for (const key of keyList) {
            if (key in storageState) {
              picked[key] = storageState[key];
            }
          }
          (globalThis as unknown as { chrome: chrome }).chrome.runtime.lastError = undefined;
          callback(picked);
        },
        set: (items: Record<string, unknown>, callback: () => void) => {
          if (nextSetError) {
            (globalThis as unknown as { chrome: chrome }).chrome.runtime.lastError = {
              message: nextSetError
            };
            nextSetError = null;
            callback();
            return;
          }

          Object.assign(storageState, items);
          (globalThis as unknown as { chrome: chrome }).chrome.runtime.lastError = undefined;
          callback();
        },
        remove: (keys: string[] | string, callback: () => void) => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const key of keyList) {
            delete storageState[key];
          }
          (globalThis as unknown as { chrome: chrome }).chrome.runtime.lastError = undefined;
          callback();
        }
      }
    }
  } as unknown as chrome;
}

function createDataUrl(body: string): string {
  return `data:image/png;base64,${Buffer.from(body, "utf8").toString("base64")}`;
}

function setMetaRecord(params: {
  id: string;
  createdAt: string;
  blobKey?: string;
}): void {
  const key = `share:${params.id}`;
  storageState[key] = {
    id: params.id,
    pageUrl: "https://example.test",
    annotations: [],
    generalFeedback: "",
    createdAt: params.createdAt,
    imageBlobKey: params.blobKey ?? `share-image:${params.id}`,
    imageByteSize: 10,
    schemaVersion: 2
  };
}

describe("localStore", () => {
  beforeEach(() => {
    storageState = {};
    nextSetError = null;
    installChromeMock();
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-02-21T00:00:00.000Z").getTime());
  });

  it("saves and retrieves share via blob-backed storage", async () => {
    const dataUrl = createDataUrl("hello");
    const meta = await saveLocalShare({
      pageUrl: "https://example.test/page",
      imageDataUrl: dataUrl,
      annotations: [],
      generalFeedback: "note"
    });

    expect(meta.schemaVersion).toBe(2);
    const stored = storageState[`share:${meta.id}`] as Record<string, unknown>;
    expect(stored.imageDataUrl).toBeUndefined();
    expect(putImageBlob).toHaveBeenCalledTimes(1);

    const resolved = await getLocalShare(meta.id);
    expect(resolved?.imageDataUrl).toBe(dataUrl);
    expect(resolved?.pageUrl).toBe("https://example.test/page");
    expect(getImageBlob).toHaveBeenCalledTimes(1);
  });

  it("migrates legacy inlined image records on read", async () => {
    const id = "legacy-1";
    const dataUrl = createDataUrl("legacy");
    storageState[`share:${id}`] = {
      id,
      pageUrl: "https://legacy.test",
      imageDataUrl: dataUrl,
      annotations: [],
      generalFeedback: "",
      createdAt: "2026-02-20T00:00:00.000Z"
    };

    const resolved = await getLocalShare(id);
    expect(resolved?.imageDataUrl).toBe(dataUrl);

    const migrated = storageState[`share:${id}`] as Record<string, unknown>;
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.imageDataUrl).toBeUndefined();
    expect(putImageBlob).toHaveBeenCalledTimes(1);
  });

  it("rolls back blob write on metadata set failure", async () => {
    nextSetError = "set failed";
    await expect(
      saveLocalShare({
        pageUrl: "https://example.test",
        imageDataUrl: createDataUrl("oops"),
        annotations: [],
        generalFeedback: ""
      })
    ).rejects.toThrow("set failed");
    expect(deleteImageBlob).toHaveBeenCalledTimes(1);
  });

  it("prunes old and over-limit shares", async () => {
    setMetaRecord({ id: "a", createdAt: "2025-12-01T00:00:00.000Z" });
    setMetaRecord({ id: "b", createdAt: "2026-02-01T00:00:00.000Z" });
    setMetaRecord({ id: "c", createdAt: "2026-02-10T00:00:00.000Z" });
    await putImageBlob("share-image:a", new Blob(["a"], { type: "image/png" }));
    await putImageBlob("share-image:b", new Blob(["b"], { type: "image/png" }));
    await putImageBlob("share-image:c", new Blob(["c"], { type: "image/png" }));

    const result = await pruneLocalShares({ maxCount: 1, maxAgeDays: 30 });
    expect(result.deletedCount).toBe(2);
    expect(storageState["share:a"]).toBeUndefined();
    expect(storageState["share:b"]).toBeUndefined();
    expect(storageState["share:c"]).toBeTruthy();
  });

  it("lists shares newest first and deletes share payload with metadata", async () => {
    setMetaRecord({ id: "x", createdAt: "2026-02-10T00:00:00.000Z" });
    setMetaRecord({ id: "y", createdAt: "2026-02-20T00:00:00.000Z" });
    await putImageBlob("share-image:x", new Blob(["x"], { type: "image/png" }));
    await putImageBlob("share-image:y", new Blob(["y"], { type: "image/png" }));

    const list = await listLocalShares();
    expect(list.map((item) => item.id)).toEqual(["y", "x"]);

    await deleteLocalShare("x");
    expect(storageState["share:x"]).toBeUndefined();
    expect(deleteImageBlob).toHaveBeenCalledWith("share-image:x");
  });
});
