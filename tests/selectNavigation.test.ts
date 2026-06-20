import { describe, expect, it } from "vitest";
import { getNextIndex, matchTypeahead } from "../src/lib/selectNavigation";

describe("getNextIndex", () => {
  it("moves down and clamps at the last option", () => {
    expect(getNextIndex(0, 3, "ArrowDown")).toBe(1);
    expect(getNextIndex(2, 3, "ArrowDown")).toBe(2);
  });

  it("moves up and clamps at the first option", () => {
    expect(getNextIndex(2, 3, "ArrowUp")).toBe(1);
    expect(getNextIndex(0, 3, "ArrowUp")).toBe(0);
  });

  it("opens to the first item on ArrowDown and last on ArrowUp when nothing is active", () => {
    expect(getNextIndex(-1, 3, "ArrowDown")).toBe(0);
    expect(getNextIndex(-1, 3, "ArrowUp")).toBe(2);
  });

  it("jumps to the ends with Home and End", () => {
    expect(getNextIndex(1, 3, "Home")).toBe(0);
    expect(getNextIndex(1, 3, "End")).toBe(2);
  });

  it("returns -1 for an empty list", () => {
    expect(getNextIndex(0, 0, "ArrowDown")).toBe(-1);
  });
});

describe("matchTypeahead", () => {
  const labels = ["Box", "Arrow", "Text"];

  it("matches a prefix case-insensitively", () => {
    expect(matchTypeahead(labels, "ar", 0)).toBe(1);
    expect(matchTypeahead(labels, "T", 0)).toBe(2);
  });

  it("searches circularly from the given index", () => {
    // Two options start with the same letter; search wraps past `from`.
    expect(matchTypeahead(["Apple", "Banana", "Apricot"], "a", 1)).toBe(2);
    expect(matchTypeahead(["Apple", "Banana", "Apricot"], "a", 0)).toBe(0);
  });

  it("returns -1 when nothing matches or query is empty", () => {
    expect(matchTypeahead(labels, "z", 0)).toBe(-1);
    expect(matchTypeahead(labels, "", 0)).toBe(-1);
    expect(matchTypeahead([], "a", 0)).toBe(-1);
  });
});
