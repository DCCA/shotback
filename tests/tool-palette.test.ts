import { describe, expect, it } from "vitest";
import {
  activeSegment,
  DEFAULT_ANNOTATION_COLOR,
  hotkeyTool,
  isCustomColor,
  SWATCHES,
  TOOL_SEGMENTS
} from "@/lib/tool-palette";

describe("activeSegment", () => {
  it("lights Select in move mode, whatever tool was last drawn with", () => {
    expect(activeSegment("box", "move")).toBe("select");
    expect(activeSegment("crop", "move")).toBe("select");
  });

  it("lights the tool itself in draw mode", () => {
    expect(activeSegment("box", "draw")).toBe("box");
    expect(activeSegment("arrow", "draw")).toBe("arrow");
    expect(activeSegment("redact", "draw")).toBe("redact");
    expect(activeSegment("crop", "draw")).toBe("crop");
  });

  it("never lights a segment the palette does not render", () => {
    const values = TOOL_SEGMENTS.map((segment) => segment.value);
    for (const tool of ["box", "arrow", "text", "redact", "crop"] as const) {
      expect(values).toContain(activeSegment(tool, "draw"));
      expect(values).toContain(activeSegment(tool, "move"));
    }
  });
});

describe("hotkeyTool", () => {
  it("maps every segment's own key, in either case", () => {
    for (const segment of TOOL_SEGMENTS) {
      expect(hotkeyTool(segment.hotkey)).toBe(segment.value);
      expect(hotkeyTool(segment.hotkey.toLowerCase())).toBe(segment.value);
    }
  });

  it("ignores anything that is not a single character", () => {
    expect(hotkeyTool("Escape")).toBeNull();
    expect(hotkeyTool("Enter")).toBeNull();
    expect(hotkeyTool("Delete")).toBeNull();
    expect(hotkeyTool("")).toBeNull();
  });

  it("ignores unbound characters", () => {
    expect(hotkeyTool("z")).toBeNull();
    expect(hotkeyTool("1")).toBeNull();
  });

  it("binds one key to at most one segment", () => {
    const keys = TOOL_SEGMENTS.map((segment) => segment.hotkey.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("swatches", () => {
  it("defaults to the first swatch", () => {
    expect(DEFAULT_ANNOTATION_COLOR).toBe(SWATCHES[0].value);
    expect(DEFAULT_ANNOTATION_COLOR).toBe("#ef4444");
  });

  it("offers six distinct hex colours", () => {
    expect(SWATCHES).toHaveLength(6);
    expect(new Set(SWATCHES.map((swatch) => swatch.value)).size).toBe(6);
    for (const swatch of SWATCHES) expect(swatch.value).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("calls a colour custom only when it is not a swatch", () => {
    for (const swatch of SWATCHES) expect(isCustomColor(swatch.value)).toBe(false);
    // The native colour input reports uppercase on some platforms.
    expect(isCustomColor("#EF4444")).toBe(false);
    expect(isCustomColor("#123456")).toBe(true);
  });
});
