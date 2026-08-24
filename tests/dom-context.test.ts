import { describe, expect, it } from "vitest";
import { cssPath, type ElementLike } from "../src/lib/dom-context";

function el(partial: Partial<ElementLike> & { tagName: string }): ElementLike {
  return {
    id: "",
    classList: [],
    parent: null,
    indexOfType: 1,
    siblingsOfTypeCount: 1,
    attributes: {},
    ...partial
  };
}

/** Build a parent-linked chain from the outermost element to the innermost. */
function chain(...elements: ElementLike[]): ElementLike {
  for (let i = 1; i < elements.length; i += 1) elements[i].parent = elements[i - 1];
  return elements[elements.length - 1];
}

describe("cssPath", () => {
  it("anchors on the nearest id and stops the walk there", () => {
    const leaf = chain(
      el({ tagName: "BODY" }),
      el({ tagName: "DIV", id: "pricing" }),
      el({ tagName: "DIV", classList: ["card"], indexOfType: 2, siblingsOfTypeCount: 3 }),
      el({ tagName: "BUTTON", classList: ["cta"] })
    );

    expect(cssPath(leaf)).toBe("#pricing > div.card:nth-of-type(2) > button.cta");
  });

  it("uses only the first two classes of a segment", () => {
    const leaf = el({ tagName: "SPAN", classList: ["a", "b", "c", "d"] });

    expect(cssPath(leaf)).toBe("span.a.b");
  });

  it("adds nth-of-type only when the element has same-tag siblings", () => {
    const only = el({ tagName: "LI", indexOfType: 1, siblingsOfTypeCount: 1 });
    const oneOfMany = el({ tagName: "LI", indexOfType: 3, siblingsOfTypeCount: 4 });

    expect(cssPath(only)).toBe("li");
    expect(cssPath(oneOfMany)).toBe("li:nth-of-type(3)");
  });

  it("keeps at most five levels, nearest to the element", () => {
    const elements = Array.from({ length: 8 }, (_, i) => el({ tagName: `T${i}` }));
    const leaf = chain(...elements);

    expect(cssPath(leaf)).toBe("t3 > t4 > t5 > t6 > t7");
  });
});
