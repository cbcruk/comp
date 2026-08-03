import type { ManyToManySummary } from "@comp/core";
import { describe, expect, it } from "vitest";
import { changedLinks, isLinked, linksChanged, toggleLink } from "./links.js";

const relations: ManyToManySummary[] = [
  { name: "tags", collection: "tags", targetKey: "id", labelField: "name" },
  { name: "authors", collection: "authors", targetKey: "id", labelField: "name" },
];

describe("comparing links", () => {
  it("treats a number and its text as the same link", () => {
    // The server sends numbers; a checkbox's value is a string. Comparing them
    // with === leaves boxes unticked next to links that exist.
    expect(isLinked([1, 2], "1")).toBe(true);
    expect(isLinked(["1", "2"], 1)).toBe(true);
    expect(isLinked([1, 2], 3)).toBe(false);
  });

  it("adds and removes on toggle", () => {
    expect(toggleLink([1, 2], "3")).toEqual([1, 2, "3"]);
    expect(toggleLink([1, 2], "2")).toEqual([1]);
  });

  it("ignores order when deciding whether a set moved", () => {
    expect(linksChanged([1, 2], [2, 1])).toBe(false);
    expect(linksChanged([1, 2], [1])).toBe(true);
    expect(linksChanged([1], ["1"])).toBe(false);
  });
});

describe("what a save sends", () => {
  it("sends only the relationships whose membership moved", () => {
    // Omission is meaningful: the server leaves a set it was not told about
    // alone, so sending every set would rewrite join rows an edit never
    // touched.
    const payload = changedLinks(
      relations,
      { tags: [1, 2], authors: [7] },
      { tags: [2], authors: [7] },
    );
    expect(payload).toEqual({ tags: [2] });
  });

  it("sends an emptied set, because clearing is a change", () => {
    expect(changedLinks(relations, { tags: [1] }, { tags: [] })).toEqual({
      tags: [],
    });
  });

  it("says nothing about a relationship the form never loaded", () => {
    expect(changedLinks(relations, { tags: [1] }, {})).toEqual({});
  });
});
