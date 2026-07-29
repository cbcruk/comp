import { describe, expect, it } from "vitest";
import {
  extractIssues,
  fieldMessage,
  inlineIssuesByRow,
  issuesByField,
  ownIssues,
} from "./issues.js";

const clientError = {
  status: 400,
  body: {
    error: "Validation failed",
    issues: [
      { path: ["title"], message: "Required" },
      { path: ["title"], message: "Too short" },
      { path: ["status"], message: "Invalid enum value" },
      { path: [], message: "root issue" },
    ],
  },
};

describe("extractIssues", () => {
  it("reads issues off a client error body", () => {
    expect(extractIssues(clientError)).toHaveLength(4);
  });

  it("reads issues off a bare object", () => {
    expect(extractIssues({ issues: [{ path: ["x"], message: "m" }] })).toHaveLength(1);
  });

  it("returns null when there are none", () => {
    expect(extractIssues(new Error("boom"))).toBeNull();
    expect(extractIssues(null)).toBeNull();
    expect(extractIssues({ body: {} })).toBeNull();
  });
});

describe("issuesByField", () => {
  it("groups messages by leading path segment", () => {
    const map = issuesByField(extractIssues(clientError)!);
    expect(map.title).toEqual(["Required", "Too short"]);
    expect(map.status).toEqual(["Invalid enum value"]);
    expect(map._).toEqual(["root issue"]);
  });
});

describe("fieldMessage", () => {
  it("returns the first message for a field", () => {
    const issues = extractIssues(clientError);
    expect(fieldMessage(issues, "title")).toBe("Required");
    expect(fieldMessage(issues, "body")).toBeNull();
    expect(fieldMessage(null, "title")).toBeNull();
  });
});

describe("inline issues", () => {
  const issues = [
    { path: ["reference"], message: "Required" },
    { path: ["inlines", "items", 1, "product"], message: "Expected string" },
    { path: ["inlines", "items", 1, "quantity"], message: "Expected number" },
    { path: ["inlines", "shipments", 0, "carrier"], message: "Required" },
  ];

  it("keys an inline's issues by row and field", () => {
    expect(inlineIssuesByRow(issues, "items")).toEqual({
      "1.product": ["Expected string"],
      "1.quantity": ["Expected number"],
    });
  });

  it("ignores other inlines and the record's own issues", () => {
    expect(inlineIssuesByRow(issues, "shipments")).toEqual({
      "0.carrier": ["Required"],
    });
    expect(inlineIssuesByRow([{ path: ["title"], message: "x" }], "items")).toEqual({});
  });

  it("separates the record's own issues from its inlines'", () => {
    expect(ownIssues(issues)).toEqual([{ path: ["reference"], message: "Required" }]);
  });
});
