# Comp

Schema-driven, serverless admin framework for TypeScript — Django's admin,
rebuilt for the edge. Declare a collection over a Drizzle schema and Comp
generates the list view, filters, search, and (soon) detail/edit forms and bulk
actions, running on Cloudflare Workers.

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
| `@comp/core`   | Schema introspection, `defineCollection`, the query layer.   |
| `@comp/server` | Hono route adapter that mounts the read API over `core`.     |
| `@comp/admin`  | React admin UI (list browser, detail/edit form, client).     |
| `@comp/auth`   | Pluggable auth: WebAuthn passkeys, signed sessions, policy.  |
| `@comp/cli`    | Scaffolding / codegen (`comp scaffold`) over the core API.   |

`examples/blog-d1` is the reference app: Cloudflare D1 + Drizzle.

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
pnpm db:generate                   # generate the initial migration from schema.ts
pnpm db:migrate:local              # apply migrations to the local D1
pnpm dev                           # http://localhost:8787/admin/collections
```

## Status

v0.1 in progress. Implemented end-to-end:

- Collection declaration → introspection → list/count/get queries.
- Zod schema derivation and validated create/update/delete mutations.
- Read + write API over Hono, gated on the collection manifest.
- Declarative bulk/custom actions carrying their own capability manifest.
- React client + `useRecord`/`useCollectionList` hooks, a schema-derived
  `CollectionForm`, and a `CollectionBrowser` (search/filter/paginate, bulk
  selection, action dispatch).
- Auth: an allow-all default plus `@comp/auth` — real WebAuthn passkey
  ceremonies, signed-session cookies, and a role policy, all keyed on the same
  `CollectionOperation` vocabulary as the manifest.

Next slices: a D1-backed `PasskeyStore` for the example, richer field widgets
(relations, enums) in the form, and `comp scaffold` reading a live Drizzle
schema to fill in `listDisplay`.

See `CLAUDE.md` for architecture, the clean-room rule, and design principles.
