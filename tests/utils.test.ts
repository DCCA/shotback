import { describe, expect, it } from "vitest";
import { plural } from "../src/lib/utils";

describe("plural", () => {
  it("uses the singular for exactly one", () => {
    expect(plural(1, "note")).toBe("1 note");
  });

  it("uses the plural for none and for many - the '1 notes' bug in both directions", () => {
    expect(plural(0, "note")).toBe("0 notes");
    expect(plural(2, "note")).toBe("2 notes");
    expect(plural(11, "redacted region")).toBe("11 redacted regions");
  });

  it("takes an explicit plural for words that do not just take an s", () => {
    expect(plural(1, "entry", "entries")).toBe("1 entry");
    expect(plural(3, "entry", "entries")).toBe("3 entries");
  });
});
