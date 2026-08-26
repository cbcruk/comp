import { ValidationError, type FieldIssue } from '@comp/core'
import { Cause, Effect, Either, Match, ParseResult, Schema } from 'effect'
import type { Context } from 'hono'
import { isAuthError, type AuthError } from './auth-error.js'

/**
 * Read and check a request body.
 *
 * The routes used to cast — `c.req.json<{ userId: string }>()` — which checks
 * nothing at runtime, so a request without a `userId` handed `undefined` to
 * the store and failed somewhere further in. A malformed body threw out of
 * `json()` and became a bodyless 500. Both are the caller's mistake and should
 * say so.
 */
export async function readBody<A>(
  c: Context,
  schema: Schema.Schema<A, A, never>,
): Promise<A> {
  const raw: unknown = await c.req.json().catch(() => undefined)
  const result = Schema.decodeUnknownEither(schema, { errors: 'all' })(raw)
  if (Either.isRight(result)) return result.right

  const issues: FieldIssue[] = ParseResult.ArrayFormatter.formatErrorSync(
    result.left,
  ).map((issue) => ({
    path: issue.path.map((segment) =>
      typeof segment === 'symbol' ? (segment.description ?? '') : segment,
    ),
    message: issue.message,
  }))
  throw new ValidationError({ issues })
}

/** The WebAuthn payload itself; @simplewebauthn verifies its innards. */
export const CeremonyResponse = Schema.Object

/**
 * The one place a ceremony failure becomes an HTTP response.
 *
 * The same shape as the admin router's mapper, for the same reason: adding a
 * member to `AuthError` stops compiling until this says what it looks like.
 * Before this the auth routes had no error handling at all — every one of the
 * five ways a ceremony could fail reached Hono's default handler as a bodyless
 * 500, and the admin's passkey client rendered whatever it made of that as a
 * status line.
 */
export function authErrorResponse(c: Context, error: AuthError): Response {
  return Match.value(error).pipe(
    Match.tag('ValidationError', (e) =>
      c.json({ error: e.message, issues: e.issues }, 400),
    ),
    // Recoverable, and about the caller's own pending state: start again.
    Match.tag('CeremonyExpired', (e) => c.json({ error: e.message }, 400)),
    // `reason` is deliberately not in the body — see CeremonyFailed.
    Match.tag('CeremonyFailed', (e) =>
      c.json({ error: e.message }, e.ceremony === 'authentication' ? 401 : 400),
    ),
    Match.exhaustive,
  )
}

/** The auth router's error handler; registered so a route can simply throw. */
export function handleAuthError(error: unknown, c: Context): Response {
  if (isAuthError(error)) {
    if (error._tag === 'CeremonyFailed') {
      // The only place the reason is allowed to exist.
      Effect.runSync(
        Effect.logWarning('ceremony failed').pipe(
          Effect.annotateLogs({
            source: 'comp/auth',
            ceremony: error.ceremony,
            reason: error.reason,
          }),
        ),
      )
    }
    return authErrorResponse(c, error)
  }

  Effect.runSync(
    Effect.logError(Cause.die(error)).pipe(
      Effect.annotateLogs({
        source: 'comp/auth',
        method: c.req.method,
        path: c.req.path,
      }),
    ),
  )
  return c.json({ error: 'Internal error' }, 500)
}
