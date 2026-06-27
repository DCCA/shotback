import { describe, expect, it, vi } from "vitest";
import {
  activateTab,
  buildScrollSteps,
  isNoReceiverError,
  isTabsBusyError,
  sendToContentScript
} from "../src/lib/capture";

describe("buildScrollSteps", () => {
  it("returns single step when content fits viewport", () => {
    expect(buildScrollSteps(600, 900)).toEqual([0]);
  });

  it("includes final aligned step", () => {
    expect(buildScrollSteps(2500, 1000)).toEqual([0, 1000, 1500]);
  });

  it("does not duplicate last step", () => {
    expect(buildScrollSteps(3000, 1000)).toEqual([0, 1000, 2000]);
  });
});

describe("isNoReceiverError", () => {
  it("matches the content-script-not-ready errors", () => {
    expect(
      isNoReceiverError(new Error("Could not establish connection. Receiving end does not exist."))
    ).toBe(true);
    expect(isNoReceiverError(new Error("Receiving end does not exist"))).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isNoReceiverError(new Error("Cannot access a chrome:// URL"))).toBe(false);
  });
});

describe("sendToContentScript", () => {
  function stubChrome(sendMessage: ReturnType<typeof vi.fn>) {
    const executeScript = vi.fn().mockResolvedValue(undefined);
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { sendMessage },
      scripting: { executeScript }
    };
    return { executeScript };
  }

  it("returns the response on the first try", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    stubChrome(sendMessage);
    await expect(sendToContentScript(1, { type: "X" }, { delayMs: 0 })).resolves.toEqual({
      ok: true
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("re-injects and retries when the receiver is not ready, then succeeds", async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Could not establish connection. Receiving end does not exist.")
      )
      .mockRejectedValueOnce(new Error("Receiving end does not exist"))
      .mockResolvedValue({ ok: true });
    const { executeScript } = stubChrome(sendMessage);

    await expect(sendToContentScript(1, { type: "X" }, { delayMs: 0 })).resolves.toEqual({
      ok: true
    });
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(executeScript).toHaveBeenCalledTimes(2);
  });

  it("rethrows non-receiver errors immediately without retrying", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("Cannot access a chrome:// URL"));
    stubChrome(sendMessage);
    await expect(sendToContentScript(1, { type: "X" }, { delayMs: 0 })).rejects.toThrow(
      "chrome://"
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("Receiving end does not exist"));
    stubChrome(sendMessage);
    await expect(sendToContentScript(1, { type: "X" }, { retries: 2, delayMs: 0 })).rejects.toThrow(
      "Receiving end does not exist"
    );
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });
});

describe("isTabsBusyError", () => {
  it("matches the transient tab-strip-locked errors", () => {
    expect(
      isTabsBusyError(new Error("Tabs cannot be edited right now (user may be dragging a tab)."))
    ).toBe(true);
    expect(isTabsBusyError(new Error("User may be dragging a tab"))).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isTabsBusyError(new Error("No tab with id: 7"))).toBe(false);
  });
});

describe("activateTab", () => {
  function stubTabsUpdate(update: ReturnType<typeof vi.fn>) {
    (globalThis as unknown as { chrome: unknown }).chrome = { tabs: { update } };
  }

  it("activates on the first try", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    stubTabsUpdate(update);
    await expect(activateTab(5, { delayMs: 0 })).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith(5, { active: true });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("retries while the tab strip is busy, then succeeds", async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Tabs cannot be edited right now (user may be dragging a tab).")
      )
      .mockRejectedValueOnce(new Error("Tabs cannot be edited right now"))
      .mockResolvedValue(undefined);
    stubTabsUpdate(update);
    await expect(activateTab(5, { delayMs: 0 })).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(3);
  });

  it("rethrows unrelated errors immediately", async () => {
    const update = vi.fn().mockRejectedValue(new Error("No tab with id: 5"));
    stubTabsUpdate(update);
    await expect(activateTab(5, { delayMs: 0 })).rejects.toThrow("No tab with id");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries", async () => {
    const update = vi.fn().mockRejectedValue(new Error("Tabs cannot be edited right now"));
    stubTabsUpdate(update);
    await expect(activateTab(5, { retries: 2, delayMs: 0 })).rejects.toThrow(
      "Tabs cannot be edited right now"
    );
    expect(update).toHaveBeenCalledTimes(3);
  });
});
