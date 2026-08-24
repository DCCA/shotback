import { beforeEach, describe, expect, it } from "vitest";
import { getPrefs, setPrefs } from "../src/lib/prefs";

// Records every get/set call so a test can assert both what was stored and
// what the module asked the API for, without exercising real chrome.storage.
let storageState: Record<string, unknown>;
let getCalls: Array<string[] | null>;
let setCalls: Array<Record<string, unknown>>;

function installChromeMock(initial: Record<string, unknown> = {}): void {
  storageState = { ...initial };
  getCalls = [];
  setCalls = [];
  (globalThis as unknown as { chrome: typeof chrome }).chrome = {
    storage: {
      local: {
        get: (keys: string[] | null, callback: (items: Record<string, unknown>) => void) => {
          getCalls.push(keys);
          const keyList = keys ?? Object.keys(storageState);
          const picked: Record<string, unknown> = {};
          for (const key of keyList) {
            if (key in storageState) picked[key] = storageState[key];
          }
          callback(picked);
        },
        set: (items: Record<string, unknown>, callback: () => void) => {
          setCalls.push(items);
          Object.assign(storageState, items);
          callback();
        }
      }
    }
  } as unknown as typeof chrome;
}

beforeEach(() => {
  installChromeMock();
});

describe("getPrefs", () => {
  it("returns an empty object when nothing is stored", async () => {
    expect(await getPrefs()).toEqual({});
    expect(getCalls).toEqual([["prefs"]]);
  });

  it("returns the stored prefs", async () => {
    installChromeMock({ prefs: { promptVerbosity: "detailed" } });
    expect(await getPrefs()).toEqual({ promptVerbosity: "detailed" });
  });

  it("tolerates a corrupt stored value", async () => {
    installChromeMock({ prefs: "not an object" });
    expect(await getPrefs()).toEqual({});
  });

  it("tolerates a null stored value", async () => {
    installChromeMock({ prefs: null });
    expect(await getPrefs()).toEqual({});
  });
});

describe("setPrefs", () => {
  it("writes under the prefs key", async () => {
    await setPrefs({ promptVerbosity: "compact" });
    expect(setCalls).toEqual([{ prefs: { promptVerbosity: "compact" } }]);
    expect(storageState.prefs).toEqual({ promptVerbosity: "compact" });
  });

  it("merges onto the existing stored value rather than replacing it", async () => {
    installChromeMock({ prefs: { promptVerbosity: "detailed" } });
    await setPrefs({ promptVerbosity: "compact" });
    expect(await getPrefs()).toEqual({ promptVerbosity: "compact" });
  });

  it("merges onto a corrupt stored value instead of throwing", async () => {
    installChromeMock({ prefs: "garbage" });
    await setPrefs({ promptVerbosity: "standard" });
    expect(await getPrefs()).toEqual({ promptVerbosity: "standard" });
  });
});

describe("exportFormat", () => {
  it("round-trips through getPrefs/setPrefs", async () => {
    await setPrefs({ exportFormat: "jpeg" });
    expect(await getPrefs()).toEqual({ exportFormat: "jpeg" });
  });

  it("merges onto an existing promptVerbosity pref rather than replacing it", async () => {
    installChromeMock({ prefs: { promptVerbosity: "detailed" } });
    await setPrefs({ exportFormat: "jpeg" });
    expect(await getPrefs()).toEqual({ promptVerbosity: "detailed", exportFormat: "jpeg" });
  });
});
