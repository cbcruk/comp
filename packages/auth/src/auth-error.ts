import { ValidationError } from '@comp/core'
import { Data } from 'effect'

/**
 * The passkey ceremonies get their own vocabulary rather than joining core's
 * `CompError`.
 *
 * Core's union is about operations on collections, and every transport that
 * maps it exhaustively would then be forced to say what a missing WebAuthn
 * challenge looks like — a failure that cannot reach the admin router or the
 * MCP tools. Two surfaces, two unions.
 *
 * `ValidationError` is the exception and is reused deliberately: a malformed
 * request body means the same thing here as anywhere, and reusing it keeps one
 * `{path, message}` issue shape across every response the admin might read.
 */

/**
 * There is no challenge on record for this user.
 *
 * Safe to report plainly: it describes the caller's own pending state, not
 * whether an account exists, and the only useful response is to start the
 * ceremony again.
 */
export class CeremonyExpired extends Data.TaggedError('CeremonyExpired')<{
  readonly ceremony: 'registration' | 'authentication'
}> {
  override get message(): string {
    return `No ${this.ceremony} challenge in flight`
  }
}

/**
 * What the caller sent did not verify.
 *
 * `reason` says which way — no such credential, a credential belonging to
 * someone else, a signature that did not check out. It exists for the log and
 * must not reach the response: telling the two apart tells an attacker whether
 * a credential exists, which is the same reason `verifySession` collapses a
 * forged token, a bad signature and an expiry into one `null`.
 */
export class CeremonyFailed extends Data.TaggedError('CeremonyFailed')<{
  readonly ceremony: 'registration' | 'authentication'
  readonly reason: string
}> {
  override get message(): string {
    return `${this.ceremony === 'registration' ? 'Registration' : 'Authentication'} could not be verified`
  }
}

/** Every way a ceremony can fail on purpose. */
export type AuthError = ValidationError | CeremonyExpired | CeremonyFailed

/**
 * Whether a caught value is one of those. Anything else is a defect — a store
 * that threw, a misconfigured relying party — and is not something the caller
 * can act on.
 */
export function isAuthError(error: unknown): error is AuthError {
  return (
    error instanceof ValidationError ||
    error instanceof CeremonyExpired ||
    error instanceof CeremonyFailed
  )
}
