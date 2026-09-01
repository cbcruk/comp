import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { defineCollection } from '../collection/define-collection.js'
import { checkUpload } from './resolve-files.js'

const books = sqliteTable('books', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  cover: text('cover'),
  pages: integer('pages'),
})

describe('declaring a file field', () => {
  it('resolves against the column that holds the key', () => {
    const collection = defineCollection({
      model: books,
      listDisplay: ['title'],
      files: [{ field: 'cover', accept: 'image/*', maxBytes: 1024 }],
    })
    expect(collection.files).toEqual([
      { field: 'cover', accept: 'image/*', maxBytes: 1024 },
    ])
  })

  it('takes a bare name', () => {
    const collection = defineCollection({
      model: books,
      listDisplay: ['title'],
      files: ['cover'],
    })
    expect(collection.files).toEqual([
      { field: 'cover', accept: null, maxBytes: null },
    ])
  })

  it('refuses a name that is not a column', () => {
    expect(() =>
      defineCollection({
        model: books,
        listDisplay: ['title'],
        files: ['jacket'],
      }),
    ).toThrow(/not a column/)
  })

  it('refuses a column that cannot hold a key', () => {
    expect(() =>
      defineCollection({
        model: books,
        listDisplay: ['title'],
        files: ['pages'],
      }),
    ).toThrow(/which is a number column/)
  })

  it('refuses a readonly field', () => {
    // Readonly is stripped on the write path, so the upload would be stored and
    // its key thrown away — a file nothing points at, and a form that looked
    // like it saved.
    expect(() =>
      defineCollection({
        model: books,
        listDisplay: ['title'],
        readonlyFields: ['cover'],
        files: ['cover'],
      }),
    ).toThrow(/which is readonly/)
  })
})

describe('checking one upload', () => {
  const cover = { field: 'cover', accept: 'image/*', maxBytes: 100 }

  it('takes what the field accepts', () => {
    expect(checkUpload(cover, 'image/png', 50)).toBeNull()
  })

  it('refuses a type outside the accept list', () => {
    expect(checkUpload(cover, 'application/pdf', 50)).toMatch(/accepts image/)
  })

  it('refuses bytes over the limit', () => {
    expect(checkUpload(cover, 'image/png', 101)).toMatch(/at most 100 bytes/)
  })

  it('reads a charset off the content type', () => {
    const any = { field: 'doc', accept: 'text/plain', maxBytes: null }
    expect(checkUpload(any, 'text/plain; charset=utf-8', 1)).toBeNull()
  })

  it('ignores extension entries, which name a file and not its type', () => {
    const any = { field: 'doc', accept: '.csv,text/csv', maxBytes: null }
    expect(checkUpload(any, 'text/csv', 1)).toBeNull()
    expect(checkUpload(any, 'text/plain', 1)).toMatch(/accepts/)
  })

  it('has no opinion when nothing was declared', () => {
    const any = { field: 'doc', accept: null, maxBytes: null }
    expect(checkUpload(any, 'application/octet-stream', 10_000)).toBeNull()
  })
})
