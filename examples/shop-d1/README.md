# shop-d1

The example for admin features that a two-table blog cannot exercise. Where
`blog-d1` shows the stack working (D1, passkeys, MCP, deployment), this one has
a schema that is *hard* for an admin:

- **orders → order_items**: dependent rows that only make sense edited with
  their parent. This is the inline.
- **orders → customers**: a second relation, resolved to a label.
- an enum (`status`) and a date (`placedAt`) — three columns that each filter
  a different way.

It is deliberately unauthenticated so the code stays about the admin surface;
`blog-d1` is where auth lives. Put a real `AuthAdapter` in front of both routers
before deploying anything like it.

## The site

The whole client is:

```tsx
<AdminSite
  client={client}
  collections={collections}
  route={route}
  onNavigate={navigate}
/>
```

That gives you the index, each collection's list, the add and change forms —
with relation selects and the line-item inline — and the delete confirmation.
There is no screen written per collection: `AdminSite` reads the same summaries
everything else does.

The index only shows collections this caller can list, and only offers Add
where they may create, because `/collections` narrows the manifest by
permission before answering. `useHashRoute` keeps the current screen in the URL
fragment; an app with its own router passes `route`/`onNavigate` itself, and
`renderScreen` replaces any single screen.

## The search box

```ts
search: ["^reference", "customerId__name", "customerId__email"],
```

`^reference` matches from the start of the reference; the other two follow the
foreign key and search the customer it points at. Typing two words narrows —
each has to match something — and quoting keeps a phrase whole. The traversal
compiles to `customer_id in (select id from customers where ...)`, so there is
no join, no `DISTINCT`, and the total under the table still counts the rows you
can see.

## The form layout

`orders` declares its change form as a layout rather than a field list:

```ts
fieldsets: [
  { title: "Order", fields: [["reference", "customerId"]] },
  { title: "Status", fields: [["status", "placedAt"]], collapsed: true },
],
radioFields: ["status"],
```

The nested arrays put two fields on one line; the second group starts folded.
`blog-d1` carries the other half of this — `prepopulated: { slug: ["title"] }`
writes a post's slug from its title while adding and stops the moment you edit
the slug yourself, and `readonlyFields: ["createdAt"]` shows the timestamp
without letting anything write it. That last one is enforced in core: a request
that names a readonly field has the value dropped before the insert, so it holds
over HTTP and MCP alike rather than depending on the UI hiding an input.

## The delete confirmation

Deleting an order is not local: line items go with it. The confirmation says so
before you commit, counted from the database rather than guessed:

```
Delete order 1?
This will also delete 3 related records.
  · 3 order_items will be deleted with it
```

Each line comes from what the foreign key itself says — `cascade` deletes them,
`set null` clears the link, and a key with no stated action means SQL will
refuse the delete, so the button is disabled instead of failing. The same
reckoning is on MCP as `orders__delete_preview`, so an agent can check before
calling `orders__delete`.

## The inline

`orders` declares one line:

```ts
defineCollection({
  model: orders,
  listDisplay: ["reference", "customerId", "status", "placedAt"],
  inlines: ["order_items"],
})
```

That is the whole declaration. Which foreign key ties the two together
(`order_items.orderId`), what it points at (`orders.id`), and the reverse
direction are read from the schema — `resolveInlines` binds the name to the
relation graph at startup, and an unknown child, a child with no key to the
parent, or an ambiguous key throws there rather than on a request.

Line items stay a collection in their own right: their own API routes, MCP
tools, and manifest still apply. The inline is a second way to reach them, not
a replacement, and it never grants more than the child collection already does.

Editing an order and its items is one action:

```
PATCH /admin/collections/orders/1
{
  "status": "paid",
  "inlines": {
    "order_items": {
      "update": [{ "id": 4, "values": { "quantity": 10 } }],
      "delete": [5],
      "create": [{ "product": "Bowl", "quantity": 4 }]
    }
  }
}
```

Deletes run first, then updates, then creates. Every update and delete is scoped
to the parent in SQL, so an id belonging to another order matches nothing. The
parent key is filled in on create and stripped from updates — an inline edits
its own parent's rows, so re-parenting is not one of the operations it offers.
A bad row comes back as `inlines.order_items.1.product`, which the UI puts on
that row's field.

The same nested write is on the MCP tools (`orders__create` / `orders__update`
carry an `inlines` property generated from the child's schema) and in the client
(`client.update(slug, id, values, inlines)`).

Writes are applied in order on one handle. D1 has no interactive transactions,
so this is not atomic there yet; `writeInlines` is the single seam where a
driver-level batch drops in.

## The filters

`orders` declares `filters: ["status", "customerId", "placedAt"]` and nothing
else. What each one *is* comes from the column:

| Column | Kind | What it offers |
| --- | --- | --- |
| `status` | `choices` | its own enum values, singly or `in:draft,paid` |
| `customerId` | `relation` | the customers it points at, plus Empty / Not empty |
| `placedAt` | `date` | Today, Past 7 days, This month, This year, or `range:FROM..TO` |

The value carries its operation, so the URL stays a shareable link that keeps
meaning what it said: `?status=in:draft,paid&placedAt=preset:month`. Relative
windows resolve against one instant per request, shared by the rows and the
count, and against UTC — an edge worker has no local timezone worth trusting.
Operands are coerced to the column's type first: `customerId=1` compares an
integer to an integer, not to the text `"1"`.

The same encoding works on the MCP `orders__list` tool, whose generated
`filters` schema names each column's allowed values.

## Running it

```bash
cd examples/shop-d1
wrangler d1 create shop            # paste database_id into wrangler.toml
pnpm db:migrate:local              # apply migrations/0001_init.sql
pnpm build:client                  # vite build the React SPA → dist/client
pnpm dev                           # http://localhost:8787
```

Create a customer and an order, then click an order's reference to edit it with
its line items in one form. `migrations/` is hand-written here; `pnpm
db:generate` regenerates it from `schema.ts`.
