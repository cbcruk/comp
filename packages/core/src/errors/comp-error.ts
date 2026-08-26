import { Data } from 'effect'
import type { CollectionOperation } from '../collection/define-collection.types.js'

/**
 * One field-level problem with an input, in the shape that crosses the wire.
 *
 * `path` and `message` are the whole contract: the admin groups issues by
 * `path[0]` to put a message under the field that caused it, and an inline's
 * issues are prefixed `inlines.<slug>.<index>.<field>` so a nested failure
 * still lands on the exact row. Declaring the shape here rather than
 * re-exporting a validation library's issue type is what lets the validator
 * underneath change without the UI noticing.
 */
export interface FieldIssue {
  readonly path: readonly (string | number)[]
  readonly message: string
}

/**
 * An input failed the schema derived from a collection. Carries the issues so
 * a transport can shape its response without re-validating.
 */
export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly issues: readonly FieldIssue[]
}> {
  override get message(): string {
    return 'Validation failed'
  }
}

/**
 * The record does not exist, or does not exist *for this caller* — an
 * out-of-scope row is reported as absent rather than refused, because a
 * refusal would confirm it is there.
 */
export class NotFound extends Data.TaggedError('NotFound')<{
  readonly collection: string
  readonly id?: unknown
}> {
  override get message(): string {
    return 'Not found'
  }
}

/** The caller is known, and is not allowed to do this. */
export class Forbidden extends Data.TaggedError('Forbidden')<{
  readonly collection: string
  readonly operation: CollectionOperation
}> {
  override get message(): string {
    return 'Forbidden'
  }
}

/**
 * The collection itself never offered this operation — a manifest that does
 * not list it, or an inline that declares `canDelete: false`. Distinct from
 * {@link Forbidden}: no identity would be allowed to do this, so it is a
 * statement about the declaration, not about the caller.
 */
export class NotGranted extends Data.TaggedError('NotGranted')<{
  readonly collection: string
  readonly operation: CollectionOperation
  readonly reason: string
}> {
  override get message(): string {
    return `"${this.collection}" cannot "${this.operation}": ${this.reason}`
  }
}

/** An action touched a db operation it never declared in its manifest. */
export class CapabilityError extends Data.TaggedError('CapabilityError')<{
  readonly method: string
  readonly granted: readonly CollectionOperation[]
}> {
  override get message(): string {
    const granted = this.granted.join(', ') || 'none'
    return `Action lacks the capability to "${this.method}" (granted: ${granted})`
  }
}

/**
 * Every way a request can fail on purpose.
 *
 * A transport maps this union with `Match.exhaustive`, so adding a member here
 * is a compile error in each transport until it says what that failure looks
 * like over its own wire. That is the point of the union: the reason MCP could
 * report an ungranted inline write as an untyped string while HTTP called it a
 * 405 was that nothing forced the two to agree.
 *
 * A bad *declaration* is deliberately not here. Those throw at startup, where
 * a config typo belongs; putting them in this channel would make every
 * `defineCollection` caller handle a failure that cannot happen at runtime.
 */
export type CompError =
  ValidationError | NotFound | Forbidden | NotGranted | CapabilityError

/**
 * The refusal for an inline slug that the parent does not declare.
 *
 * A transport may refuse this before the parent row is written, and the write
 * refuses it again on its own; both call this so the two cannot drift into
 * wording the same condition differently.
 */
export function unknownInline(slug: string): ValidationError {
  return new ValidationError({
    issues: [
      {
        path: ['inlines', slug],
        message: `Unknown inline "${slug}" for this collection`,
      },
    ],
  })
}

/**
 * Whether a caught value is one of the deliberate failures above.
 *
 * Lives here rather than in a transport because every transport needs the same
 * answer, and a second copy of this list is a second place to forget a member.
 * Anything else that reaches a catch block is a defect — a declaration bug that
 * escaped to a request, or a driver failure — and is not something the caller
 * can act on.
 */
export function isCompError(error: unknown): error is CompError {
  return (
    error instanceof ValidationError ||
    error instanceof NotFound ||
    error instanceof Forbidden ||
    error instanceof NotGranted ||
    error instanceof CapabilityError
  )
}
