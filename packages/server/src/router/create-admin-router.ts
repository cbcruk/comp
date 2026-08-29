import {
  buildCountQuery,
  buildGetByIdQuery,
  buildListQuery,
  buildRecordsByIdsQuery,
  allowAll,
  authorizeRecordAccess,
  bindManyToMany,
  checkLinkTargets,
  checkUpload,
  checksRecords,
  collectDateHierarchy,
  collectFilterChoices,
  createRecord,
  deleteRecord,
  updateRecord,
  collectDeleteImpact,
  filterSummaries,
  Forbidden,
  inlineOperations,
  inlineSummary,
  prepareInlines,
  manyToManySummary,
  readInlines,
  readManyToMany,
  resolveDeleteRelations,
  NotGranted,
  resolveInlines,
  resolveRelations,
  READ_CONCURRENCY,
  resolveScope,
  runEffect,
  runAction,
  unknownInline,
  validateInsert,
  validateUpdate,
  writeInlines,
  writeManyToMany,
  type ActionDefinition,
  type ActionExecutor,
  type AuthAdapter,
  type Collection,
  type CollectionOperation,
  type DeleteRelation,
  type HistoryStore,
  type Identity,
  type InlineSpec,
  type FileStore,
  type FileSummary,
  type InlineWritePayload,
  type LinkedRecord,
  type ManyToManySpec,
  type ManyToManyWrite,
  type RecordScope,
  type SqliteDb,
} from '@comp/core'
import { Effect } from 'effect'
import { Hono, type Context } from 'hono'
import { handleRouterError } from './error-response.js'
import { splitInlineBody } from './inline-body.js'
import { parseListParams } from './list-params.js'

/**
 * The keys a write sends back, exactly as it must send them.
 *
 * Read and write keep the same shape under `manyToMany` — the whole membership
 * as keys — and the labels travel beside it rather than inside it, so a client
 * can echo what it read without stripping anything out of it first.
 */
function linkKeys(
  links: Record<string, LinkedRecord[]> | undefined,
): Record<string, unknown[]> | undefined {
  if (!links) return undefined
  return Object.fromEntries(
    Object.entries(links).map(([name, records]) => [
      name,
      records.map((record) => record.value),
    ]),
  )
}

/**
 * What each linked record looks like, keyed by its stringified key.
 *
 * The form needs this because its options are a search over the far
 * collection, not the whole of it: a record linked but outside the current
 * results has no other way to say its name, and one that renders as nothing
 * cannot be unlinked.
 */
function linkLabels(
  links: Record<string, LinkedRecord[]> | undefined,
): Record<string, Record<string, string>> | undefined {
  if (!links) return undefined
  return Object.fromEntries(
    Object.entries(links).map(([name, records]) => [
      name,
      Object.fromEntries(
        records
          .filter((record) => record.label !== null)
          .map((record) => [String(record.value), record.label as string]),
      ),
    ]),
  )
}

/**
 * Where each of a record's stored files can be read, keyed by field.
 *
 * A display companion to the keys the row already holds, the way link labels
 * are to link keys: what a key resolves to is the store's business, and the
 * form cannot ask it directly from a browser.
 */
function fileUrls(
  collection: Collection,
  row: Record<string, unknown>,
  store: FileStore | undefined,
): Record<string, string> | undefined {
  if (!store || collection.files.length === 0) return undefined
  const urls: Record<string, string> = {}
  for (const file of collection.files) {
    const key = row[file.field]
    if (typeof key === 'string' && key !== '') urls[file.field] = store.url(key)
  }
  return urls
}

export interface AdminRouterConfig {
  collections: Collection[]
  /** Bulk/custom actions, scoped to a collection by their `collection` slug. */
  actions?: ActionDefinition[]
  /** Auth adapter; defaults to allow-all. */
  auth?: AuthAdapter
  /**
   * Where to record who changed what. Omit it and no history is kept — the
   * feature is opt-in, and its cost (an extra read per update) comes with it.
   */
  history?: HistoryStore
  /**
   * Resolve the database for a request. On Workers the D1 binding lives on
   * `c.env`, so the db must be built per request rather than at module load.
   */
  getDb: (c: Context) => SqliteDb
  /**
   * How an action's handler is run. Defaults to calling it in this isolate.
   *
   * The capability boundary is drawn before the executor sees anything — the
   * context it receives already carries a db narrowed to the action's declared
   * operations — so an executor that ships the call elsewhere inherits the
   * same limits rather than having to reimplement them.
   */
  executor?: ActionExecutor
  /**
   * Where uploads go. Omit it and the file routes are not mounted — a
   * collection may declare file fields and still be served read-only, and a
   * store that does not exist should refuse loudly rather than write nowhere.
   */
  files?: FileStore
}

function allows(collection: Collection, op: CollectionOperation): boolean {
  return collection.manifest.operations.includes(op)
}

/** An action may only touch operations its target collection grants. */
function withinCapabilities(
  action: ActionDefinition,
  collection: Collection,
): boolean {
  return action.operations.every((op) => allows(collection, op))
}

async function parseJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return undefined
  }
}

/**
 * Mount Comp's read + write API for a set of collections. Every operation
 * routes through `@comp/core`'s query/validation layer — the server never
 * builds SQL or validates itself, it only adapts HTTP to the core contract.
 * Writes are gated on the collection manifest's declared operations.
 */
export function createAdminRouter(config: AdminRouterConfig): Hono {
  const app = new Hono()
  // Registered once, so a route can throw a core failure instead of each one
  // remembering to catch. A rule every route has to remember is a rule that
  // holds until somebody adds a route.
  app.onError(handleRouterError)
  const auth = config.auth ?? allowAll
  const bySlug = new Map(config.collections.map((c) => [c.slug, c]))
  // The relation graph is a property of the whole registry, so it is resolved
  // once here rather than per request — and served to clients so the UI never
  // has to be told which collection an FK points at. Inlines bind to that same
  // graph, and a bad declaration throws here, at startup, not on a request.
  const relations = resolveRelations(config.collections)
  const inlines = resolveInlines(config.collections)
  // A join table is not a collection, so the far side of every many-to-many is
  // bound here, where the registry is known — the same startup step inlines
  // and the relation graph take.
  const links = bindManyToMany(config.collections)
  const deleteRelations = resolveDeleteRelations(config.collections)
  const actionsBySlug = new Map<string, ActionDefinition[]>()
  for (const action of config.actions ?? []) {
    const list = actionsBySlug.get(action.collection) ?? []
    list.push(action)
    actionsBySlug.set(action.collection, list)
  }

  /**
   * Who is calling, resolved at most once for a request.
   *
   * `authenticate` is a pure function of the request, so asking again can only
   * produce the same answer — at the cost of verifying the session signature
   * again, which for the passkey adapter is a `crypto.subtle.verify` each
   * time. Five helpers here ask, and those helpers are called throughout a
   * request. Keyed on the request object and held weakly, so an entry cannot
   * outlive the request it belongs to; the promise itself is cached, so
   * concurrent askers share one in-flight authentication rather than starting
   * a second.
   */
  const identities = new WeakMap<Request, Promise<Identity | null>>()
  function identityOf(c: Context): Promise<Identity | null> {
    const request = c.req.raw
    const cached = identities.get(request)
    if (cached) return cached
    const pending = Promise.resolve(auth.authenticate(request))
    identities.set(request, pending)
    return pending
  }

  /**
   * The same, for the scope. Core already says a scope resolved twice is a
   * scope that can disagree with itself; this makes that structurally true
   * within a request rather than a rule each call site follows.
   */
  const scopes = new WeakMap<
    Request,
    Map<string, Promise<RecordScope | undefined>>
  >()

  async function authorized(
    c: Context,
    collection: Collection,
    operation: CollectionOperation,
  ): Promise<boolean> {
    const identity = await identityOf(c)
    return Boolean(await auth.authorize({ identity, collection, operation }))
  }

  /**
   * Which rows of this collection exist for this caller. Resolved once per
   * request and handed to every query the request makes, so the list, its
   * total, its filter choices, and the row a write reaches all agree about
   * what is there.
   */
  function scopeFor(
    c: Context,
    collection: Collection,
  ): Promise<RecordScope | undefined> {
    const perCollection =
      scopes.get(c.req.raw) ??
      new Map<string, Promise<RecordScope | undefined>>()
    scopes.set(c.req.raw, perCollection)
    const cached = perCollection.get(collection.slug)
    if (cached) return cached
    const pending = identityOf(c).then((identity) =>
      resolveScope(auth, identity, collection),
    )
    perCollection.set(collection.slug, pending)
    return pending
  }

  /**
   * Read the row a request names and decide whether this caller may do that to
   * it — Django's `has_change_permission(request, obj)`, one layer down from
   * the model-wide grant that has already been checked.
   *
   * The two refusals mean different things on purpose. A row outside the
   * caller's scope is *not found*: it does not exist as far as they are
   * concerned, and saying "forbidden" would confirm that it does. A row they
   * can see but may not touch is forbidden.
   */
  async function loadRecord(
    c: Context,
    collection: Collection,
    db: SqliteDb,
    id: unknown,
    operation: CollectionOperation,
    scope: RecordScope | undefined,
  ): Promise<{ row: Record<string, unknown> } | { refusal: Response }> {
    const rows = await buildGetByIdQuery(db, collection, id, scope).all()
    const row = rows[0] as Record<string, unknown> | undefined
    if (!row) return { refusal: c.json({ error: 'Not found' }, 404) }

    const identity = await identityOf(c)
    const allowed = await authorizeRecordAccess(auth, {
      identity,
      collection,
      operation,
      record: row,
    })
    return allowed ? { row } : { refusal: c.json({ error: 'Forbidden' }, 403) }
  }

  /**
   * The ids an action may actually act on: those that exist for this caller
   * and survive the per-record rule for every operation the action declares.
   *
   * The ids come back off the rows rather than being echoed from the request,
   * so what the handler receives is what the database confirmed.
   */
  async function visibleIds(
    c: Context,
    collection: Collection,
    db: SqliteDb,
    operations: readonly CollectionOperation[],
    requested: unknown[],
  ): Promise<unknown[]> {
    if (requested.length === 0 || !checksRecords(auth)) return requested

    const rows = (await buildRecordsByIdsQuery(
      db,
      collection,
      requested,
      await scopeFor(c, collection),
    ).all()) as Record<string, unknown>[]

    const identity = await identityOf(c)
    const key = collection.primaryKey
    if (!key) return []

    // A row's decision never depends on another row's, so the rows go
    // together too — this used to run every row's checks in turn, and a bulk
    // action is exactly the case where there are many of them.
    const decisions = await runEffect(
      Effect.forEach(
        rows,
        (row) =>
          Effect.promise(async () => {
            const permitted = await Promise.all(
              operations.map((operation) =>
                authorizeRecordAccess(auth, {
                  identity,
                  collection,
                  operation,
                  record: row,
                }),
              ),
            )
            return permitted.every(Boolean)
          }),
        { concurrency: READ_CONCURRENCY },
      ),
    )
    return rows.filter((_, index) => decisions[index]).map((row) => row[key])
  }

  function specsFor(collection: Collection): InlineSpec[] {
    return inlines.get(collection.slug) ?? []
  }

  function linksFor(collection: Collection): ManyToManySpec[] {
    return links.get(collection.slug) ?? []
  }

  /**
   * A record's links, gated per relationship on listing the far collection —
   * reaching its records sideways must not grant more than reaching them
   * directly would.
   */
  async function linkedRecords(
    c: Context,
    collection: Collection,
    row: Record<string, unknown>,
    db: SqliteDb,
  ): Promise<Record<string, LinkedRecord[]> | undefined> {
    return runEffect(
      readManyToMany(db, linksFor(collection), row, async (spec) => {
        if (!allows(spec.target, 'list')) return false
        return authorized(c, spec.target, 'list')
      }),
    )
  }

  /**
   * Refuse a link write the caller could not make directly: choosing among a
   * collection's records is a way of reading them, so it answers to that
   * collection's own permission, exactly as an inline does.
   */
  async function refuseLinkWrite(
    c: Context,
    collection: Collection,
    payload: ManyToManyWrite,
  ): Promise<Response | null> {
    const byName = new Map(
      linksFor(collection).map((spec) => [spec.name, spec]),
    )
    for (const name of Object.keys(payload)) {
      const spec = byName.get(name)
      if (!spec) {
        return c.json({ error: `"${name}" is not a relationship here` }, 400)
      }
      if (!(await authorized(c, spec.target, 'list'))) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }
    return null
  }

  /**
   * A parent's child rows, with each inline gated on the child's own manifest
   * and permissions — an inline is a view onto another collection, so it never
   * grants more than reading that collection directly would.
   */
  async function inlineRows(
    c: Context,
    collection: Collection,
    row: Record<string, unknown>,
    db: SqliteDb,
  ): Promise<Record<string, Record<string, unknown>[]> | undefined> {
    const specs = specsFor(collection)
    if (specs.length === 0) return undefined
    return runEffect(
      readInlines(db, specs, row, async (spec) => {
        if (!allows(spec.collection, 'list')) return false
        return authorized(c, spec.collection, 'list')
      }),
    )
  }

  /**
   * Check an inline write before anything runs: the child must be an inline of
   * this parent, expose each operation the write needs, and permit it for this
   * caller. Returns the refusal to send, or null to proceed.
   */
  async function refuseInlineWrite(
    c: Context,
    collection: Collection,
    payload: InlineWritePayload,
  ): Promise<Response | null> {
    const bySlug = new Map(
      specsFor(collection).map((spec) => [spec.collection.slug, spec]),
    )
    for (const [slug, write] of Object.entries(payload)) {
      const spec = bySlug.get(slug)
      // Refused in the shared vocabulary, not in prose invented here: the
      // write refuses the same conditions itself, and a pre-check that words
      // them differently makes one transport disagree with another.
      if (!spec) throw unknownInline(slug)
      for (const operation of inlineOperations(write)) {
        if (!allows(spec.collection, operation)) {
          throw new NotGranted({
            collection: slug,
            operation,
            reason: 'the collection does not allow it',
          })
        }
        if (!(await authorized(c, spec.collection, operation))) {
          throw new Forbidden({ collection: slug, operation })
        }
      }
    }
    return null
  }

  /** Who is making this request, for the history entry. */
  async function actorOf(c: Context): Promise<string | null> {
    if (!config.history) return null
    const identity: Identity | null = await identityOf(c)
    return identity?.subject ?? null
  }

  async function mutationContext(
    c: Context,
    collection: Collection,
    db: SqliteDb,
  ): Promise<{
    db: SqliteDb
    collection: Collection
    history: HistoryStore | undefined
    files: FileStore | undefined
    actor: string | null
  }> {
    return {
      db,
      collection,
      history: config.history,
      // The same store the uploads went to: a write that replaces a key is the
      // only thing that knows the old file is now unreferenced.
      files: config.files,
      actor: await actorOf(c),
    }
  }

  /**
   * The operations this caller may actually perform on a collection.
   *
   * The adapter is asked about every operation at once. Nothing orders one
   * question after another, and the index below asks this of every collection
   * — run in sequence the site index was a queue whose length was the app's
   * declaration size times the manifest's.
   */
  async function permittedOperations(
    c: Context,
    collection: Collection,
  ): Promise<CollectionOperation[]> {
    const decisions = await runEffect(
      Effect.forEach(
        collection.manifest.operations,
        (operation) =>
          Effect.promise(() => authorized(c, collection, operation)),
        { concurrency: READ_CONCURRENCY },
      ),
    )
    return collection.manifest.operations.filter((_, i) => decisions[i])
  }

  /**
   * The site index. A collection this caller cannot list is left out entirely
   * rather than listed and then refused — an index that advertises screens you
   * are not allowed to open is worse than no index.
   */
  app.get('/collections', async (c) => {
    const permissions = await runEffect(
      Effect.forEach(
        config.collections,
        (collection) =>
          Effect.promise(() => permittedOperations(c, collection)),
        { concurrency: READ_CONCURRENCY },
      ),
    )

    const summaries = []
    for (const [index, collection] of config.collections.entries()) {
      const permitted = permissions[index] ?? []
      if (!permitted.includes('list')) continue
      summaries.push({
        slug: collection.slug,
        label: collection.label,
        labelPlural: collection.labelPlural,
        // What this caller may do: the manifest narrowed by permission.
        permitted,
        listDisplay: collection.listDisplay,
        filters: filterSummaries(
          collection.filters,
          relations.outbound[collection.slug] ?? [],
          (links.get(collection.slug) ?? []).map(manyToManySummary),
        ),
        search: collection.search,
        dateHierarchy: collection.dateHierarchy,
        fields: collection.fields,
        primaryKey: collection.primaryKey,
        labelField: collection.labelField,
        form: collection.form,
        relations: relations.outbound[collection.slug] ?? [],
        inbound: relations.inbound[collection.slug] ?? [],
        inlines: (inlines.get(collection.slug) ?? []).map(inlineSummary),
        manyToMany: (links.get(collection.slug) ?? []).map(manyToManySummary),
        // Only when a store is mounted: a picker with nowhere to put the bytes
        // is a control that cannot do what it offers.
        files: config.files ? collection.files : [],
        manifest: collection.manifest,
        actions: (actionsBySlug.get(collection.slug) ?? []).map(
          (action) => action.manifest,
        ),
      })
    }
    return c.json(summaries)
  })

  /**
   * Take one file for one field and answer with the key that names it.
   *
   * Deliberately its own request rather than a multipart create/update. Two
   * things fall out of that and both are why: the write path keeps taking
   * JSON, so a file field is just the text column it always was; and a file
   * can be chosen on the *add* form, where there is no record yet and so no id
   * a key could be derived from.
   *
   * The cost is an upload whose form is then abandoned — bytes nothing points
   * at. That is a store's problem to sweep, and the trade a record that cannot
   * exist yet forces.
   */
  app.post('/collections/:slug/files/:field', async (c) => {
    const store = config.files
    if (!store) return c.json({ error: 'No file store' }, 404)

    const collection = bySlug.get(c.req.param('slug'))
    if (!collection) return c.json({ error: 'Unknown collection' }, 404)

    const field = c.req.param('field')
    const summary: FileSummary | undefined = collection.files.find(
      (entry) => entry.field === field,
    )
    if (!summary) return c.json({ error: 'Unknown file field' }, 404)

    // Storing a file is a write, and it happens before the record exists — so
    // it answers to whichever write the caller could go on to make.
    const mayWrite =
      (await authorized(c, collection, 'create')) ||
      (await authorized(c, collection, 'update'))
    if (!mayWrite) return c.json({ error: 'Forbidden' }, 403)

    let file: unknown
    try {
      const body = await c.req.parseBody()
      file = body.file
    } catch {
      return c.json({ error: 'Expected a multipart body' }, 400)
    }
    if (!(file instanceof File)) {
      return c.json({ error: 'Expected a file part named "file"' }, 400)
    }

    const refusal = checkUpload(summary, file.type, file.size)
    if (refusal) {
      return c.json({ error: refusal, issues: [{ path: [field], message: refusal }] }, 422)
    }

    const stored = await store.put({
      collection: collection.slug,
      field,
      filename: file.name,
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })
    return c.json(stored, 201)
  })

  app.get('/collections/:slug/:id/delete-preview', async (c) => {
    const collection = bySlug.get(c.req.param('slug'))
    if (!collection) return c.json({ error: 'Unknown collection' }, 404)
    if (!allows(collection, 'delete')) {
      return c.json({ error: 'Delete not allowed' }, 405)
    }
    if (!(await authorized(c, collection, 'delete'))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const db = config.getDb(c)
    const found = await loadRecord(
      c,
      collection,
      db,
      c.req.param('id'),
      'delete',
      await scopeFor(c, collection),
    )
    if ('refusal' in found) return found.refusal

    const relations: DeleteRelation[] =
      deleteRelations.get(collection.slug) ?? []
    return c.json({
      data: await runEffect(
        collectDeleteImpact(db, collection, found.row, relations),
      ),
    })
  })

  /**
   * Recent activity across the site — the panel Django puts on its index.
   * Narrowed to collections this caller may list, so history cannot become a
   * way to learn about records they are not allowed to see.
   */
  app.get('/history', async (c) => {
    if (!config.history) return c.json({ error: 'History is not enabled' }, 404)

    // One question per collection, none of them ordered against another.
    const listable = await runEffect(
      Effect.forEach(
        config.collections,
        (collection) => Effect.promise(() => authorized(c, collection, 'list')),
        { concurrency: READ_CONCURRENCY },
      ),
    )
    const visible = config.collections
      .filter((_, index) => listable[index])
      .map((collection) => collection.slug)

    const limit = Number.parseInt(c.req.query('limit') ?? '', 10)
    return c.json({
      data: await config.history.list({
        collections: visible,
        ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      }),
    })
  })

  app.get('/collections/:slug', async (c) => {
    const collection = bySlug.get(c.req.param('slug'))
    if (!collection) return c.json({ error: 'Unknown collection' }, 404)
    if (!(await authorized(c, collection, 'list'))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const db = config.getDb(c)
    // The scope is part of the query, not a check after it: the rows, the
    // total, the drill-down counts and the filter choices are all the same
    // narrowed set.
    const scope = await scopeFor(c, collection)
    const params = {
      ...parseListParams(collection, c.req.query()),
      ...(scope ? { scope } : {}),
    }
    // Four reads of one narrowed set, and none of them waits on another: the
    // page of rows, its total, the drill-down counts, and what a distinct-value
    // filter may be set to. Run in sequence this was four round trips deep on
    // an edge request that needs all four before it can answer.
    const [rows, totals, hierarchy, choices] = await runEffect(
      Effect.all(
        [
          Effect.promise(() => buildListQuery(db, collection, params).all()),
          Effect.promise(() => buildCountQuery(db, collection, params).all()),
          // The strip belongs to the list it navigates, so it is resolved in
          // the same request rather than left for a second round trip.
          collectDateHierarchy(db, collection, params),
          // Data-dependent, so it cannot travel with the static collection
          // summary; costs nothing unless a `values` filter is declared.
          collectFilterChoices(db, collection, scope),
        ],
        { concurrency: 'unbounded' },
      ),
    )

    return c.json({
      data: rows,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? collection.pageSize,
      total: totals[0]?.count ?? 0,
      hierarchy,
      choices,
    })
  })

  app.get('/collections/:slug/:id', async (c) => {
    const collection = bySlug.get(c.req.param('slug'))
    if (!collection) return c.json({ error: 'Unknown collection' }, 404)
    if (!(await authorized(c, collection, 'read'))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const db = config.getDb(c)
    const found = await loadRecord(
      c,
      collection,
      db,
      c.req.param('id'),
      'read',
      await scopeFor(c, collection),
    )
    if ('refusal' in found) return found.refusal

    // Two reads of the same record's neighbours; neither waits on the other.
    const [nestedInlines, nestedLinks] = await Promise.all([
      inlineRows(c, collection, found.row, db),
      linkedRecords(c, collection, found.row, db),
    ])
    return c.json({
      data: found.row,
      inlines: nestedInlines,
      manyToMany: linkKeys(nestedLinks),
      manyToManyLabels: linkLabels(nestedLinks),
      fileUrls: fileUrls(collection, found.row, config.files),
    })
  })

  app.post('/collections/:slug', async (c) => {
    const collection = bySlug.get(c.req.param('slug'))
    if (!collection) return c.json({ error: 'Unknown collection' }, 404)
    if (!allows(collection, 'create')) {
      return c.json({ error: 'Create not allowed' }, 405)
    }
    if (!(await authorized(c, collection, 'create'))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const body = splitInlineBody(await parseJsonBody(c))
    const refusal =
      (await refuseInlineWrite(c, collection, body.inlines)) ??
      (await refuseLinkWrite(c, collection, body.manyToMany))
    if (refusal) return refusal

    const db = config.getDb(c)
    // No scope here, and no per-record check: there is no record yet to
    // narrow to or to decide about. What may be created is the collection's
    // `create` grant plus validation — the same split Django makes, where
    // `has_add_permission` is the one that takes no object.
    const values = validateInsert(collection, body.values)
    // The whole nested payload is checked before anything is written. A child
    // row that cannot be inserted used to be discovered after the parent
    // already existed, and D1 has no transaction to undo that with.
    const inlines = await runEffect(
      prepareInlines(specsFor(collection), body.inlines),
    )
    await runEffect(checkLinkTargets(db, linksFor(collection), body.manyToMany))
    const row = await runEffect(
      createRecord(await mutationContext(c, collection, db), values),
    )
    if (!row) return c.json({ error: 'Insert returned no row' }, 500)

    await runEffect(writeInlines(db, specsFor(collection), row, inlines))
    await runEffect(
      writeManyToMany(db, linksFor(collection), row, body.manyToMany),
    )
    const [nestedInlines, nestedLinks] = await Promise.all([
      inlineRows(c, collection, row, db),
      linkedRecords(c, collection, row, db),
    ])
    return c.json(
      {
        data: row,
        inlines: nestedInlines,
        manyToMany: linkKeys(nestedLinks),
        manyToManyLabels: linkLabels(nestedLinks),
        fileUrls: fileUrls(collection, row, config.files),
      },
      201,
    )
  })

  app.patch('/collections/:slug/:id', async (c) => {
    const collection = bySlug.get(c.req.param('slug'))
    if (!collection) return c.json({ error: 'Unknown collection' }, 404)
    if (!allows(collection, 'update')) {
      return c.json({ error: 'Update not allowed' }, 405)
    }
    if (!(await authorized(c, collection, 'update'))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const body = splitInlineBody(await parseJsonBody(c))
    const refusal =
      (await refuseInlineWrite(c, collection, body.inlines)) ??
      (await refuseLinkWrite(c, collection, body.manyToMany))
    if (refusal) return refusal

    const db = config.getDb(c)
    const scope = await scopeFor(c, collection)
    // Deciding per record means reading the record, so only an adapter that
    // decides per record pays for it. The row read here is also the "before"
    // state history would otherwise read again.
    let before: Record<string, unknown> | undefined
    if (checksRecords(auth)) {
      const found = await loadRecord(
        c,
        collection,
        db,
        c.req.param('id'),
        'update',
        scope,
      )
      if ('refusal' in found) return found.refusal
      before = found.row
    }

    const values = validateUpdate(collection, body.values)
    const inlines = await runEffect(
      prepareInlines(specsFor(collection), body.inlines),
    )
    // Editing only the child rows is a real edit; don't force an empty
    // UPDATE on the parent just to get at its inlines.
    const row =
      Object.keys(values).length > 0
        ? await runEffect(
            updateRecord(
              {
                ...(await mutationContext(c, collection, db)),
                ...(scope ? { scope } : {}),
                ...(before ? { before } : {}),
              },
              c.req.param('id'),
              values,
            ),
          )
        : (before ??
          ((
            await buildGetByIdQuery(
              db,
              collection,
              c.req.param('id'),
              scope,
            ).all()
          )[0] as Record<string, unknown> | undefined))
    if (!row) return c.json({ error: 'Not found' }, 404)

    await runEffect(writeInlines(db, specsFor(collection), row, inlines))
    await runEffect(
      writeManyToMany(db, linksFor(collection), row, body.manyToMany),
    )
    const [nestedInlines, nestedLinks] = await Promise.all([
      inlineRows(c, collection, row, db),
      linkedRecords(c, collection, row, db),
    ])
    return c.json({
      data: row,
      inlines: nestedInlines,
      manyToMany: linkKeys(nestedLinks),
      manyToManyLabels: linkLabels(nestedLinks),
      // The row the update produced, not the one it replaced: a changed key
      // must not answer with the file it changed away from.
      fileUrls: fileUrls(collection, row, config.files),
    })
  })

  app.delete('/collections/:slug/:id', async (c) => {
    const collection = bySlug.get(c.req.param('slug'))
    if (!collection) return c.json({ error: 'Unknown collection' }, 404)
    if (!allows(collection, 'delete')) {
      return c.json({ error: 'Delete not allowed' }, 405)
    }
    if (!(await authorized(c, collection, 'delete'))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const db = config.getDb(c)
    const scope = await scopeFor(c, collection)
    if (checksRecords(auth)) {
      const found = await loadRecord(
        c,
        collection,
        db,
        c.req.param('id'),
        'delete',
        scope,
      )
      if ('refusal' in found) return found.refusal
    }

    const row = await runEffect(
      deleteRecord(
        {
          ...(await mutationContext(c, collection, db)),
          ...(scope ? { scope } : {}),
        },
        c.req.param('id'),
      ),
    )
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json({ data: row })
  })

  /**
   * A record's history — Django's per-object history view. Gated on reading
   * the record, since that is what the entries are about; the entries survive
   * the record, so this keeps answering after a delete.
   */
  app.get('/collections/:slug/:id/history', async (c) => {
    const collection = bySlug.get(c.req.param('slug'))
    if (!collection) return c.json({ error: 'Unknown collection' }, 404)
    if (!config.history) return c.json({ error: 'History is not enabled' }, 404)
    if (!(await authorized(c, collection, 'read'))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // Entries say what a record was, so a caller who may not see the record
    // may not read them either. Only checked when the adapter decides per
    // record; otherwise this keeps answering after the row is deleted, which
    // is the point of keeping the label on the entry.
    if (checksRecords(auth)) {
      const found = await loadRecord(
        c,
        collection,
        config.getDb(c),
        c.req.param('id'),
        'read',
        await scopeFor(c, collection),
      )
      if ('refusal' in found) return found.refusal
    }

    const limit = Number.parseInt(c.req.query('limit') ?? '', 10)
    return c.json({
      data: await config.history.list({
        collection: collection.slug,
        recordId: c.req.param('id'),
        ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      }),
    })
  })

  app.post('/collections/:slug/actions/:name', async (c) => {
    const collection = bySlug.get(c.req.param('slug'))
    if (!collection) return c.json({ error: 'Unknown collection' }, 404)

    const action = (actionsBySlug.get(collection.slug) ?? []).find(
      (a) => a.name === c.req.param('name'),
    )
    if (!action) return c.json({ error: 'Unknown action' }, 404)
    if (!withinCapabilities(action, collection)) {
      return c.json(
        { error: "Action exceeds the collection's capabilities" },
        403,
      )
    }
    for (const operation of action.operations) {
      if (!(await authorized(c, collection, operation))) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }

    const body = (await parseJsonBody(c)) as
      { ids?: unknown[]; input?: unknown } | undefined
    const requested = Array.isArray(body?.ids) ? body.ids : []

    const db = config.getDb(c)
    // An action reaches rows by id, so the scope has to narrow the ids before
    // the handler sees them — otherwise "delete the selected" is a way to
    // delete what the list would never have shown.
    const ids = await visibleIds(
      c,
      collection,
      db,
      action.operations,
      requested,
    )

    const result = await runAction(
      action,
      { db, collection, ids, input: body?.input },
      config.executor,
    )
    return c.json(result)
  })

  return app
}
