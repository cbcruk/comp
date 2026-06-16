import type { AuthorizeArgs, CollectionOperation } from "@comp/core";

/** Operations a role may perform, or "all" for every operation. */
export type RoleGrant = CollectionOperation[] | "all";

export interface RolePolicyConfig {
  /** Operations granted per role name. */
  roles: Record<string, RoleGrant>;
  /** Operations allowed without an identity. Defaults to none. */
  anonymous?: CollectionOperation[];
}

function grants(grant: RoleGrant, operation: CollectionOperation): boolean {
  return grant === "all" || grant.includes(operation);
}

/**
 * Build an authorize function from a role→operations map. The identity's
 * `roles` are unioned; if any grants the operation, it is allowed. Operations
 * are the same vocabulary the collection manifest and actions use.
 */
export function createRolePolicy(
  config: RolePolicyConfig,
): (args: AuthorizeArgs) => boolean {
  return ({ identity, operation }) => {
    if (!identity) {
      return (config.anonymous ?? []).includes(operation);
    }
    const roles = Array.isArray(identity.roles) ? identity.roles : [];
    return roles.some((role) => {
      const grant = config.roles[role];
      return grant !== undefined && grants(grant, operation);
    });
  };
}
