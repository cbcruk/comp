import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// Re-exported so `drizzle-kit` generates the migration for the history table.
export { historyEntries } from "@comp/core";

/**
 * A schema that is *hard* for an admin, on purpose: a parent with dependent
 * rows that only make sense edited together, a second relation, an enum, and a
 * date. `blog-d1` shows the stack; this one exercises the admin features.
 */
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  /**
   * Free text with no enum behind it: where the order came from. What it can
   * hold is a question only the rows can answer — the distinct-value filter.
   */
  channel: text("channel"),
  status: text("status", { enum: ["draft", "paid", "shipped", "cancelled"] })
    .notNull()
    .default("draft"),
  placedAt: integer("placed_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * The many-to-many. A Drizzle schema has no `ManyToManyField`, so the join
 * table *is* the declaration — and orders and tags stay two ordinary tables
 * that know nothing about each other.
 */
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const orderTags = sqliteTable(
  "order_tags",
  {
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  // One link per pair, and the pair is the identity: a join row has nothing
  // else to be.
  (table) => [primaryKey({ columns: [table.orderId, table.tagId] })],
);

/** The inline: line items have no life of their own outside their order. */
export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  product: text("product").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull().default(0),
});
