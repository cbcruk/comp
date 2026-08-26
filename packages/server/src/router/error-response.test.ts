import { defineCollection, NotFound, type SqliteDb } from '@comp/core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { createAdminRouter } from './create-admin-router.js'
import { compErrorResponse } from './error-response.js'
import type { Context } from 'hono'

const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
})

const collection = defineCollection({ model: posts, listDisplay: ['title'] })

describe('the router error handler', () => {
  /**
   * Before `app.onError` existed, ten of the twelve routes had nothing
   * catching them, so anything they threw became Hono's default 500: no body,
   * nothing a client could parse. The handler is registered for the whole
   * router, so this holds for every route rather than the two that remembered.
   */
  it('shapes a body for a failure no route caught', async () => {
    const app = createAdminRouter({
      collections: [collection],
      getDb: () => {
        throw new Error('the D1 binding is missing')
      },
    })

    const response = await app.request('/collections/posts')
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal error' })
  })

  // The message can name internals — a driver reports the column a constraint
  // was on — so it does not travel to the caller. It is logged instead.
  it('does not put the defect message in the response', async () => {
    const app = createAdminRouter({
      collections: [collection],
      getDb: (): SqliteDb => {
        throw new Error('UNIQUE constraint failed: users.email')
      },
    })

    const body = await (await app.request('/collections/posts')).text()
    expect(body).not.toContain('users.email')
  })

  it('maps each deliberate failure to its own status', () => {
    const captured: { status?: number } = {}
    const c = {
      json: (_body: unknown, status: number) => {
        captured.status = status
        return new Response(null, { status })
      },
    } as unknown as Context

    compErrorResponse(c, new NotFound({ collection: 'posts', id: 1 }))
    expect(captured.status).toBe(404)
  })
})
