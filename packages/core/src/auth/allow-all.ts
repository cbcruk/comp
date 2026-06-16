import type { AuthAdapter, Identity } from "./auth-adapter.types.js";

const ANONYMOUS: Identity = { subject: "anonymous" };

/**
 * The v0.1 default: every request is the anonymous principal and every
 * operation is allowed. Swap this for a real adapter without changing any
 * call site.
 */
export const allowAll: AuthAdapter = {
  authenticate() {
    return ANONYMOUS;
  },
  authorize() {
    return true;
  },
};
