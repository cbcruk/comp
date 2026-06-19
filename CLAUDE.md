# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What Comp is

**Comp** is a schema-driven, serverless admin framework for TypeScript — the
spiritual successor to Django's admin, rebuilt for the edge.

> **Comp : Django Admin :: EmDash : WordPress**

EmDash (Cloudflare's TypeScript/serverless/sandboxed-plugin rebuild of
WordPress) is the inspiration. Comp applies the same move to a different target:
not "a CMS for the edge" but "an _admin layer_ for the edge." Django's killer
feature is _introspecting a model to auto-generate a CRUD interface_; Comp ports
that to TypeScript/serverless: you declare a collection over a Drizzle table and
Comp generates the list view, filters, search, detail/edit forms, bulk actions,
an HTTP API, an MCP tool surface, and CLI scaffolding — running on Cloudflare
Workers.

```ts
// Django                          // Comp
class PostAdmin(admin.ModelAdmin): defineCollection({
  list_display = ['title','status']  model: posts,                 // Drizzle table
  list_filter  = ['status']          listDisplay: ['title','status'],
  search_fields = ['title','body']   filters: ['status'],
                                     search: ['title','body'],
                                   })
```

## Clean-room rule (non-negotiable)

Django is BSD-3-Clause; Comp ships under MIT. To keep that clean:

- **Never copy Django source, comments, docstrings, or test fixtures into this
  repo** — not even "lightly adapted." (The Django source was used only as a
  behavioral reference during early design and is **not** vendored here; it is
  gitignored via `django-main/` as a guard.)
- Django may be consulted **only** to understand _behavior_ (how `ChangeList`
  builds queries, how inlines resolve FKs, how `list_filter` maps to lookups),
  then re-implemented from that understanding in our own words.
- If you find yourself transcribing a Django function, stop and re-derive it.
- No Django/BSD attribution notice — we share no code, so none is owed.

## Architecture

pnpm monorepo. Brand is **Comp**; everything publishes under `@comp`.

```
packages/
  core/    → @comp/core    introspection, defineCollection, query+validation+mutation,
                           actions + capability boundary, the AuthAdapter shape
  server/  → @comp/server  Hono read/write API; manifest- and auth-gated
  admin/   → @comp/admin    React UI + a fetch client and hooks
  auth/    → @comp/auth     WebAuthn passkeys, signed-session cookies, role policy,
                           a pluggable PasskeyStore (+ a Drizzle/D1 impl)
  mcp/     → @comp/mcp      collections + actions over MCP (JSON-RPC, no SDK dep)
  cli/     → @comp/cli      `comp scaffold` codegen over the core surface
examples/
  blog-d1/                 reference app: Cloudflare D1 + Drizzle, React SPA, passkeys, MCP
```

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
  now (`SqliteDb = BaseSQLiteDatabase<"async", unknown>`). Other dialects get
  their own builder behind the same signature when needed.
- **Admin UI:** React 19 + Vite. API via Hono.
- **Validation:** Zod, derived from the Drizzle schema (`deriveInsertSchema` /
  `deriveUpdateSchema`).

## Core design principles (these held; keep them)

- **Declare, then generate.** A collection is static and serializable. The UI,
  queries, API, MCP tools, and CLI output are all derived from it. No
  per-request reflection that can't be introspected ahead of time.
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
  prone parts — introspection, query building, validation, value coercion,
  capability enforcement, sort/selection/pagination/label math — are all pure
  functions with vitest tests (`*.test.ts`, run via the root `vitest.config.ts`,
  `include: packages/*/src/**/*.test.ts`). React components and transport
  adapters are verified by `typecheck` + the example's `vite build` (there is no
  React Testing Library / jsdom setup). When you add behavior, push the logic
  into a tested pure function and keep the component/adapter a thin shell.
- **Admin components are headless.** No imposed styles. They render plain
  elements with `role`/`aria-*` and expose **render-prop slots** (`renderCell`,
  `renderField`, `fieldWidgets`, `renderEmpty`, …) rather than boolean-prop
  proliferation. They accept their root element's HTML attributes and merge them
  with `mergeProps` (Base UI convention: `className` concat, `style`
  shallow-merge, `on*` handlers chained, external overrides internal).
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

## Borrowing from EmDash — status

Adopted: declarative capability manifest; UI/CLI/MCP/programmatic parity on one
core surface; pluggable auth (passkeys in `@comp/auth`); built-in MCP server;
the capability **boundary** for actions (in-process today, isolate-ready).

Not yet (don't preclude): actually running actions in a sandboxed **isolate**
(Dynamic Workers) — the `ActionExecutor` seam is where that drops in; Agent
Skills describing collections/actions.

Out of scope: Astro theming / content rendering (Comp is an admin layer);
x402 / pay-per-access (not an admin concern).

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

- Read `@comp/core` before touching any frontend; the data contract drives them.
- New collection feature → add it to core (query/validation/mutation) **and**
  expose it through server, MCP, and (where relevant) admin — never one only.
- Add/update a vitest case alongside any change to introspection, the query
  layer, validation, or the capability boundary; that's where silent
  regressions hide.
- When implementing a Django-equivalent feature, note in the commit the
  _behavior_ being reproduced and confirm it was re-derived, not copied.
- Prefer small, vertical slices (core → API/MCP → UI) over disconnected layers.
- Keep commits scoped; commit messages focus on the "why."
