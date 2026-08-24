import { describe, expect, it } from "vitest";
import { commit, createHistory, redo, undo } from "../src/lib/history";

describe("history", () => {
  it("undo restores the previous state and redo re-applies it", () => {
    let h = createHistory([1]);
    h = commit(h, [1, 2]);
    h = undo(h);
    expect(h.present).toEqual([1]);
    h = redo(h);
    expect(h.present).toEqual([1, 2]);
  });

  it("a new commit clears the redo stack", () => {
    let h = commit(createHistory(0), 1);
    h = undo(h);
    h = commit(h, 5);
    expect(redo(h).present).toBe(5);
  });

  it("undo at the start and redo at the end are no-ops", () => {
    const h = createHistory("a");
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("drops the oldest entry past the limit", () => {
    let h = createHistory(0);
    for (let i = 1; i <= 101; i += 1) h = commit(h, i, 100);
    expect(h.past.length).toBe(100);
    expect(h.past[0]).toBe(1);
  });
});
