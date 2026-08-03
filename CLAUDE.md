# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What Comp is

**Comp** is a schema-driven, serverless admin framework for TypeScript — the
spiritual successor to Django's admin, rebuilt for the edge.

Django's killer feature is _introspecting a model to auto-generate a whole
admin_: the list view with its columns, filters and search; the change form
with its layout, related widgets, and inline child records; bulk actions;
per-model permissions; a history of who changed what. Comp ports that to
TypeScript/serverless: you declare a collection over a Drizzle table and Comp
generates the UI, an HTTP API, an MCP tool surface, and CLI scaffolding, running
on Cloudflare Workers.

```ts
// Django                          // Comp
class PostAdmin(admin.ModelAdmin): defineCollection({
  list_display = ['title','status']  model: posts,                 // Drizzle table
  list_filter  = ['status']          listDisplay: ['title','status'],
  search_fields = ['title','body']   filters: ['status'],
                                     search: ['title','body'],
                                   })
```

**That snippet is the starting point, not the target.** Comp today covers the
single-table slice of Django's admin, plus relations, inlines, filter and
search lookups, form layout, history, and a generated site. The parity backlog
below is the real scope; treat it as the roadmap, not as a wishlist.

## Django admin parity — the backlog

This is the feature list Comp exists to reproduce. Pick from here by default.

**Done**

- `list_display`, ordering, pagination.
- Change/add form derived from the schema, with Zod validation surfaced
  field-by-field.
- `list_editable`-style inline cell editing in the list.
- Admin `actions` (bulk + custom), declared with a capability manifest.
- Relation **introspection**: foreign keys are read off the schema
  (`FieldMeta.relation`, `Collection.relations`) and resolved across the
  registry into a two-way graph (`resolveRelations` → outbound + inbound).
  A per-collection `labelField` re-derives Django's `__str__` role: what a
  record looks like when something else points at it.
- Relation **widgets on the read/write side**: FK columns render labels and FK
  fields render a select, both driven by the introspected graph rather than
  hand-declared props.
- **Inlines** — a parent edited together with its dependent rows (Django's
  `TabularInline`). `inlines: ["order_items"]` binds to `RelationGraph.inbound`
  at startup (`resolveInlines`); the record's children are read with it and
  written in the same request, over HTTP, MCP, and the React `InlineEditor`.
  Rules worth keeping: every child update/delete is scoped to the parent **in
  SQL**, the parent key is set on create and stripped from update (no
  re-parenting), issue paths carry `inlines.<slug>.<index>.<field>`, and an
  inline never grants more than the child collection's own manifest does.
  Writes apply delete → update → create sequentially; D1 has no interactive
  transactions, so `writeInlines` is the seam where a batch lands when it can.
- **An admin site, not just components** — `AdminSite` renders the index, list,
  add, change, and delete confirmation for whatever collections the server
  reports, so an app stops assembling a screen per collection. The screens are
  named in core (`AdminRoute`/`adminPath`) so links agree across surfaces, and
  the site is controlled: bring a router, or take `useHashRoute`. Two rules hold
  it up — `/collections` is narrowed by permission and reports what this caller
  may do, so the index never advertises a screen that would 403; and the delete
  confirmation counts what the delete reaches (`collectDeleteImpact`) from the
  inbound relation graph, saying per key whether the rows cascade, get cleared,
  or refuse the delete outright.
- **Form layout** — the add/change form is a layout, not a field list.
  `fields`/`exclude` narrow and order it, a nested array puts fields on one
  line, `fieldsets` groups them with headings and a collapsed flag,
  `readonlyFields` shows without writing, `prepopulated` derives one field from
  others (a slug from a title), `radioFields` swaps a select for radios.
  `resolveForm` throws at declaration time on a name that is not a column, on a
  prepopulated target that is readonly or not text, and on a readonly column
  that is required with no default — a layout typo otherwise costs an input
  silently. The teeth are on the write side: `stripReadonly` runs inside
  `validateInsert`/`validateUpdate`, so readonly is enforced on every transport
  rather than only hidden in the UI, and MCP's write tools omit those fields.
- **`list_filter` with real lookups** — a filter is a *spec*, not a bare
  value. `resolveFilters` reads each declared column's kind off the schema
  (enum → its values, boolean → yes/no, date → named windows, FK → the records
  it points at) and whether it is nullable; a value states its operation on the
  wire (`in:`, `isnull:`, `range:`, `preset:`), so a filtered list is a
  shareable link that keeps meaning what it said. Operands are coerced to the
  column's type — without that a numeric column silently matches nothing.
  Relative windows resolve against a `now` passed into `ListParams`, shared by
  the rows and their count, so the query stays pure and reproducible.
- **`search_fields` with lookups** — the box splits into terms, and every term
  must match at least one field, so a second word narrows instead of finding
  nothing. A prefix picks the lookup (`^` start, `=` whole value, bare
  anywhere-inside) and `field__other` follows the foreign key in `field`. A
  traversal compiles to a subquery, not a join, so the row set stays
  one-per-record: no `DISTINCT`, and the count matches the rows. A name that is
  not a column, or a traversal through something that is not a key, throws at
  declaration time.
- **History** — who changed what, when, and which fields. The hook is in the
  mutation layer (`createRecord`/`updateRecord`/`deleteRecord`), not in each
  transport: an HTTP write and an MCP write are the same change, and a history
  that sees only one is worse than none. `HistoryStore` is an adapter
  (Drizzle/D1 and in-memory ship with it) and is entirely opt-in — pass no
  store and nothing is recorded, including the extra read an update needs to
  diff. An entry keeps the record's label, so it still says what was deleted
  after the row is gone; an update records only the fields whose value moved,
  since a form sends the whole record back. Read per record
  (`/collections/:slug/:id/history`, `<slug>__history`, the site's history
  screen) or site-wide (`/history`), the latter narrowed to collections the
  caller may list so history cannot leak what the index hides.
- **`date_hierarchy`** — a date column becomes a year → month → day trail above
  the list. `dateHierarchy: "placedAt"` narrows the list to the same half-open
  `[from, to)` window the date filter already uses, so a drilled-in list is a
  shareable `?date=2026-07-16` link and the total keeps meaning what it says.
  The strip offers only periods that *have* records, counted **within whatever
  else is narrowing the list** — a month a filter emptied is not a link worth
  having. That count comes from the database, so it is bounded: one query with
  a summed `CASE` per bucket rather than one per bucket, plus two `order by …
  limit 1` reads at the top level, where which *years* to offer depends on the
  data rather than the calendar. Boundaries are computed in JS and compared
  with `gte`/`lt` so they pass through the column's mapper — a Drizzle
  timestamp reports the same type whether it stores seconds or milliseconds,
  and SQL-side truncation would have to guess. Every `CASE` branch is aliased:
  the branches are identical expression text, and a driver that keys rows by
  column name (D1) would collapse them into one.

- **Distinct-value filters** — Django's `AllValuesFieldListFilter`: a plain
  column offers the values it actually holds, which is the only way to filter
  free text from a list. `{ field: "channel", kind: "values" }` — never
  inferred, because unlike every other kind this one costs a `DISTINCT` query
  per filter per request, and the cost should belong to whoever asked for it.
  Two properties carry the behavior: the choices come from the **whole table**,
  not from the narrowed list (options that shrink as you use them make a filter
  a one-way door — you could clear it but not change it), and a column with
  empty rows offers an entry for them. Each filter carries a `limit`
  (`DEFAULT_VALUES_LIMIT`); the query asks for one row over it, so a capped
  list *says* it is a prefix instead of silently ending. Values sort `nulls
  last` so an empty never takes a slot a value needed, and the column itself is
  selected (not cast) so its mapper decides the option's text and it
  round-trips through the same coercion an exact filter uses. A date or a
  foreign key is refused at declaration time — both already answer better, with
  windows and with labels.

**Next — each one is a vertical slice (core → server/MCP → admin)**

- **Per-object permissions.** `AuthAdapter.authorize` is keyed on
  (identity, collection, operation); Django also decides per _record_ and
  narrows the queryset per user. Extend the adapter shape before call sites
  assume collection-level only.
- **Many-to-many.** No support at all today, in the schema introspection or the
  query layer.

When you implement one, say in the commit which Django _behavior_ you
reproduced and confirm it was re-derived, not copied.

## Clean-room rule (non-negotiable)

Django is BSD-3-Clause; Comp ships under MIT. To keep that clean:

- **Never copy Django source, comments, docstrings, or test fixtures into this
  repo** — not even "lightly adapted." (The Django source is **not** vendored
  here; `django-main/` is gitignored as a guard.)
- Django may be consulted **only** to understand _behavior_ — how `ChangeList`
  builds queries, how inlines resolve FKs, how `list_filter` maps to lookups,
  how `search_fields` parses prefixes — then re-implemented from that
  understanding in our own words. The reference points, behavior only:
  `django/contrib/admin/options.py` (ModelAdmin/InlineModelAdmin),
  `views/main.py` (ChangeList), `filters.py`, `actions.py`.
- If you find yourself transcribing a Django function, stop and re-derive it.
- No Django/BSD attribution notice — we share no code, so none is owed.

**This rule constrains _copying_, never _scope_.** It is not a reason to
implement less of the admin, or to avoid studying how a feature behaves. The
backlog above is what we owe; this section is only about how to get there.

## Architecture

pnpm monorepo. Brand is **Comp**; everything publishes under `@comp`.

```
packages/
  core/    → @comp/core    introspection (columns + relations), defineCollection,
                           the relation graph, filters and search (kind + lookup
                           resolution), history (the write-side hook + store),
                           the form layout (+ readonly enforcement, prepopulation),
                           inlines (nested read/validate/write), the site's route
                           vocabulary + delete impact, query+validation+mutation,
                           actions + capability boundary, the AuthAdapter shape
  server/  → @comp/server  Hono read/write API; manifest- and auth-gated
  admin/   → @comp/admin    React UI (AdminSite + the pieces it is built from),
                           a fetch client and hooks
  auth/    → @comp/auth     WebAuthn passkeys, signed-session cookies, role policy,
                           a pluggable PasskeyStore (+ a Drizzle/D1 impl)
  mcp/     → @comp/mcp      collections + actions over MCP (JSON-RPC, no SDK dep)
  cli/     → @comp/cli      `comp scaffold` codegen over the core surface
examples/
  blog-d1/                 deployment reference: Cloudflare D1 + Drizzle, React SPA,
                           passkeys, MCP. Two tables and one FK — it shows the stack
                           working, and deliberately does *not* exercise the backlog.
                           Also the worked example of composing the admin components
                           by hand, rather than mounting the generated site.
  shop-d1/                 admin-features reference: orders → order_items (the inline),
                           a second relation, an enum, a date. Its whole client is
                           `<AdminSite/>` — no screen assembled per collection.
                           Unauthenticated on purpose so it stays about the admin.
```

`blog-d1` is a stack demo, not the parity target. Backlog features need a schema
that is hard for an admin — dependent rows to inline, a m2m, date columns worth
drilling into, records worth auditing — which is what `shop-d1` is for. Extend
`shop-d1` (or add another example beside it) rather than bending `blog-d1`.

### The one rule that shapes everything

**`@comp/core` is the single surface; the UI, server, MCP, and CLI all sit on
it.** A `Collection` declaration is resolved once, and every frontend is
_generated_ from it. Never implement an operation in only one frontend — put it
in core and let server/MCP/CLI/admin consume it. This is what makes UI/CLI/MCP
parity nearly free ("declare, then generate").

The data contract flows one way:
`defineCollection` → `@comp/core` resolves queries/validation/mutations →
`@comp/server` (HTTP) and `@comp/mcp` (JSON-RPC) adapt transport →
`@comp/admin` renders over the HTTP client. **No SQL/Drizzle logic in
`@comp/admin` or in the transport adapters** — the query layer is the source of
truth.

### Stack (locked)

- **Runtime:** Cloudflare Workers (`workerd`); also runs on Node.
- **DB/ORM:** Drizzle. The query/mutation layer is **scoped to SQLite/D1** for
  now (`SqliteDb = BaseSQLiteDatabase<"async", unknown>`); relation
  introspection is likewise SQLite-scoped and degrades to "no relations" on
  other dialects. Other dialects get their own builder behind the same
  signature when needed.
- **Admin UI:** React 19 + Vite. API via Hono.
- **Validation:** Zod, derived from the Drizzle schema (`deriveInsertSchema` /
  `deriveUpdateSchema`).

## Core design principles (these held; keep them)

- **Declare, then generate.** A collection is static and serializable. The UI,
  queries, API, MCP tools, and CLI output are all derived from it. No
  per-request reflection that can't be introspected ahead of time.
- **Structure is introspected, not re-declared.** If a fact is already in the
  Drizzle schema — a column's type, its nullability, a foreign key — read it;
  do not make the app repeat it in a config or a UI prop. A declaration names
  *what* to expose (`filters: ["status"]`); the schema decides what that means. Facts that span
  tables (which collection owns a referenced table, what points back at this
  one) belong to the registry, so resolve them once over the collection array
  (`resolveRelations`) rather than per component.
- **`Collection` is non-generic and serializable on purpose.** Column-key
  type-checking lives in `CollectionConfig<TTable>` at _authoring_ time; the
  resolved `Collection` is a plain record (string keys), so it stores in arrays,
  serializes, and is consumed uniformly. **Do not re-genericize `Collection`** —
  it reintroduces variance problems and breaks array/serialization use.
- **The query layer is the source of truth, not the UI.** `listDisplay`,
  `filters`, `search`, ordering, pagination all resolve to Drizzle queries in
  `@comp/core`.
- **Capabilities are explicit and enforced.** Actions declare the collection and
  operations they touch (`ActionManifest`). `runAction` hands the handler a
  capability-scoped db (`createCapabilityDb`) that throws `CapabilityError` on
  any operation outside the declaration. The executor is a pluggable seam
  (`ActionExecutor`) so actions can later run in a sandboxed isolate **without
  an API change** — keep handlers pure and capability-declaring.
- **Auth is an adapter from day one.** `AuthAdapter` = `authenticate(request)` +
  `authorize({ identity, collection, operation })`, keyed on the same
  `CollectionOperation` vocabulary as the manifest. `allowAll` is the default;
  `@comp/auth` is the real (passkey) implementation. Don't bake a specific auth
  scheme into core or server call sites.
- **Edge-first, scale-to-zero.** No long-lived process, local FS, or warm cache
  assumed. No Node-only APIs in `core`/`server`/`mcp` hot paths unless guarded.
  `@comp/auth` uses Web Crypto, not Node `crypto`/`Buffer`.

## Conventions discovered while building (follow them)

- **Extract pure logic into its own module and unit-test it.** The regression-
  prone parts — introspection, the relation graph, inline resolution/row state,
  query building, validation,
  value coercion, capability enforcement, sort/selection/pagination/label math —
  are all pure functions with vitest tests (`*.test.ts`, run via the root
  `vitest.config.ts`, `include: packages/*/src/**/*.test.ts`). React components
  and transport adapters are verified by `typecheck` + the examples'
  `vite build` (there is no React Testing Library / jsdom setup). When you add
  behavior, push the logic into a tested pure function and keep the
  component/adapter a thin shell.
- **Where a request spans layers, test it against a real database.** Pure
  functions and `.toSQL()` miss what only shows up when the query actually runs
  — `inline-routes.test.ts` drives the Hono router over `node:sqlite` and caught
  an empty UPDATE that every unit test passed. Import `node:sqlite` through
  `createRequire`; Vite's builtin list predates it.
- **Admin components are headless.** No imposed styles. They render plain
  elements with `role`/`aria-*` and expose **render-prop slots** (`renderCell`,
  `renderField`, `fieldWidgets`, `renderEmpty`, …) rather than boolean-prop
  proliferation. They accept their root element's HTML attributes and merge them
  with `mergeProps` (Base UI convention: `className` concat, `style`
  shallow-merge, `on*` handlers chained, external overrides internal).
- **Derived by default, overridable by prop.** Where a component can compute
  something from the collection metadata (FK labels, relation selects), do that
  and let the prop override it — don't require the app to supply what the
  schema already says. When a screen needs different behavior, add the prop that
  names the behavior (`onOpenRecord`) rather than making the caller replace the
  whole renderer — an override that costs you the derived behavior is a trap.
- **Time is an argument, never ambient.** Anything relative — a date window,
  an expiry — takes the instant it resolves against (`ListParams.now`), so the
  same inputs give the same query and a test does not race the clock. Resolve it
  once per request and pass it down.
- **A cross-cutting write concern belongs in the mutation layer.** History is
  logged by `createRecord`/`updateRecord`/`deleteRecord`, so no transport can
  forget it; a rule each route has to remember is a rule that holds until
  somebody adds a route. Its cost stays where the feature is used — no store,
  no extra read.
- **A generated column list needs generated names.** When a query builds N
  expressions in a loop (the hierarchy's bucket counts), alias each one — some
  drivers hand rows back as objects keyed by column name (D1's `results`, and
  `node:sqlite`), and identical expression text collapses to a single key.
  Drizzle's positional mapping then reads every column but one as `undefined`,
  which looks exactly like "no records" rather than like a bug.
- **Hiding is not enforcing.** A declaration that narrows what may be written
  (`readonlyFields` today) has to be applied on the write path, not only left
  out of the UI — a request that names the field anyway must not win. Put the
  rule in core so every transport inherits it.
- **Errors:** plain throws + typed error objects (`ValidationError` carrying Zod
  issues, `CapabilityError`, `CompClientError`). **No `Result`/`neverthrow`
  channel** until concrete pain accumulates. Surface `ValidationError.issues`
  field-by-field in the UI; don't swallow them.
- **TypeScript `strict`** with `noUncheckedIndexedAccess`. No `any` in public API
  surface; flow the Drizzle table type through `CollectionConfig` so field names
  are checked at authoring time.
- **Naming:** packages `@comp/*`; files kebab-case; types/utilities in sibling
  `*.types.ts` / `*.utils.ts`; components in folders. Public verbs read like
  Django where it aids familiarity (`defineCollection`, `registerAction`/
  `defineAction`) without mirroring Django identifiers.

## Borrowing from EmDash — closed

EmDash (Cloudflare's TypeScript/serverless/sandboxed-plugin rebuild of
WordPress) was the structural inspiration: `Comp : Django Admin :: EmDash :
WordPress`. **Everything Comp wanted from it is built** — the declarative
capability manifest, UI/CLI/MCP/programmatic parity on one core surface,
pluggable passkey auth, the built-in MCP server, and the capability boundary
for actions (in-process today, isolate-ready via `ActionExecutor`).

**This section is closed; it is not a backlog.** Do not pick work from it — the
Django parity backlog is where open work lives. Two things remain merely
un-precluded, to be built only if a concrete need shows up: running actions in a
sandboxed isolate (Dynamic Workers), and Agent Skills describing
collections/actions. Out of scope permanently: Astro theming / content rendering
(Comp is an admin layer, not a site renderer) and x402 / pay-per-access.

## Dev model

Packages are **source-first**: `main`/`types`/`exports` point at `src` so the
workspace, vitest, and `tsc` read TypeScript directly — no build needed for
dev. `publishConfig` repoints everything (and the CLI `bin`) at `dist` on
publish; `pnpm build` emits it. Cross-package imports resolve via Node, not TS
project references. Consequence: a built binary that imports another `@comp`
package needs that package built/published (matters for `comp scaffold --from`).

## Commands

```bash
pnpm install
pnpm test          # vitest run (pure-logic unit tests across packages)
pnpm typecheck     # pnpm -r typecheck (tsc --noEmit per package)
pnpm lint          # eslint (flat config)
pnpm build         # pnpm -r build (tsc emit to dist)
pnpm dev           # run the blog-d1 example (wrangler; needs D1 + .dev.vars)
# in examples/blog-d1: pnpm build:client  (vite build the React SPA → dist/client)
```

CI (`.github/workflows/ci.yml`) runs typecheck → lint → test → build → example
SPA build on push/PR. When adding a package, wire it into the workspace, give it
`build`/`typecheck` scripts and a `publishConfig`, so the root scripts and CI
stay complete.

## Working agreements for Claude Code

- **Default to the Django parity backlog.** If a task is open-ended
  ("what next?", "improve X"), take the next slice from there. Polish on
  already-built surfaces is not progress toward the goal.
- Read `@comp/core` before touching any frontend; the data contract drives them.
- New collection feature → add it to core (query/validation/mutation) **and**
  expose it through server, MCP, and (where relevant) admin — never one only.
- Add/update a vitest case alongside any change to introspection, the relation
  graph, filters, search, the form layout, inlines, delete impact, history, the
  query layer, validation, or the capability boundary; that's where silent
  regressions hide.
- When implementing a Django-equivalent feature, note in the commit the
  _behavior_ being reproduced and confirm it was re-derived, not copied.
- Prefer small, vertical slices (core → API/MCP → UI) over disconnected layers.
- Keep commits scoped; commit messages focus on the "why."
