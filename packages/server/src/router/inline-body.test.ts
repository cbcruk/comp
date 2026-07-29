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
    });
  });

  it("leaves a plain body untouched", () => {
    expect(splitInlineBody({ reference: "A-1" })).toEqual({
      values: { reference: "A-1" },
      inlines: {},
    });
  });

  it("ignores a non-object inlines value rather than trusting it", () => {
    expect(splitInlineBody({ reference: "A-1", inlines: "nope" })).toEqual({
      values: { reference: "A-1" },
      inlines: {},
    });
    expect(splitInlineBody({ inlines: [1, 2] }).inlines).toEqual({});
  });

  it("tolerates a missing or non-object body", () => {
    expect(splitInlineBody(undefined)).toEqual({ values: {}, inlines: {} });
    expect(splitInlineBody([1])).toEqual({ values: {}, inlines: {} });
  });
});
