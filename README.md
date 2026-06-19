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
| `@comp/cli`    | Scaffolding / codegen (`comp scaffold [--from]`) over core.  |

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

The list view supports search, per-column filters, sortable headers,
pagination, bulk selection + actions, and opt-in click-to-edit cells.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, test, and build (packages
+ example SPA) on every push and PR.

Relations are app-declared: a `ReferenceSelect` widget pulls options from
another collection and drops into a form's `fieldWidgets` (the example wires
`posts.authorId` → `authors`).

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

Next slices: the post-v0.1 roadmap in `CLAUDE.md` — a built-in MCP server over
the same core surface, and sandboxed action execution.

See `CLAUDE.md` for architecture, the clean-room rule, and design principles.
