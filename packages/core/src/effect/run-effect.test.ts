import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { NotFound } from '../errors/comp-error.js'
import { runEffect } from './run-effect.js'

/**
 * Every transport maps failures by `instanceof`. `Effect.runPromise` would
 * reject with a wrapper instead of the error itself, so each of those checks
 * would quietly stop matching and the failure would fall through to whatever
 * the transport does with a defect. That is the whole reason this helper
 * exists, so it is the thing worth asserting.
 */
describe('runEffect', () => {
  it('resolves with the success value', async () => {
    await expect(runEffect(Effect.succeed(7))).resolves.toBe(7)
  })

  it('rejects with the failure itself, not a wrapper around it', async () => {
    const failure = new NotFound({ collection: 'posts', id: 3 })
    await expect(runEffect(Effect.fail(failure))).rejects.toBe(failure)
  })

  it('rejects with a defect unchanged, so its stack still points at the bug', async () => {
    const defect = new Error('driver exploded')
    await expect(runEffect(Effect.die(defect))).rejects.toBe(defect)
  })

  it('surfaces a rejection from a wrapped promise as a defect', async () => {
    const boom = new Error('nope')
    await expect(
      runEffect(Effect.promise(() => Promise.reject(boom))),
    ).rejects.toBe(boom)
  })
})
