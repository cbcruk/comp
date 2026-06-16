export { signSession, verifySession } from "./session.js";
export type { SessionPayload } from "./session.js";

export { parseCookies, readCookie, serializeCookie } from "./cookie.js";
export type { CookieOptions } from "./cookie.js";

export { createRolePolicy } from "./policy.js";
export type { RoleGrant, RolePolicyConfig } from "./policy.js";

export { createMemoryStore } from "./memory-store.js";
export type {
  PasskeyStore,
  StoredCredential,
} from "./passkey-store.types.js";

export {
  finishAuthentication,
  finishRegistration,
  startAuthentication,
  startRegistration,
} from "./webauthn.js";
export type {
  AuthenticationResponse,
  PasskeyUser,
  RegistrationResponse,
  RpInfo,
} from "./webauthn.js";

export { createPasskeyAuth } from "./create-passkey-auth.js";
export type { PasskeyAuth, PasskeyAuthOptions } from "./create-passkey-auth.js";

export { createAuthRoutes } from "./auth-routes.js";
export type { AuthRoutesConfig } from "./auth-routes.js";
