import { isCompError, type CompError } from '@comp/core'
import { Cause, Effect, Match } from 'effect'
import type { Context } from 'hono'

/**
 * The one place a core failure becomes an HTTP response.
 *
 * `Match.exhaustive` is doing real work here: adding a member to `CompError`
 * stops compiling until this function says what it looks like over HTTP. The
 * previous mapping handled two of the error types and rethrew the rest into
 * Hono's default handler, which meant a capability failure — a type that
 * existed, with no mapping — left as an opaque 500 with no body.
 */
export function compErrorResponse(c: Context, error: CompError): Response {
  return Match.value(error).pipe(
    // The issues carry the row and field they came from
    // (`inlines.<slug>.<index>.<field>`), so they reach the form unchanged.
    Match.tag('ValidationError', (e) =>
      c.json({ error: e.message, issues: e.issues }, 400),
    ),
    Match.tag('NotFound', (e) => c.json({ error: e.message }, 404)),
    Match.tag('Forbidden', (e) => c.json({ error: e.message }, 403)),
    // 405, not 403: no identity would be allowed to do this, because the
    // collection never offered the operation at all.
    Match.tag('NotGranted', (e) => c.json({ error: e.message }, 405)),
    Match.tag('CapabilityError', (e) => c.json({ error: e.message }, 403)),
    Match.exhaustive,
  )
}

/**
 * The router's error handler. Registering this is what lets a route simply
 * throw: before it existed, only two of the twelve routes wrapped anything in
 * `try`, so a failure from any of the others reached Hono's default handler as
 * a bodyless 500.
 *
 * Anything that is not a deliberate failure stays opaque to the caller on
 * purpose — a declaration bug that escaped to a request is not something they
 * can act on, and its message can name internals. It is not opaque to the
 * operator: it is logged with the request that produced it, because "an error
 * happened somewhere" is not a thing anyone can debug.
 */
export function handleRouterError(error: unknown, c: Context): Response {
  if (isCompError(error)) return compErrorResponse(c, error)
  Effect.runSync(
    Effect.logError(Cause.die(error)).pipe(
      Effect.annotateLogs({
        source: 'comp/server',
        method: c.req.method,
        path: c.req.path,
      }),
    ),
  )
  return c.json({ error: 'Internal error' }, 500)
}
