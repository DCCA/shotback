import type { Verbosity } from "@/lib/feedback";

/**
 * Small, versionless bag of user preferences that persist across sessions.
 * Grows by adding optional fields, never by renaming or removing one.
 */
export interface Prefs {
  promptVerbosity?: Verbosity;
  /** The image format `download` and the two package exports write. Fixed at 0.9 JPEG quality. */
  exportFormat?: "png" | "jpeg";
}

const STORAGE_KEY = "prefs";

function isPrefs(value: unknown): value is Prefs {
  return typeof value === "object" && value !== null;
}

/** Thin wrapper over `chrome.storage.local`; tolerates a missing or corrupt stored value. */
export function getPrefs(): Promise<Prefs> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const stored = result[STORAGE_KEY];
      resolve(isPrefs(stored) ? stored : {});
    });
  });
}

/** Merges `partial` onto whatever is already stored, so one caller's write never clobbers another's. */
export async function setPrefs(partial: Partial<Prefs>): Promise<void> {
  const current = await getPrefs();
  const next: Prefs = { ...current, ...partial };
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: next }, () => resolve());
  });
}
