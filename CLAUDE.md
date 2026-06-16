# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What Comp is

**Comp** is a schema-driven, serverless admin framework for TypeScript — the
spiritual successor to Django's admin, rebuilt for the edge.

The lineage is deliberate:

> **Comp : Django Admin :: EmDash : WordPress**

EmDash (Cloudflare's TypeScript, serverless, sandboxed-plugin rebuild of
WordPress) is the direct inspiration for this project. Comp applies the same
move to a different target: instead of "a CMS for the edge," it's "an _admin
layer_ for the edge." Where EmDash takes the WordPress idea — democratized
publishing — and rebuilds it on `workerd`/Astro/Workers, Comp takes the Django
admin idea — auto-generated data management from declarations — and rebuilds it
on `workerd`/Drizzle/React. See `docs/notes/emdash-lineage.md` and the EmDash
repo (`emdash-cms/emdash`) for the design patterns we draw on.

Django's killer feature is _introspecting a model definition to auto-generate a
full CRUD interface_ (`list_display`, `list_filter`, `search_fields`, inlines,
actions). Comp ports that idea to the TypeScript/serverless world: you declare a
collection over a Drizzle schema, and Comp generates the list view, filters,
search, detail/edit forms, and bulk actions — running on Cloudflare Workers,
scaling to zero.

The mental model:

```ts
// Django
class PostAdmin(admin.ModelAdmin):
    list_display = ['title', 'status', 'created_at']
    list_filter  = ['status']
    search_fields = ['title', 'body']

// Comp
defineCollection({
  model: posts,                              // Drizzle table
  listDisplay: ['title', 'status', 'createdAt'],
  filters: ['status'],
  search: ['title', 'body'],
})
```

## Clean-room rule (non-negotiable)

Django is BSD-3-Clause, i.e. readable and permissive, **but Comp ships under
MIT**. To keep that clean:

- **Never copy Django source code, comments, docstrings, or test fixtures into
  this repo.** Not even "lightly adapted."
- Django source may be consulted **only** to understand _behavior and design_
  (how `ChangeList` builds queries, how inlines resolve FKs, how `list_filter`
  maps to lookups). Re-implement from that understanding in our own words/code.
- If you find yourself transcribing a Django function, stop and re-derive it
  from the documented behavior instead.
- Do not add a Django/BSD attribution notice — we share no code, so none is owed.

The reference points worth studying (behavior only):
`django/contrib/admin/options.py` (ModelAdmin), `views/main.py` (ChangeList),
`filters.py`, `actions.py`.

## Architecture

pnpm monorepo. Brand is **Comp**; everything publishes under the `@comp` scope.

```
packages/
  core/      → @comp/core   schema introspection, defineCollection, query layer
  admin/     → @comp/admin   React admin UI (list/detail/forms/filters/actions)
  cli/       → @comp/cli     scaffolding, codegen, deploy helpers
  server/    → @comp/server  Worker handler / route adapter (Hono)
examples/
  blog-d1/                   reference app: Cloudflare D1 + Drizzle
```

### Stack (assumptions — confirm before locking)

- **Runtime:** Cloudflare Workers (`workerd`). Must also run on any Node server.
- **DB / ORM:** Drizzle. Chosen over Prisma because schema lives as real
  TypeScript types, so introspection is structural and build-time — no codegen
  daemon, no `.prisma` DSL.
- **Default datastore in examples:** Cloudflare D1.
- **Admin UI:** React + Vite. Server API via Hono.
- **Validation:** Zod for runtime field validation derived from the Drizzle schema.

If any of these change, update this section first.

## Core design principles

- **Declare, then generate.** A collection is a static, serializable
  declaration. The UI and queries are derived from it. No per-request reflection
  magic that can't be introspected ahead of time — this is also what lets the
  CLI and (future) MCP server expose the same capabilities as the UI.
- **The query layer is the source of truth, not the UI.** `listDisplay`,
  `filters`, `search`, ordering, pagination all resolve to Drizzle queries in
  `@comp/core`. The React layer only renders what core resolves. Keep this
  boundary clean — no SQL/Drizzle logic in `@comp/admin`.
- **Capabilities are explicit.** Actions (esp. bulk/custom) declare what they
  touch. Long-term this maps onto sandboxed execution; near-term, keep actions
  pure and declarative so that boundary stays portable.
- **Edge-first, scale-to-zero.** No assumption of a long-lived process, local
  filesystem, or warm cache. Cold start matters.

## Borrowing from EmDash

EmDash solved several problems that map cleanly onto an admin framework. We
adopt the _patterns_, on our own timeline. Tag every related task with the phase
so scope doesn't balloon.

**Adopt now (v0.1 — shapes the core API):**

- **Declarative capability manifest.** EmDash plugins declare exactly what they
  can touch (`capabilities: ["read:content", "email:send"]`) and can do nothing
  else. Comp actions/extensions declare the collections and operations they
  need, statically and serializably. This is _the_ reason `defineCollection` and
  actions must stay declarative — the manifest is what later enables sandboxing,
  CLI parity, and MCP without rework. Design the API as if the manifest already
  matters, even before enforcement exists.
- **UI / CLI / programmatic parity.** EmDash exposes the same operations through
  the Admin UI, CLI, and MCP. Comp's `@comp/core` query+mutation layer is the
  single surface all three sit on. Never implement an operation only in the UI.

**Adopt later (post-v0.1 — do NOT build yet, just don't preclude):**

- **Sandboxed actions via Dynamic Workers.** EmDash runs each plugin in its own
  isolate with capabilities granted via bindings. Comp's custom/bulk actions are
  the natural fit for this later. For now: keep actions pure and
  capability-declaring so they can be lifted into an isolate without API change.
- **Built-in MCP server.** Every EmDash instance ships a remote MCP server
  mirroring the Admin UI. Comp should eventually expose collections/actions over
  MCP. The "declare, then generate" rule is what makes this nearly free later.
- **Agent Skills.** EmDash ships Skills describing its hooks/capabilities to
  agents. A future `skills/` dir can describe Comp collections and actions the
  same way.
- **Pluggable auth (passkeys by default).** EmDash defaults to passkeys with
  pluggable SSO. Comp's auth should be an adapter from day one in _shape_, even
  if v0.1 ships a trivial implementation.

**Explicitly out of scope (EmDash has it; Comp does not need it):**

- Astro theming / content rendering — Comp is an admin layer, not a site
  renderer. The consuming app owns the front end.
- x402 / pay-per-access content monetization — not an admin concern.

- TypeScript `strict`. No `any` in public API surface; prefer precise generics
  that flow the Drizzle table type through to `listDisplay`/`filters` keys so
  field names are checked at the type level.
- **Component composition:** prefer render-props with `renderX` slots over deep
  prop drilling. Declarations flat at module scope; tree structure lives only in
  the assembly layer. Avoid inline component definitions (React identity model).
- **Props merging:** adopt the Base UI `mergeProps` convention project-wide —
  `className` concat, `style` shallow-merge, event handlers chained, external
  props override internal.
- **Error handling:** plain throws + typed error objects for now. Do _not_
  introduce a `Result`/`neverthrow`-style channel until concrete pain
  accumulates; revisit then.
- Naming: packages `@comp/*`, public API verbs read like Django where it aids
  familiarity (`defineCollection`, `registerAction`) but don't mirror Django
  identifiers slavishly.

## Commands

```bash
pnpm install
pnpm dev           # run example app + admin UI locally
pnpm build         # build all packages
pnpm test          # vitest
pnpm typecheck     # tsc --noEmit across workspace
pnpm lint          # eslint
```

When adding a package, wire it into the workspace and add its `build`/`test`
scripts so the root scripts stay complete.

## Working agreements for Claude Code

- Read `@comp/core` before touching `@comp/admin`; the data contract drives the UI.
- When implementing a Django-equivalent feature, first write a short note in the
  PR/commit describing the _behavior_ you're reproducing and confirming it was
  re-derived, not copied.
- Add or update a Vitest case alongside any change to the query/introspection
  layer — that layer is the part most likely to regress silently.
- Keep edge constraints in mind: no Node-only APIs in `core`/`server` hot paths
  unless guarded by a runtime adapter.
- Prefer small, vertical slices (one collection feature end-to-end:
  core query → API → UI) over horizontal layers left disconnected.
