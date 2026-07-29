import { bulkDeleteAction, defineCollection } from "@comp/core";
import { customers, orderItems, orders } from "./schema.js";

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
  ordering: [{ field: "id", direction: "asc" }],
});

export const orderCollection = defineCollection({
  model: orders,
  listDisplay: ["reference", "customerId", "status", "placedAt"],
  filters: ["status"],
  search: ["reference"],
  ordering: [{ field: "placedAt", direction: "desc" }],
  inlines: ["order_items"],
});

export const collections = [
  orderCollection,
  orderItemCollection,
  customerCollection,
];

export const actions = [bulkDeleteAction(orderCollection.slug)];
