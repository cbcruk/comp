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
| `@comp/admin`  | React admin UI (currently the list view).                    |
| `@comp/cli`    | Scaffolding / codegen / deploy helpers (placeholder).        |

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

v0.1 in progress. Implemented end-to-end: collection declaration →
introspection → list/count query → Zod schema derivation → read API. Next
slices: detail/read endpoint, create/update mutations with the derived schemas,
and the React detail/edit forms.

See `CLAUDE.md` for architecture, the clean-room rule, and design principles.
