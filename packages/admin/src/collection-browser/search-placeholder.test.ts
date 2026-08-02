import type { ResolvedSearch } from "@comp/core";
import { describe, expect, it } from "vitest";
import { describeSearchField, searchPlaceholder } from "./search-placeholder.js";

const summary = (search: ResolvedSearch[]): { labelPlural: string; search: ResolvedSearch[] } => ({
  labelPlural: "Posts",
  search,
});

describe("describeSearchField", () => {
  it("names the field, and how it matches when that is not the default", () => {
    expect(describeSearchField({ field: "title", lookup: "contains" })).toBe("title");
    expect(describeSearchField({ field: "slug", lookup: "startswith" })).toBe(
      "slug (starts with)",
    );
    expect(describeSearchField({ field: "code", lookup: "exact" })).toBe("code (exact)");
  });

  it("shows where a traversal lands", () => {
    expect(
      describeSearchField({
        field: "authorId",
        lookup: "contains",
        through: { table: "authors", field: "name" },
      }),
    ).toBe("authorId → name");
  });
});

describe("searchPlaceholder", () => {
  it("says what the box actually searches", () => {
    expect(
      searchPlaceholder(
        summary([
          { field: "title", lookup: "contains" },
          {
            field: "authorId",
            lookup: "contains",
            through: { table: "authors", field: "name" },
          },
        ]),
      ),
    ).toBe("Search title, authorId → name");
  });

  it("falls back to the collection's name when nothing is searchable", () => {
    expect(searchPlaceholder(summary([]))).toBe("Search Posts");
  });
});
