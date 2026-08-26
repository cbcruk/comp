import { describe, expect, it } from 'vitest'
import { createAuthRoutes } from './auth-routes.js'
import { createMemoryStore } from './memory-store.js'
import { createPasskeyAuth } from './create-passkey-auth.js'
import type { PasskeyStore } from './passkey-store.types.js'

/**
 * These routes had no error handling of any kind: five ways a ceremony could
 * fail, all thrown as bare Errors, none caught, no `app.onError`. Every one of
 * them reached Hono's default handler as a bodyless 500, and the admin's
 * passkey client rendered whatever it made of that as a status line
 * indistinguishable from a success message.
 *
 * The bodies were not checked either — `c.req.json<{ userId: string }>()` is a
 * cast, so a request without a `userId` handed `undefined` to the store.
 */
const RP = {
  rpID: 'localhost',
  rpName: 'Comp',
  origin: 'http://localhost:5173',
}

function routes(store: PasskeyStore = createMemoryStore()) {
  return createAuthRoutes({
    store,
    rp: RP,
    auth: createPasskeyAuth({ secret: 'test-secret', authorize: () => true }),
  })
}

async function post(
  app: ReturnType<typeof createAuthRoutes>,
  path: string,
  body: string,
): Promise<{ status: number; body: Record<string, unknown>; text: string }> {
  const response = await app.request(path, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  })
  const text = await response.text()
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
    text,
  }
}

describe('the passkey ceremony routes', () => {
  it('refuses a body that is not JSON at all', async () => {
    const { status, body } = await post(routes(), '/login/options', 'not json')
    expect(status).toBe(400)
    expect(body.issues).toBeDefined()
  })

  it('names the field a body is missing', async () => {
    const { status, body } = await post(routes(), '/login/options', '{}')
    expect(status).toBe(400)
    expect((body.issues as { path: string[] }[])[0]?.path).toEqual(['userId'])
  })

  it('refuses a field of the wrong type rather than passing it on', async () => {
    const { status, body } = await post(
      routes(),
      '/register/options',
      JSON.stringify({ userId: 42, userName: 'a' }),
    )
    expect(status).toBe(400)
    expect((body.issues as { path: string[] }[])[0]?.path).toEqual(['userId'])
  })

  it('requires the WebAuthn payload, which a cast never checked', async () => {
    const { status, body } = await post(
      routes(),
      '/login/verify',
      JSON.stringify({ userId: 'someone' }),
    )
    expect(status).toBe(400)
    expect((body.issues as { path: string[] }[])[0]?.path).toEqual(['response'])
  })

  it('says a ceremony has expired, since restarting it is the answer', async () => {
    const { status, body } = await post(
      routes(),
      '/login/verify',
      JSON.stringify({ userId: 'someone', response: { id: 'cred' } }),
    )
    expect(status).toBe(400)
    expect(body.error).toBe('No authentication challenge in flight')
  })

  describe('with a challenge in flight', () => {
    async function withChallenge() {
      const app = routes()
      await post(app, '/login/options', JSON.stringify({ userId: 'someone' }))
      return app
    }

    it('refuses an unverifiable assertion with 401', async () => {
      const app = await withChallenge()
      const { status, body } = await post(
        app,
        '/login/verify',
        JSON.stringify({ userId: 'someone', response: { id: 'nope' } }),
      )
      expect(status).toBe(401)
      expect(body.error).toBe('Authentication could not be verified')
    })

    // Whether the credential is unknown, or known and someone else's, is
    // exactly what an attacker would like to learn from the response.
    it('does not say which way it failed', async () => {
      const app = await withChallenge()
      const { text } = await post(
        app,
        '/login/verify',
        JSON.stringify({ userId: 'someone', response: { id: 'nope' } }),
      )
      expect(text).not.toContain('no such credential')
      expect(text).not.toContain('belongs to another user')
    })
  })

  it('keeps a store failure opaque, and does not leak its message', async () => {
    const broken: PasskeyStore = {
      ...createMemoryStore(),
      getCredentialsByUser: () => {
        throw new Error('D1_ERROR: no such table: passkey_credentials')
      },
    }
    const { status, body, text } = await post(
      routes(broken),
      '/login/options',
      JSON.stringify({ userId: 'someone' }),
    )
    expect(status).toBe(500)
    expect(body).toEqual({ error: 'Internal error' })
    expect(text).not.toContain('no such table')
  })
})
