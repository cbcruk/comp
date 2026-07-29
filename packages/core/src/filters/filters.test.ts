import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../collection/define-collection.js";
import { introspectTable } from "../introspection/introspect-table.js";
import { buildListQuery } from "../query/build-list-query.js";
import {
  coerceFilterOperand,
  dateRangeFor,
  formatFilterValue,
  parseFilterValue,
} from "./filter-value.js";
import { inferFilterKind, resolveFilters } from "./resolve-filters.js";

const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull(),
  status: text("status", { enum: ["draft", "paid"] }).notNull().default("draft"),
  customerId: integer("customer_id").references(() => customers.id),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  placedAt: integer("placed_at", { mode: "timestamp" }).notNull(),
});

const fields = introspectTable(orders).fields;
const db = drizzle(async () => ({ rows: [] }));

const collection = defineCollection({
  model: orders,
  listDisplay: ["reference", "status"],
  filters: ["status", "customerId", "archived", "placedAt", "reference"],
});

function sqlFor(filters: Record<string, unknown>, now?: Date): string {
  return buildListQuery(db, collection, {
    filters,
    ...(now ? { now } : {}),
  }).toSQL().sql;
}

function paramsFor(filters: Record<string, unknown>, now?: Date): unknown[] {
  return buildListQuery(db, collection, {
    filters,
    ...(now ? { now } : {}),
  }).toSQL().params;
}

describe("inferFilterKind", () => {
  it("reads the kind off the column's type", () => {
    expect(inferFilterKind(fields.status!)).toBe("choices");
    expect(inferFilterKind(fields.archived!)).toBe("boolean");
    expect(inferFilterKind(fields.placedAt!)).toBe("date");
    expect(inferFilterKind(fields.customerId!)).toBe("relation");
    expect(inferFilterKind(fields.reference!)).toBe("exact");
  });
});

describe("resolveFilters", () => {
  it("gives an enum its own values as choices", () => {
    const [filter] = resolveFilters(fields, ["status"]);
    expect(filter).toEqual({
      field: "status",
      kind: "choices",
      options: [
        { value: "draft", label: "draft" },
        { value: "paid", label: "paid" },
      ],
      nullable: false,
    });
  });

  it("marks a nullable column so an empty/not-empty choice can be offered", () => {
    const [filter] = resolveFilters(fields, ["customerId"]);
    expect(filter?.nullable).toBe(true);
    expect(filter?.table).toBe("customers");
    expect(resolveFilters(fields, ["status"])[0]?.nullable).toBe(false);
  });

  it("gives a boolean yes/no", () => {
    expect(resolveFilters(fields, ["archived"])[0]?.options).toEqual([
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ]);
  });

  it("honors an explicit kind over the inferred one", () => {
    expect(resolveFilters(fields, [{ field: "status", kind: "exact" }])[0]).toEqual({
      field: "status",
      kind: "exact",
      options: [],
      nullable: false,
    });
  });

  it("drops a filter naming a column the table lacks", () => {
    expect(resolveFilters(fields, ["nope"])).toEqual([]);
  });
});

describe("parseFilterValue", () => {
  it("reads a bare value as an exact match", () => {
    expect(parseFilterValue("draft")).toEqual({ op: "exact", value: "draft" });
  });

  it("does not mistake a colon in the data for an operator", () => {
    expect(parseFilterValue("2026-01-02T03:04:05Z")).toEqual({
      op: "exact",
      value: "2026-01-02T03:04:05Z",
    });
  });

  it("reads each operation", () => {
    expect(parseFilterValue("in:draft,paid")).toEqual({
      op: "in",
      values: ["draft", "paid"],
    });
    expect(parseFilterValue("isnull:true")).toEqual({ op: "isnull", value: true });
    expect(parseFilterValue("isnull:false")).toEqual({ op: "isnull", value: false });
    expect(parseFilterValue("preset:month")).toEqual({ op: "preset", preset: "month" });
    expect(parseFilterValue("range:2026-01-01..2026-02-01")).toEqual({
      op: "range",
      from: "2026-01-01",
      to: "2026-02-01",
    });
  });

  it("accepts an open-ended range", () => {
    expect(parseFilterValue("range:2026-01-01..")).toEqual({
      op: "range",
      from: "2026-01-01",
    });
    expect(parseFilterValue("range:..2026-02-01")).toEqual({
      op: "range",
      to: "2026-02-01",
    });
  });

  it("rejects empty and unknown values rather than guessing", () => {
    expect(parseFilterValue("")).toBeNull();
    expect(parseFilterValue("in:")).toBeNull();
    expect(parseFilterValue("range:..")).toBeNull();
    expect(parseFilterValue("preset:someday")).toBeNull();
  });

  it("round-trips through the query string", () => {
    for (const raw of [
      "draft",
      "in:draft,paid",
      "isnull:true",
      "preset:year",
      "range:2026-01-01..2026-02-01",
    ]) {
      expect(formatFilterValue(parseFilterValue(raw)!)).toBe(raw);
    }
  });
});

describe("coerceFilterOperand", () => {
  it("matches the operand to what the column stores", () => {
    expect(coerceFilterOperand(fields.customerId!, "7")).toBe(7);
    expect(coerceFilterOperand(fields.archived!, "true")).toBe(true);
    expect(coerceFilterOperand(fields.archived!, "false")).toBe(false);
    expect(coerceFilterOperand(fields.reference!, "A-1")).toBe("A-1");
    expect(coerceFilterOperand(fields.placedAt!, "2026-01-01")).toEqual(
      new Date("2026-01-01"),
    );
  });

  it("reports an unusable operand as null instead of NaN", () => {
    expect(coerceFilterOperand(fields.placedAt!, "not-a-date")).toBeNull();
    expect(coerceFilterOperand(fields.customerId!, "")).toBeNull();
  });
});

describe("dateRangeFor", () => {
  // A Thursday, mid-month, mid-afternoon UTC.
  const now = new Date("2026-07-16T14:30:00Z");

  it("bounds today from midnight to midnight", () => {
    expect(dateRangeFor("today", now)).toEqual({
      from: new Date("2026-07-16T00:00:00Z"),
      to: new Date("2026-07-17T00:00:00Z"),
    });
  });

  it("bounds the past week, this month and this year", () => {
    expect(dateRangeFor("past7", now).from).toEqual(new Date("2026-07-09T00:00:00Z"));
    expect(dateRangeFor("month", now)).toEqual({
      from: new Date("2026-07-01T00:00:00Z"),
      to: new Date("2026-08-01T00:00:00Z"),
    });
    expect(dateRangeFor("year", now)).toEqual({
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2027-01-01T00:00:00Z"),
    });
  });

  it("rolls over a year boundary", () => {
    const december = new Date("2026-12-31T23:59:00Z");
    expect(dateRangeFor("month", december).to).toEqual(new Date("2027-01-01T00:00:00Z"));
    expect(dateRangeFor("today", december).to).toEqual(new Date("2027-01-01T00:00:00Z"));
  });
});

describe("filters in the query", () => {
  it("still reads a bare scalar as an exact match", () => {
    expect(sqlFor({ status: "draft" })).toContain('"status" = ?');
    expect(paramsFor({ status: "draft" })).toContain("draft");
  });

  it("coerces the operand to the column's type", () => {
    // Without coercion this compares an integer column against the text "7".
    expect(paramsFor({ customerId: { op: "exact", value: "7" } })).toContain(7);
  });

  it("builds in, isnull and range", () => {
    expect(sqlFor({ status: { op: "in", values: ["draft", "paid"] } })).toContain(
      '"status" in (?, ?)',
    );
    expect(sqlFor({ customerId: { op: "isnull", value: true } })).toContain(
      '"customer_id" is null',
    );
    expect(sqlFor({ customerId: { op: "isnull", value: false } })).toContain(
      '"customer_id" is not null',
    );

    const range = sqlFor({
      placedAt: { op: "range", from: "2026-01-01", to: "2026-02-01" },
    });
    expect(range).toContain('"placed_at" >= ?');
    expect(range).toContain('"placed_at" < ?');
  });

  it("resolves a preset against the instant it was given", () => {
    const now = new Date("2026-07-16T14:30:00Z");
    const params = paramsFor({ placedAt: { op: "preset", preset: "today" } }, now);
    // Drizzle stores timestamps as epoch seconds.
    expect(params).toContain(Date.UTC(2026, 6, 16) / 1000);
    expect(params).toContain(Date.UTC(2026, 6, 17) / 1000);
  });

  it("honors an open-ended range", () => {
    const sql = sqlFor({ placedAt: { op: "range", from: "2026-01-01" } });
    expect(sql).toContain('"placed_at" >= ?');
    expect(sql).not.toContain('"placed_at" < ?');
  });

  it("ignores a column the collection never opened for filtering", () => {
    expect(sqlFor({ id: "1" })).not.toContain('"id" = ?');
  });

  it("skips a filter whose operand list is empty", () => {
    expect(sqlFor({ status: { op: "in", values: [] } })).not.toContain("in (");
  });

  it("ands filters together with the search term", () => {
    const sql = buildListQuery(db, collection, {
      filters: { status: "draft", archived: { op: "exact", value: "false" } },
      search: "",
    }).toSQL().sql;
    expect(sql).toContain("and");
    expect(sql).toContain('"status" = ?');
    expect(sql).toContain('"archived" = ?');
  });
});
