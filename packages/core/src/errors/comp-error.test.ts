import { describe, expect, it } from 'vitest'
import { Effect, Exit, Match } from 'effect'
import {
  CapabilityError,
  Forbidden,
  NotFound,
  NotGranted,
  ValidationError,
  type CompError,
} from './comp-error.js'

describe('the error vocabulary', () => {
  // These errors are thrown today and yielded in Effect tomorrow. Both have to
  // keep working through that change, so both are asserted here.
  it('is still ordinary Errors, so a throw/catch site keeps working', () => {
    const error = new ValidationError({ issues: [] })
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ValidationError)
    expect(typeof error.stack).toBe('string')

    const caught = ((): unknown => {
      try {
        throw error
      } catch (thrown) {
        return thrown
      }
    })()
    expect(caught).toBeInstanceOf(ValidationError)
  })

  it('fails an Effect when yielded', () => {
    const exit = Effect.runSyncExit(
      Effect.gen(function* () {
        return yield* new NotFound({ collection: 'posts', id: 7 })
      }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('tags every member, so a transport can match on _tag', () => {
    expect(new ValidationError({ issues: [] })._tag).toBe('ValidationError')
    expect(new NotFound({ collection: 'posts' })._tag).toBe('NotFound')
    expect(
      new Forbidden({ collection: 'posts', operation: 'update' })._tag,
    ).toBe('Forbidden')
  })

  it('carries a readable message, since transports put it in the body', () => {
    expect(new ValidationError({ issues: [] }).message).toBe(
      'Validation failed',
    )
    expect(new NotFound({ collection: 'posts' }).message).toBe('Not found')
    expect(
      new NotGranted({
        collection: 'order_items',
        operation: 'delete',
        reason: 'the inline declares canDelete: false',
      }).message,
    ).toBe(
      '"order_items" cannot "delete": the inline declares canDelete: false',
    )
    expect(
      new CapabilityError({ method: 'insert', granted: ['list', 'read'] })
        .message,
    ).toBe('Action lacks the capability to "insert" (granted: list, read)')
  })

  it('names no granted operation as "none" rather than an empty gap', () => {
    expect(
      new CapabilityError({ method: 'delete', granted: [] }).message,
    ).toContain('granted: none')
  })

  it('keeps the issues it was given, in the wire shape', () => {
    const error = new ValidationError({
      issues: [{ path: ['inlines', 'order_items', 0, 'qty'], message: 'nope' }],
    })
    expect(error.issues).toEqual([
      { path: ['inlines', 'order_items', 0, 'qty'], message: 'nope' },
    ])
  })

  // The union exists so a transport cannot quietly forget a member. If this
  // stops compiling because Match.exhaustive rejects it, a new error tag was
  // added without every transport being taught what it looks like.
  it('is exhaustively matchable', () => {
    const describe_ = (error: CompError): string =>
      Match.value(error).pipe(
        Match.tag('ValidationError', () => 'invalid'),
        Match.tag('NotFound', () => 'missing'),
        Match.tag('Forbidden', () => 'refused'),
        Match.tag('NotGranted', () => 'ungranted'),
        Match.tag('CapabilityError', () => 'uncapable'),
        Match.exhaustive,
      )

    expect(describe_(new ValidationError({ issues: [] }))).toBe('invalid')
    expect(describe_(new NotFound({ collection: 'posts' }))).toBe('missing')
    expect(
      describe_(
        new NotGranted({
          collection: 'tags',
          operation: 'create',
          reason: 'x',
        }),
      ),
    ).toBe('ungranted')
  })
})
