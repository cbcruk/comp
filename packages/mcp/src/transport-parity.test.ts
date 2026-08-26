import { defineCollection, type SqliteDb } from '@comp/core'
import { createAdminRouter } from '@comp/server'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMcpHandler } from './create-mcp-handler.js'

/**
 * The same failure has to mean the same thing on both wires.
 *
 * It did not: an inline write asking for an operation the child collection
 * never granted was a 405 with its own shape over HTTP, while MCP had no
 * branch for it at all and fell through to a catch-all that stringified the
 * message — a tool client could not tell it apart from a crash. Nothing forced
 * the two mappings to agree, so this drives both transports over one real
 * database and compares what comes back.
 */
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void
    prepare(sql: string): {
      run(...params: never[]): unknown
      all(...params: never[]): Record<string, unknown>[]
    }
  }
}

const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reference: text('reference').notNull(),
})

const orderItems = sqliteTable('order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id),
  product: text('product').notNull(),
})

const SCHEMA = [
  `CREATE TABLE orders (
     id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
     reference text NOT NULL
   )`,
  `CREATE TABLE order_items (
     id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
     order_id integer NOT NULL REFERENCES orders(id),
     product text NOT NULL
   )`,
]

/** The child is readable but never writable — so an inline create is ungranted. */
const readOnlyItems = defineCollection({
  model: orderItems,
  listDisplay: ['product'],
  operations: ['list', 'read'],
})

const orderCollection = defineCollection({
  model: orders,
  listDisplay: ['reference'],
  inlines: ['order_items'],
})

function freshDb(): SqliteDb {
  const sqlite = new DatabaseSync(':memory:')
  for (const statement of SCHEMA) sqlite.exec(statement)
  return drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql)
    if (method === 'run') {
      statement.run(...(params as never[]))
      return { rows: [] }
    }
    const rows = statement
      .all(...(params as never[]))
      .map((row) => Object.values(row))
    return { rows: method === 'get' ? (rows[0] ?? []) : rows }
  }) as unknown as SqliteDb
}

describe('transport parity', () => {
  let http: ReturnType<typeof createAdminRouter>
  let mcp: ReturnType<typeof createMcpHandler>

  beforeEach(() => {
    const db = freshDb()
    const collections = [orderCollection, readOnlyItems]
    http = createAdminRouter({ collections, getDb: () => db })
    mcp = createMcpHandler({ collections, getDb: () => db })
  })

  async function post(
    body: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await http.request('/collections/orders', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    }
  }

  /** Call one tool and unwrap the JSON a refusal carries in its text block. */
  async function callTool(
    args: Record<string, unknown>,
  ): Promise<{ isError: boolean; payload: Record<string, unknown> }> {
    const response = await mcp.request('/', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'orders__create', arguments: args },
      }),
      headers: { 'content-type': 'application/json' },
    })
    const rpc = (await response.json()) as {
      result: { content: { text: string }[]; isError?: boolean }
    }
    return {
      isError: rpc.result.isError === true,
      payload: JSON.parse(rpc.result.content[0]?.text ?? '{}') as Record<
        string,
        unknown
      >,
    }
  }

  const ungranted = {
    reference: 'A-1',
    inlines: { order_items: { create: [{ product: 'Cup' }] } },
  }

  it('refuses an ungranted inline write with 405 over HTTP', async () => {
    const { status, body } = await post(ungranted)
    expect(status).toBe(405)
    expect(body.error).toContain('order_items')
  })

  it('refuses the same write over MCP, and names the same failure', async () => {
    const { isError, payload } = await callTool(ungranted)
    expect(isError).toBe(true)
    // The tag is what a client branches on; before this it had only prose.
    expect(payload.code).toBe('NotGranted')
    expect(payload.error).toContain('order_items')
  })

  const unknownInline = {
    reference: 'A-2',
    inlines: { nope: { create: [{ product: 'Cup' }] } },
  }

  // An inline slug comes from the request body, so naming one that does not
  // exist is a bad input. It used to throw a bare Error and land as a 500.
  it('treats an unknown inline as bad input, not a crash', async () => {
    const { status, body } = await post(unknownInline)
    expect(status).toBe(400)
    expect(body.issues).toEqual([
      { path: ['inlines', 'nope'], message: expect.stringContaining('nope') },
    ])
  })

  it('treats it the same way over MCP', async () => {
    const { isError, payload } = await callTool(unknownInline)
    expect(isError).toBe(true)
    expect(payload.code).toBe('ValidationError')
  })

  it('reports a field-level validation failure identically on both', async () => {
    const invalid = { reference: 42 }
    const { status, body } = await post(invalid)
    expect(status).toBe(400)
    expect((body.issues as { path: string[] }[])[0]?.path).toEqual([
      'reference',
    ])

    const { isError, payload } = await callTool(invalid)
    expect(isError).toBe(true)
    expect(payload.code).toBe('ValidationError')
    expect((payload.issues as { path: string[] }[])[0]?.path).toEqual([
      'reference',
    ])
  })
})
