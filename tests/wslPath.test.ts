import { describe, expect, it } from "vitest";
import { toClaudePath } from "../src/lib/wslPath";

describe("toClaudePath", () => {
  it("translates a Windows drive path to its /mnt mount", () => {
    expect(toClaudePath("C:\\Users\\dcca\\Downloads\\shotback\\cap.png")).toBe(
      "/mnt/c/Users/dcca/Downloads/shotback/cap.png"
    );
  });

  it("lowercases the drive letter", () => {
    expect(toClaudePath("D:\\work\\img.png")).toBe("/mnt/d/work/img.png");
  });

  it("handles forward-slash Windows paths", () => {
    expect(toClaudePath("C:/Users/dcca/x.png")).toBe("/mnt/c/Users/dcca/x.png");
  });

  it("normalizes mixed separators", () => {
    expect(toClaudePath("E:\\a/b\\c.png")).toBe("/mnt/e/a/b/c.png");
  });

  it("passes through POSIX paths unchanged", () => {
    expect(toClaudePath("/home/dcca/Downloads/shotback/cap.png")).toBe(
      "/home/dcca/Downloads/shotback/cap.png"
    );
  });

  it("leaves non-drive strings unchanged", () => {
    expect(toClaudePath("shotback/cap.png")).toBe("shotback/cap.png");
  });
});
