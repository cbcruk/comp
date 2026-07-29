import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../collection/define-collection.js";
import { buildReferenceCountQuery } from "../query/build-relation-query.js";
import { resolveDeleteRelations } from "./delete-impact.js";
import { humanize, resolveLabels, singularize } from "./labels.js";
import { INDEX_ROUTE, adminPath, parseAdminPath, type AdminRoute } from "./routes.js";

const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull(),
  customerId: integer("customer_id").references(() => customers.id),
});

const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  product: text("product").notNull(),
});

const orderCollection = defineCollection({
  model: orders,
  listDisplay: ["reference"],
});
const itemCollection = defineCollection({
  model: orderItems,
  listDisplay: ["product"],
});
const customerCollection = defineCollection({
  model: customers,
  listDisplay: ["name"],
});

const db = drizzle(async () => ({ rows: [] }));

describe("labels", () => {
  it("turns a slug into words", () => {
    expect(humanize("order_items")).toBe("Order items");
    expect(humanize("orders")).toBe("Orders");
    expect(humanize("blogPosts")).toBe("Blog posts");
  });

  it("drops a regular plural ending", () => {
    expect(singularize("Orders")).toBe("Order");
    expect(singularize("Categories")).toBe("Category");
    expect(singularize("Boxes")).toBe("Box");
    expect(singularize("Addresses")).toBe("Address");
  });

  it("leaves a word that is not a regular plural alone", () => {
    expect(singularize("Press")).toBe("Press");
    expect(singularize("Media")).toBe("Media");
  });

  it("defaults both names from the slug, and lets either be stated", () => {
    expect(resolveLabels("order_items")).toEqual({
      label: "Order item",
      labelPlural: "Order items",
    });
    expect(resolveLabels("people", "Person")).toEqual({
      label: "Person",
      labelPlural: "People",
    });
    expect(resolveLabels("person", undefined, "People")).toEqual({
      label: "People",
      labelPlural: "People",
    });
  });

  it("puts the names on the collection", () => {
    expect(itemCollection.label).toBe("Order item");
    expect(itemCollection.labelPlural).toBe("Order items");
    expect(
      defineCollection({ model: orders, listDisplay: ["reference"], label: "Sale" })
        .label,
    ).toBe("Sale");
  });
});

describe("routes", () => {
  const cases: [AdminRoute, string][] = [
    [{ view: "index" }, "/"],
    [{ view: "list", slug: "orders" }, "/orders"],
    [{ view: "add", slug: "orders" }, "/orders/add"],
    [{ view: "change", slug: "orders", id: "3" }, "/orders/3"],
    [{ view: "delete", slug: "orders", id: "3" }, "/orders/3/delete"],
  ];

  it("names every screen a registered collection gets", () => {
    for (const [route, path] of cases) {
      expect(adminPath(route)).toBe(path);
      expect(parseAdminPath(path)).toEqual(route);
    }
  });

  it("survives an id or slug that needs escaping", () => {
    const route: AdminRoute = { view: "change", slug: "order_items", id: "a/b" };
    expect(parseAdminPath(adminPath(route))).toEqual(route);
  });

  it("ignores a query string", () => {
    expect(parseAdminPath("/orders?status=draft")).toEqual({
      view: "list",
      slug: "orders",
    });
  });

  it("lands on the index rather than failing on a path it cannot read", () => {
    expect(parseAdminPath("")).toEqual(INDEX_ROUTE);
    expect(parseAdminPath("/")).toEqual(INDEX_ROUTE);
    expect(parseAdminPath("/orders/3/delete/extra")).toEqual(INDEX_ROUTE);
  });
});

describe("resolveDeleteRelations", () => {
  const relations = resolveDeleteRelations([
    orderCollection,
    itemCollection,
    customerCollection,
  ]);

  it("binds each inbound key to the collection that holds it", () => {
    expect(
      relations.get("orders")?.map((r) => [r.collection.slug, r.field, r.onDelete]),
    ).toEqual([["order_items", "orderId", "cascade"]]);
  });

  it("carries a key with no stated action, which is the blocking case", () => {
    expect(
      relations.get("customers")?.map((r) => [r.collection.slug, r.onDelete]),
    ).toEqual([["orders", undefined]]);
  });

  it("gives a collection nothing points at an empty list", () => {
    expect(relations.get("order_items")).toEqual([]);
  });
});

describe("buildReferenceCountQuery", () => {
  it("counts the rows pointing at a value through one key", () => {
    const { sql, params } = buildReferenceCountQuery(
      db,
      itemCollection,
      "orderId",
      7,
    ).toSQL();
    expect(sql).toContain("count(*)");
    expect(sql).toContain('"order_id" = ?');
    expect(params).toEqual([7]);
  });

  it("refuses a field the collection does not have", () => {
    expect(() => buildReferenceCountQuery(db, itemCollection, "nope", 1)).toThrow(
      /not found on "order_items"/,
    );
  });
});
