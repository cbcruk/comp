import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../collection/define-collection.js";
import {
  buildInlineDeleteQuery,
  buildInlineListQuery,
  buildInlineUpdateQuery,
} from "../query/build-inline-query.js";
import { ValidationError } from "../validation/validation-error.js";
import {
  InlineError,
  inlineOperations,
  prepareInlineWrite,
} from "./inline-write.js";
import { inlineSummary, resolveInlines } from "./resolve-inlines.js";

const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull(),
});

const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  product: text("product").notNull(),
  quantity: integer("quantity").notNull().default(1),
});

/** Two keys to the same parent: shipping and billing. */
const shipments = sqliteTable("shipments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  returnOrderId: integer("return_order_id").references(() => orders.id),
  carrier: text("carrier").notNull(),
});

const itemCollection = defineCollection({
  model: items,
  listDisplay: ["product", "quantity"],
  ordering: [{ field: "id", direction: "asc" }],
});

// sqlite-proxy needs no native driver; .toSQL() never invokes the callback.
const db = drizzle(async () => ({ rows: [] }));

function orderCollection(
  inlines: Parameters<typeof defineCollection>[0]["inlines"],
) {
  return defineCollection({
    model: orders,
    listDisplay: ["reference"],
    inlines,
  });
}

describe("resolveInlines", () => {
  it("infers the foreign key from the schema", () => {
    const parent = orderCollection(["items"]);
    const specs = resolveInlines([parent, itemCollection]).get("orders") ?? [];
    expect(specs.map(inlineSummary)).toEqual([
      {
        collection: "items",
        field: "orderId",
        targetField: "id",
        canDelete: true,
      },
    ]);
  });

  it("carries canDelete through the object form", () => {
    const parent = orderCollection([{ collection: "items", canDelete: false }]);
    const spec = resolveInlines([parent, itemCollection]).get("orders")?.[0];
    expect(spec?.canDelete).toBe(false);
  });

  it("rejects an unregistered child", () => {
    expect(() => resolveInlines([orderCollection(["items"])])).toThrow(
      /not a registered collection/,
    );
  });

  it("rejects a child with no key to the parent", () => {
    const unrelated = defineCollection({
      model: orders,
      slug: "others",
      listDisplay: ["reference"],
    });
    expect(() =>
      resolveInlines([orderCollection(["others"]), unrelated]),
    ).toThrow(/no foreign key to it/);
  });

  it("refuses to guess when the child points at the parent twice", () => {
    const shipmentCollection = defineCollection({
      model: shipments,
      listDisplay: ["carrier"],
    });
    expect(() =>
      resolveInlines([orderCollection(["shipments"]), shipmentCollection]),
    ).toThrow(/ambiguous \(orderId, returnOrderId\)/);

    const named = orderCollection([
      { collection: "shipments", field: "returnOrderId" },
    ]);
    const spec = resolveInlines([named, shipmentCollection]).get("orders")?.[0];
    expect(spec?.field).toBe("returnOrderId");
  });

  it("rejects a key the child does not have", () => {
    expect(() =>
      resolveInlines([
        orderCollection([{ collection: "items", field: "nope" }]),
        itemCollection,
      ]),
    ).toThrow(/no foreign key "nope"/);
  });

  it("gives every collection an entry, inlines or not", () => {
    const resolved = resolveInlines([orderCollection(["items"]), itemCollection]);
    expect(resolved.get("items")).toEqual([]);
  });
});

describe("inlineOperations", () => {
  it("reports only the operations a write actually needs", () => {
    expect(inlineOperations({ create: [{}] })).toEqual(["create"]);
    expect(inlineOperations({ create: [], delete: [1] })).toEqual(["delete"]);
    expect(
      inlineOperations({ create: [{}], update: [{ id: 1, values: {} }], delete: [2] }),
    ).toEqual(["create", "update", "delete"]);
    expect(inlineOperations({})).toEqual([]);
  });
});

describe("prepareInlineWrite", () => {
  const spec = resolveInlines([orderCollection(["items"]), itemCollection]).get(
    "orders",
  )?.[0];
  if (!spec) throw new Error("inline did not resolve");

  it("pins created rows to the parent, whatever the caller sent", () => {
    const prepared = prepareInlineWrite(
      spec,
      { create: [{ product: "Cup", orderId: 999 }] },
      7,
    );
    expect(prepared.create).toEqual([{ product: "Cup", orderId: 7, quantity: undefined }]);
  });

  it("drops the parent key from updates so a row cannot be re-parented", () => {
    const prepared = prepareInlineWrite(
      spec,
      { update: [{ id: 3, values: { quantity: 2, orderId: 999 } }] },
      7,
    );
    expect(prepared.update[0]?.values).toEqual({ quantity: 2 });
  });

  it("drops an update left with nothing to set", () => {
    const prepared = prepareInlineWrite(
      spec,
      { update: [{ id: 3, values: { orderId: 999 } }] },
      7,
    );
    expect(prepared.update).toEqual([]);
  });

  it("addresses validation issues to the row and field they came from", () => {
    let error: unknown;
    try {
      prepareInlineWrite(
        spec,
        { create: [{ product: "ok" }, { product: 42 }] },
        7,
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues[0]?.path).toEqual([
      "inlines",
      "items",
      1,
      "product",
    ]);
  });

  it("refuses an operation the child collection does not expose", () => {
    const readOnlyItems = defineCollection({
      model: items,
      slug: "items",
      listDisplay: ["product"],
      operations: ["list", "read"],
    });
    const readOnly = resolveInlines([
      orderCollection(["items"]),
      readOnlyItems,
    ]).get("orders")?.[0];
    expect(() =>
      prepareInlineWrite(readOnly!, { create: [{ product: "Cup" }] }, 7),
    ).toThrow(InlineError);
  });

  it("refuses deletes when the inline declares canDelete: false", () => {
    const guarded = resolveInlines([
      orderCollection([{ collection: "items", canDelete: false }]),
      itemCollection,
    ]).get("orders")?.[0];
    expect(() => prepareInlineWrite(guarded!, { delete: [1] }, 7)).toThrow(
      /canDelete: false/,
    );
    // Non-delete writes are unaffected.
    expect(
      prepareInlineWrite(guarded!, { create: [{ product: "Cup" }] }, 7).create,
    ).toHaveLength(1);
  });
});

describe("inline queries", () => {
  const spec = resolveInlines([orderCollection(["items"]), itemCollection]).get(
    "orders",
  )?.[0];
  if (!spec) throw new Error("inline did not resolve");

  it("reads a parent's rows in the child's order, bounded by its page size", () => {
    const { sql, params } = buildInlineListQuery(db, spec, 7).toSQL();
    expect(sql).toContain('"order_id" = ?');
    expect(sql).toContain("order by");
    expect(sql).toContain("limit");
    expect(params).toContain(7);
  });

  it("scopes updates and deletes to the parent, not just the row id", () => {
    const update = buildInlineUpdateQuery(db, spec, 7, 3, {
      quantity: 2,
    }).toSQL();
    expect(update.sql).toContain('"id" = ?');
    expect(update.sql).toContain('"order_id" = ?');
    expect(update.params).toEqual(expect.arrayContaining([3, 7]));

    const remove = buildInlineDeleteQuery(db, spec, 7, 3).toSQL();
    expect(remove.sql).toContain('"id" = ?');
    expect(remove.sql).toContain('"order_id" = ?');
  });
});
