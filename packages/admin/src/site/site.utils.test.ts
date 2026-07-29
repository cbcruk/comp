import type { DeleteImpact } from "@comp/core";
import { describe, expect, it } from "vitest";
import type { CollectionSummary } from "../client/create-client.types.js";
import { can, describeImpact, recordTitle, summarizeImpact } from "./site.utils.js";

const orders = {
  slug: "orders",
  label: "Order",
  labelPlural: "Orders",
  permitted: ["list", "read", "create"],
  labelField: "reference",
  primaryKey: "id",
} as unknown as CollectionSummary;

const impact = (over: Partial<DeleteImpact> = {}): DeleteImpact => ({
  collection: "orders",
  id: 3,
  related: [],
  cascades: 0,
  blocked: false,
  ...over,
});

describe("can", () => {
  it("answers from what the server said this caller may do", () => {
    expect(can(orders, "create")).toBe(true);
    expect(can(orders, "delete")).toBe(false);
  });
});

describe("recordTitle", () => {
  it("uses the label field", () => {
    expect(recordTitle(orders, { reference: "A-1" }, "3")).toBe("A-1");
  });

  it("falls back to the record's key when there is nothing to show", () => {
    expect(recordTitle(orders, { reference: "" }, "3")).toBe("Order 3");
    expect(recordTitle(orders, null, "3")).toBe("Order 3");
    expect(recordTitle({ ...orders, labelField: null }, { reference: "A" }, "3")).toBe(
      "Order 3",
    );
  });
});

describe("describeImpact", () => {
  it("says what happens to each set of dependent rows", () => {
    const lines = describeImpact(
      impact({
        related: [
          { collection: "order_items", field: "orderId", count: 3, effect: "cascade" },
          { collection: "invoices", field: "orderId", count: 1, effect: "clear" },
          { collection: "shipments", field: "orderId", count: 2, effect: "block" },
        ],
      }),
    );
    expect(lines.map((line) => line.text)).toEqual([
      "3 order_items will be deleted with it",
      "1 invoices will lose their orderId",
      "2 shipments still reference this record, so the delete will be refused",
    ]);
  });

  it("marks only the line that stands in the way", () => {
    const lines = describeImpact(
      impact({
        related: [
          { collection: "order_items", field: "orderId", count: 3, effect: "cascade" },
          { collection: "shipments", field: "orderId", count: 2, effect: "block" },
        ],
      }),
    );
    expect(lines.map((line) => line.blocking)).toEqual([false, true]);
  });

  it("says nothing when nothing points at the record", () => {
    expect(describeImpact(impact())).toEqual([]);
  });
});

describe("summarizeImpact", () => {
  it("leads with the refusal when the delete cannot go ahead", () => {
    expect(summarizeImpact(impact({ blocked: true, cascades: 4 }))).toBe(
      "This record cannot be deleted yet.",
    );
  });

  it("counts what goes with it, singular and plural", () => {
    expect(summarizeImpact(impact({ cascades: 1 }))).toBe(
      "This will also delete 1 related record.",
    );
    expect(summarizeImpact(impact({ cascades: 4 }))).toBe(
      "This will also delete 4 related records.",
    );
  });

  it("says so when the delete is local", () => {
    expect(summarizeImpact(impact())).toBe("Nothing else references this record.");
  });
});
