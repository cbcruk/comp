import { bulkDeleteAction, defineCollection } from "@comp/core";
import { customers, orderItems, orderTags, orders, tags } from "./schema.js";

export const customerCollection = defineCollection({
  model: customers,
  listDisplay: ["name", "email"],
  search: ["name", "email"],
});

/**
 * Line items are declared as their own collection — the API, MCP tools, and
 * capability checks all still apply to them — and *also* as an inline of the
 * order. Which key ties them together is read from the schema.
 */
export const orderItemCollection = defineCollection({
  model: orderItems,
  listDisplay: ["product", "quantity", "unitPrice"],
  // Nothing declares what a product may be, so the filter reads the column:
  // the products actually ordered, and nothing else.
  filters: [{ field: "product", kind: "values" }],
  ordering: [{ field: "id", direction: "asc" }],
});

export const tagCollection = defineCollection({
  model: tags,
  listDisplay: ["name"],
  search: ["name"],
});

export const orderCollection = defineCollection({
  model: orders,
  listDisplay: ["reference", "customerId", "status", "placedAt"],
  // Each of these filters a different way, and none of it is configured here:
  // status offers its enum values, customerId the customers it points at plus
  // empty/not-empty, placedAt the date windows, and channel — a plain text
  // column — the values the orders themselves hold, plus Empty for the ones
  // that never said.
  filters: [
    "status",
    { field: "channel", kind: "values" },
    "customerId",
    "placedAt",
  ],
  // The same column, navigated instead of selected: year → month → day.
  dateHierarchy: "placedAt",
  // Find an order by its reference, or by who placed it.
  search: ["^reference", "customerId__name", "customerId__email"],
  ordering: [{ field: "placedAt", direction: "desc" }],
  fieldsets: [
    { title: "Order", fields: [["reference", "customerId"], "channel"] },
    { title: "Status", fields: [["status", "placedAt"]], collapsed: true },
  ],
  radioFields: ["status"],
  inlines: ["order_items"],
  // Which key is the order's and which is the tag's is read off `order_tags`;
  // all that is declared here is the table and the other side.
  // Filterable too: "orders tagged rush", matched through the join table.
  manyToMany: [{ collection: "tags", through: orderTags, filter: true }],
});

export const collections = [
  orderCollection,
  orderItemCollection,
  customerCollection,
  tagCollection,
];

export const actions = [bulkDeleteAction(orderCollection.slug)];
