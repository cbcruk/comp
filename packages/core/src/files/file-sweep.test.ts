import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { describe, expect, it } from 'vitest'
import { defineCollection } from '../collection/define-collection.js'
import { runEffect } from '../effect/run-effect.js'
import { deleteRecord, updateRecord } from '../mutation/mutate-record.js'
import type { FileStore, StoredFile } from './file.types.js'

const books = sqliteTable('books', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  cover: text('cover'),
})

const collection = defineCollection({
  model: books,
  listDisplay: ['title'],
  files: ['cover'],
})

function recordingStore(): FileStore & { removed: string[] } {
  const removed: string[] = []
  return {
    removed,
    put: (): Promise<StoredFile> => {
      throw new Error('not used')
    },
    async remove(key) {
      removed.push(key)
    },
    url: (key) => `/files/${key}`,
  }
}

/**
 * A db whose next statement answers with the rows given. The proxy driver maps
 * positionally, so a row is `[id, title, cover]` — the table's column order.
 */
const dbReturning = (...rows: unknown[][]) =>
  drizzle(async () => ({ rows }) as never)

describe('sweeping files a write left unreferenced', () => {
  it('removes the key an update replaced', async () => {
    const files = recordingStore()
    await runEffect(
      updateRecord(
        {
          db: dbReturning([1, 'a', 'new.webp']),
          collection,
          files,
          before: { id: 1, title: 'a', cover: 'old.webp' },
        },
        1,
        { cover: 'new.webp' },
      ),
    )
    expect(files.removed).toEqual(['old.webp'])
  })

  it('leaves a field the write did not touch alone', async () => {
    const files = recordingStore()
    await runEffect(
      updateRecord(
        {
          db: dbReturning([1, 'b', 'same.webp']),
          collection,
          files,
          before: { id: 1, title: 'a', cover: 'same.webp' },
        },
        1,
        { title: 'b' },
      ),
    )
    expect(files.removed).toEqual([])
  })

  it('removes every file a deleted record held', async () => {
    const files = recordingStore()
    await runEffect(
      deleteRecord(
        {
          db: dbReturning([1, 'a', 'gone.webp']),
          collection,
          files,
        },
        1,
      ),
    )
    expect(files.removed).toEqual(['gone.webp'])
  })

  it('removes nothing when a delete matched no row', async () => {
    const files = recordingStore()
    await runEffect(deleteRecord({ db: dbReturning([]), collection, files }, 1))
    expect(files.removed).toEqual([])
  })

  it('does not fail the write when the store refuses', async () => {
    // An orphan is survivable; a write reported as failed after it committed is
    // not.
    const failing: FileStore = {
      put: () => Promise.reject(new Error('nope')),
      remove: () => Promise.reject(new Error('nope')),
      url: (key) => key,
    }
    const row = await runEffect(
      deleteRecord(
        {
          db: dbReturning([1, 'a', 'gone.webp']),
          collection,
          files: failing,
        },
        1,
      ),
    )
    expect(row).toMatchObject({ id: 1 })
  })

  it('touches nothing when no store is configured', async () => {
    const row = await runEffect(
      deleteRecord({ db: dbReturning([1, 'a', 'kept.webp']), collection }, 1),
    )
    expect(row).toMatchObject({ cover: 'kept.webp' })
  })
})
