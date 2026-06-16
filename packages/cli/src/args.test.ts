import { describe, expect, it } from "vitest";
import { listFlag, parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("collects positionals and flag forms", () => {
    const { _, flags } = parseArgs([
      "scaffold",
      "Post",
      "--table",
      "posts",
      "--module=./schema.js",
      "--force",
    ]);
    expect(_).toEqual(["scaffold", "Post"]);
    expect(flags.table).toBe("posts");
    expect(flags.module).toBe("./schema.js");
    expect(flags.force).toBe(true);
  });
});

describe("listFlag", () => {
  it("splits a comma list and trims", () => {
    expect(listFlag({ fields: "a, b ,c" }, "fields")).toEqual(["a", "b", "c"]);
    expect(listFlag({}, "fields")).toEqual([]);
    expect(listFlag({ fields: true }, "fields")).toEqual([]);
  });
});
