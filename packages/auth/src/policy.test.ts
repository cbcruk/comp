import type { AuthorizeArgs, Identity } from "@comp/core";
import { describe, expect, it } from "vitest";
import { createRolePolicy } from "./policy.js";

const collection = {} as AuthorizeArgs["collection"];

function args(
  identity: Identity | null,
  operation: AuthorizeArgs["operation"],
): AuthorizeArgs {
  return { identity, operation, collection };
}

describe("createRolePolicy", () => {
  const policy = createRolePolicy({
    roles: { admin: "all", editor: ["list", "read", "update"] },
    anonymous: ["list"],
  });

  it("grants by role and operation", () => {
    const editor: Identity = { subject: "e", roles: ["editor"] };
    expect(policy(args(editor, "update"))).toBe(true);
    expect(policy(args(editor, "delete"))).toBe(false);
  });

  it("treats 'all' as every operation", () => {
    const admin: Identity = { subject: "a", roles: ["admin"] };
    expect(policy(args(admin, "delete"))).toBe(true);
  });

  it("applies the anonymous grant when there is no identity", () => {
    expect(policy(args(null, "list"))).toBe(true);
    expect(policy(args(null, "delete"))).toBe(false);
  });

  it("denies identities without a matching role", () => {
    expect(policy(args({ subject: "x", roles: ["viewer"] }, "read"))).toBe(false);
    expect(policy(args({ subject: "x" }, "read"))).toBe(false);
  });
});
