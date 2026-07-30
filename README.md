# Comp

Schema-driven, serverless admin framework for TypeScript — Django's admin,
rebuilt for the edge. Declare a collection over a Drizzle schema and Comp
generates the list view, filters, search, detail/edit forms, relation widgets,
and bulk actions, running on Cloudflare Workers.

Comp covers the single-table slice of Django's admin plus relations, inlines,
real filter lookups, form layout, and a generated admin site; search lookups,
`date_hierarchy`, history, and per-object permissions are the open work. See the
parity backlog in `CLAUDE.md`.

```ts
defineCollection({
  model: posts,                              // Drizzle table
  listDisplay: ["title", "status", "createdAt"],
  filters: ["status"],
  search: ["title", "body"],
})
```

## Packages

| Package        | Role                                                          |
| -------------- | ------------------------------------------------------------ |
| `@comp/core`   | Introspection (columns + relations), `defineCollection`, queries. |
| `@comp/server` | Hono route adapter that mounts the read API over `core`.     |
| `@comp/admin`  | React admin UI (list browser, detail/edit form, client).     |
| `@comp/auth`   | Pluggable auth: WebAuthn passkeys, signed sessions, policy.  |
| `@comp/mcp`    | Collections + actions over the Model Context Protocol.       |
| `@comp/cli`    | Scaffolding / codegen (`comp scaffold [--from]`) over core.  |

Two examples: `examples/blog-d1` is the stack reference (Cloudflare D1 +
Drizzle, passkeys, MCP) and shows composing the admin components by hand;
`examples/shop-d1` is the admin-features one — orders with line items edited
inline, a second relation, an enum, and a date — and its whole client is
`<AdminSite/>`.

The data contract flows one way: `defineCollection` → `@comp/core` resolves
queries → `@comp/server` adapts HTTP → `@comp/admin` renders. No SQL lives in
the UI; the query layer is the single source of truth.

## Commands

```bash
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit per package
pnpm build       # build all packages
pnpm lint        # eslint
pnpm dev         # run the blog-d1 example (needs a D1 binding, see below)
```

## Running the example

```bash
cd examples/blog-d1
wrangler d1 create blog            # paste database_id into wrangler.toml
echo 'SESSION_SECRET="dev-secret-change-me"' > .dev.vars
pnpm db:migrate:local              # apply migrations/0001_init.sql to the local D1
pnpm build:client                  # vite-build the React admin SPA → dist/client
pnpm dev                           # http://localhost:8787
```

Open `http://localhost:8787` for the admin UI: register/sign in with a passkey,
then create and browse posts. The React app (`client/`) is served same-origin
by the Worker (Cloudflare assets) so passkeys work; it talks to the admin API
under `/admin` (anonymous can read, writes need a role) and the passkey
ceremonies under `/auth`. `migrations/` is hand-written here; `pnpm db:generate`
regenerates it from `schema.ts` (which includes the passkey tables).

## Status

v0.1 in progress. Implemented end-to-end:

- Collection declaration → introspection (columns + foreign keys) →
  list/count/get queries.
- The add/change form as a layout: `fieldsets` group fields under headings, a
  nested array puts them on one line, `readonlyFields` shows without writing,
  `prepopulated` derives a slug from a title while adding, `radioFields` swaps a
  select for radios. Readonly is enforced on the write path, not just hidden.
- An admin site from the registry: `AdminSite` renders the index, list, add,
  change, and delete confirmation for whatever collections the server reports.
  The index is narrowed by permission — a collection you cannot list is not on
  it — and the delete confirmation counts what the delete reaches, saying per
  foreign key whether those rows cascade, get cleared, or refuse the delete.
- Filters that know what a column can be asked: an enum offers its values, a
  date named windows, a foreign key the records it points at, a nullable column
  empty/not-empty. The value carries its operation (`in:`, `isnull:`, `range:`,
  `preset:`), so a filtered list is a link that keeps meaning what it said.
- Inlines: a parent's dependent rows read with it and written in the same
  request (`inlines: ["order_items"]`), resolved against the relation graph and
  scoped to the parent in SQL. Exposed over HTTP, MCP, and the React
  `InlineEditor`.
- Zod schema derivation and validated create/update/delete mutations.
- Read + write API over Hono, gated on the collection manifest.
- Declarative bulk/custom actions carrying their own capability manifest.
- React client + `useRecord`/`useCollectionList` hooks, a schema-derived
  `CollectionForm`, and a `CollectionBrowser` (search/filter/paginate, bulk
  selection, action dispatch).
- Auth: an allow-all default plus `@comp/auth` — real WebAuthn passkey
  ceremonies, signed-session cookies, and a role policy, all keyed on the same
  `CollectionOperation` vocabulary as the manifest.

`comp scaffold --from ./schema.js#posts` introspects a Drizzle table to derive
`listDisplay`/`filters`/`search`; `comp scaffold <Name> --table --fields …` is
the manual form. (`--from` imports the module at runtime, so it needs
`@comp/core` resolvable as built JS — i.e. published or built packages.)

`@comp/admin` also ships a browser passkey client (`createPasskeyClient`,
wrapping `@simplewebauthn/browser`) and a `PasskeyLogin` component that drive
the `/auth` ceremonies.

Packages are source-first for development (`main`/`exports` point at `src` so
the workspace, tests, and `tsc` read TypeScript directly). Each package's
`publishConfig` repoints `main`/`types`/`exports` (and the CLI `bin`) at `dist`
on publish, and `pnpm build` emits it — so a published/packed package resolves
to compiled JS. `pnpm pack` reflects the published shape.

The list view supports search, per-column filters (rendered from each filter's
resolved kind — select, relation picker, or text), sortable headers, pagination,
bulk selection + actions, and opt-in click-to-edit cells.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, test, and build (packages
+ example SPA) on every push and PR.

Relations are introspected, not declared. `introspectTable` reads the schema's
foreign keys onto the fields that hold them, and `resolveRelations` links them
across the registry into a two-way graph — outbound (which collection this FK
points at, and its `labelField`) and inbound (what points back here). The server
serves both with each collection, so `CollectionBrowser` resolves FK columns to
labels and `referenceWidgets` renders a `ReferenceSelect` per FK field without
the app naming a target collection. Both stay overridable by prop.

Server validation errors are surfaced field-by-field: a failed submit maps the
returned Zod `issues` to messages beside each form field, and a failed inline
edit shows the offending field's message.

Toast notifications (`useToasts` + `Toasts`) surface action success/failure;
`CollectionBrowser` routes them through an optional `onNotify` callback.

The list resolves FK columns to labels (a `references` prop), inline edits apply
optimistically and reconcile with the server, and the example ships a small
stylesheet. Admin components carry `aria-sort`/`aria-label`/`role` for
accessibility.

Admin components accept their root element's HTML attributes and merge them via
a Base UI–style `mergeProps` (className concat, style merge, handlers chained,
external overrides internal), so apps can style/extend the roots.

`@comp/mcp` exposes the same collections and actions over the Model Context
Protocol (JSON-RPC, no SDK dependency): `createMcpHandler` generates
`list`/`get`/`create`/`update`/`delete` + action tools from the declarations,
gated by each manifest. The example mounts it at `/mcp` (unguarded for the demo
— protect it in production, as it mirrors the write surface).

Actions run through a capability boundary: `runAction` hands the handler a
db scoped to the action's declared operations (`createCapabilityDb`), so an
action that only declared `delete` throws `CapabilityError` if it tries to
`select`/`insert`/`update`. The executor is pluggable (`ActionExecutor`), so the
same actions can later run in a sandboxed isolate with no API change — the
boundary is drawn now, without one.

See `CLAUDE.md` for architecture, the clean-room rule, and design principles.
