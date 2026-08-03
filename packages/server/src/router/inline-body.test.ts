import { describe, expect, it } from "vitest";
import { splitInlineBody } from "./inline-body.js";

describe("splitInlineBody", () => {
  it("separates the record's fields from its inline changes", () => {
    expect(
      splitInlineBody({
        reference: "A-1",
        inlines: { items: { create: [{ product: "Cup" }] } },
      }),
    ).toEqual({
      values: { reference: "A-1" },
      inlines: { items: { create: [{ product: "Cup" }] } },
      manyToMany: {},
    });
  });

  it("leaves a plain body untouched", () => {
    expect(splitInlineBody({ reference: "A-1" })).toEqual({
      values: { reference: "A-1" },
      inlines: {},
      manyToMany: {},
    });
  });

  it("ignores a non-object inlines value rather than trusting it", () => {
    expect(splitInlineBody({ reference: "A-1", inlines: "nope" })).toEqual({
      values: { reference: "A-1" },
      inlines: {},
      manyToMany: {},
    });
    expect(splitInlineBody({ inlines: [1, 2] }).inlines).toEqual({});
  });

  it("tolerates a missing or non-object body", () => {
    const empty = { values: {}, inlines: {}, manyToMany: {} };
    expect(splitInlineBody(undefined)).toEqual(empty);
    expect(splitInlineBody([1])).toEqual(empty);
  });

  it("separates the link sets too — one request, one user action", () => {
    const body = splitInlineBody({ title: "Post", manyToMany: { tags: [1, 2] } });
    expect(body.values).toEqual({ title: "Post" });
    expect(body.manyToMany).toEqual({ tags: [1, 2] });
    // Otherwise validation would reject the reserved key as an unknown column.
    expect("manyToMany" in body.values).toBe(false);
  });
});
