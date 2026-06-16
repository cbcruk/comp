import { describe, expect, it } from "vitest";
import { toCamelCase, toKebabCase, toPascalCase } from "../naming.js";
import { scaffoldCollection } from "./scaffold-collection.js";

describe("naming", () => {
  it("converts between cases", () => {
    expect(toKebabCase("BlogPost")).toBe("blog-post");
    expect(toCamelCase("blog_post")).toBe("blogPost");
    expect(toPascalCase("blog-post")).toBe("BlogPost");
    expect(toCamelCase("posts")).toBe("posts");
  });
});

describe("scaffoldCollection", () => {
  it("emits a defineCollection module", () => {
    const source = scaffoldCollection({
      name: "BlogPost",
      table: "posts",
      module: "./schema.js",
      listDisplay: ["title", "status"],
      filters: ["status"],
      search: ["title", "body"],
    });
    expect(source).toContain(`import { defineCollection } from "@comp/core";`);
    expect(source).toContain(`import { posts } from "./schema.js";`);
    expect(source).toContain(`export const blogPostCollection = defineCollection({`);
    expect(source).toContain(`model: posts,`);
    expect(source).toContain(`listDisplay: ["title", "status"],`);
    expect(source).toContain(`filters: ["status"],`);
    expect(source).toContain(`search: ["title", "body"],`);
  });

  it("omits empty filters and search", () => {
    const source = scaffoldCollection({
      name: "tags",
      table: "tags",
      module: "./schema.js",
      listDisplay: ["name"],
    });
    expect(source).not.toContain("filters:");
    expect(source).not.toContain("search:");
  });
});
