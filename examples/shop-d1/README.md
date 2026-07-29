# shop-d1

The example for admin features that a two-table blog cannot exercise. Where
`blog-d1` shows the stack working (D1, passkeys, MCP, deployment), this one has
a schema that is *hard* for an admin:

- **orders → order_items**: dependent rows that only make sense edited with
  their parent. This is the inline.
- **orders → customers**: a second relation, resolved to a label.
- an enum (`status`) and a date (`placedAt`).

It is deliberately unauthenticated so the code stays about the admin surface;
`blog-d1` is where auth lives. Put a real `AuthAdapter` in front of both routers
before deploying anything like it.

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
