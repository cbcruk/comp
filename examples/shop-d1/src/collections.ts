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
  // Each of these filters a different way, and none of it is configured here:
  // status offers its enum values, customerId the customers it points at plus
  // empty/not-empty, placedAt the date windows.
  filters: ["status", "customerId", "placedAt"],
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
