import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { bindManyToMany } from '../m2m/resolve-m2m.js'
import { defineCollection } from './define-collection.js'
import type { ListDisplayEntry } from './list-columns.js'

const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
})

const authors = sqliteTable('authors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
})

const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  authorId: integer('author_id').references(() => authors.id),
})

const postTags = sqliteTable('post_tags', {
  postId: integer('post_id')
    .notNull()
    .references(() => posts.id),
  tagId: integer('tag_id')
    .notNull()
    .references(() => tags.id),
})

const declare = (listDisplay: ListDisplayEntry[], linked = false) =>
  defineCollection({
    model: posts,
    listDisplay,
    ...(linked
      ? { manyToMany: [{ collection: 'tags', through: postTags }] }
      : {}),
  })

describe('resolving list columns', () => {
  it('leaves a plain column alone', () => {
    expect(declare(['title']).listColumns).toEqual([
      { key: 'title', field: 'title', sortable: true },
    ])
  })

  it('records what a traversal reaches, keyed by how it was declared', () => {
    expect(declare(['authorId__name']).listColumns).toEqual([
      {
        key: 'authorId__name',
        field: 'authorId',
        through: { table: 'authors', field: 'name' },
        sortable: true,
      },
    ])
  })

  // The key is the wire contract: the value is selected under it, so a client
  // reads row["authorId__name"] exactly as it reads row["title"], and the
  // admin needs to know nothing about traversals to render the cell.
  it('keeps listDisplay itself the list of keys', () => {
    expect(declare(['title', 'authorId__name']).listDisplay).toEqual([
      'title',
      'authorId__name',
    ])
  })

  /**
   * A record has one author, so its name is a value a cell can hold. It has
   * any number of tags, so there is nothing single to show — and joining would
   * multiply the row, which is the whole reason search reaches a join table
   * with a subquery instead. Refused by name rather than left to render an
   * arbitrary one of them — and pointed at `collect`, which is the aggregate
   * that can honestly answer.
   */
  it('refuses a many-to-many, which has no single value to show', () => {
    expect(() => declare(['tags__name'], true)).toThrow(/many-to-many/)
    expect(() => declare(['tags__name'], true)).toThrow(/collect/)
  })

  // The label is read off a record, and a traversal's value only exists on a
  // list row — so it is never what identifies the record.
  it('is not eligible to become the label field', () => {
    expect(declare(['authorId__name', 'title']).labelField).toBe('title')
  })

  it('refuses a traversal through a column that is not a key', () => {
    expect(() => declare(['title__name'])).toThrow(/is not a foreign key/)
  })

  it('refuses a traversal onto a column the far table lacks', () => {
    expect(() => declare(['authorId__nope'])).toThrow(/is not a column there/)
  })

  it('refuses a name that is not a column at all', () => {
    expect(() => declare(['nope'])).toThrow(/is not a column/)
    expect(() => declare(['nope__name'])).toThrow(/is not a column/)
  })
})

describe('collecting a many-to-many into one cell', () => {
  const collect = (field = 'name', separator?: string) =>
    declare(
      ['title', { collect: 'tags', field, ...(separator ? { separator } : {}) }],
      true,
    )

  it('reads on the row under the key a traversal would have used', () => {
    // The client reads `row["tags__name"]` exactly as it reads `row["title"]`;
    // that it was an aggregate is the query layer's business.
    expect(collect().listColumns[1]).toEqual({
      key: 'tags__name',
      field: 'tags',
      collect: { relationship: 'tags', field: 'name', separator: ', ' },
      sortable: false,
    })
    expect(collect().listDisplay).toEqual(['title', 'tags__name'])
  })

  it('is not offered as something to order by', () => {
    // There is no column behind it, so a header that offered an order would be
    // offering one nothing could apply.
    expect(collect().sortable).toEqual(['title'])
  })

  it('takes its own separator', () => {
    expect(collect('name', ' / ').listColumns[1]?.collect?.separator).toBe(' / ')
  })

  it('refuses a relationship the collection does not declare', () => {
    expect(() =>
      declare(['title', { collect: 'authors', field: 'name' }], true),
    ).toThrow(/not one of its many-to-many relationships/)
  })

  it('refuses a field the far collection lacks, once the registry knows it', () => {
    // Only checkable at bind time: until then the far side is a table name.
    const posts = collect('nope')
    const tagCollection = defineCollection({
      model: tags,
      listDisplay: ['name'],
      labelField: 'name',
    })
    expect(() => bindManyToMany([posts, tagCollection])).toThrow(
      /which is not a column on "tags"/,
    )
  })
})
