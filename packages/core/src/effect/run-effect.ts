import { Cause, Effect, Exit } from 'effect'

/**
 * Run an Effect at a transport boundary, rejecting the way a throw would.
 *
 * `Effect.runPromise` rejects with a wrapper around the cause, which would put
 * every `instanceof` check in the transports one unwrapping away from the error
 * it is looking for. Squashing the cause hands back the original value — a
 * `CompError` stays the object the error mapper matches on, and a defect stays
 * the thing whose stack points at the bug.
 *
 * Lives in core because both transports need exactly this, and a second copy is
 * a second thing to get subtly different.
 */
export async function runEffect<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}

/**
 * How many independent database reads a single request will run at once.
 *
 * Bounded rather than unbounded because this runs on Workers: a request has a
 * subrequest ceiling, and a fan-out sized by how many inlines or collections
 * an app happened to declare is a fan-out that grows past it without anyone
 * choosing to. Small enough to stay polite, large enough that the round trips
 * a screen needs stop being a queue.
 */
export const READ_CONCURRENCY = 8
