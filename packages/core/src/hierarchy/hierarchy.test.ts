import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../collection/define-collection.js";
import { buildBucketCountQuery } from "../query/build-hierarchy-query.js";
import { buildCountQuery, buildListQuery } from "../query/build-list-query.js";
import { columnFor } from "../query/build-relation-query.js";
import {
  breadcrumbFor,
  bucketsFor,
  datePathRange,
  formatDatePath,
  levelOf,
  parseDatePath,
} from "./date-path.js";

const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull(),
  placedAt: integer("placed_at", { mode: "timestamp" }).notNull(),
});

const orderCollection = defineCollection({
  model: orders,
  listDisplay: ["reference"],
  filters: ["placedAt"],
  dateHierarchy: "placedAt",
});

const db = drizzle(async () => ({ rows: [] }));

describe("parseDatePath", () => {
  it("reads each depth of the trail", () => {
    expect(parseDatePath("2026")).toEqual({ year: 2026 });
    expect(parseDatePath("2026-07")).toEqual({ year: 2026, month: 7 });
    expect(parseDatePath("2026-07-16")).toEqual({ year: 2026, month: 7, day: 16 });
  });

  it("reads nothing as all dates", () => {
    expect(parseDatePath(undefined)).toEqual({});
    expect(parseDatePath("")).toEqual({});
  });

  it("falls back to all dates rather than failing on nonsense", () => {
    // A bad date in a URL should show the unfiltered list, not an error.
    expect(parseDatePath("nope")).toEqual({});
    expect(parseDatePath("2026-13")).toEqual({});
    expect(parseDatePath("2026-02-30")).toEqual({});
    expect(parseDatePath("2026-07-16-01")).toEqual({});
  });

  it("accepts the last day of a month, and rejects the one after", () => {
    expect(parseDatePath("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseDatePath("2026-02-29")).toEqual({});
  });

  it("round-trips", () => {
    for (const raw of ["2026", "2026-07", "2026-07-16"]) {
      expect(formatDatePath(parseDatePath(raw))).toBe(raw);
    }
  });
});

describe("levelOf", () => {
  it("says which level a path is showing", () => {
    expect(levelOf({})).toBe("year");
    expect(levelOf({ year: 2026 })).toBe("month");
    expect(levelOf({ year: 2026, month: 7 })).toBe("day");
    expect(levelOf({ year: 2026, month: 7, day: 16 })).toBe("record");
  });
});

describe("datePathRange", () => {
  it("bounds a year, a month and a day, upper bound exclusive", () => {
    expect(datePathRange({ year: 2026 })).toEqual({
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2027-01-01T00:00:00Z"),
    });
    expect(datePathRange({ year: 2026, month: 12 })).toEqual({
      from: new Date("2026-12-01T00:00:00Z"),
      to: new Date("2027-01-01T00:00:00Z"),
    });
    expect(datePathRange({ year: 2026, month: 7, day: 31 })).toEqual({
      from: new Date("2026-07-31T00:00:00Z"),
      to: new Date("2026-08-01T00:00:00Z"),
    });
  });

  it("selects everything when the path is empty", () => {
    expect(datePathRange({})).toBeNull();
  });
});

describe("bucketsFor", () => {
  it("offers the years the data spans", () => {
    const buckets = bucketsFor(
      {},
      { min: new Date("2024-06-01T00:00:00Z"), max: new Date("2026-02-01T00:00:00Z") },
    );
    expect(buckets.map((b) => b.label)).toEqual(["2024", "2025", "2026"]);
  });

  it("has nothing to offer at the top when there are no records", () => {
    expect(bucketsFor({}, null)).toEqual([]);
  });

  it("offers all twelve months and the month's own days", () => {
    // Below a year the calendar decides, not the data — the counts then drop
    // the empty ones.
    const months = bucketsFor({ year: 2026 }, null);
    expect(months).toHaveLength(12);
    expect(months[6]?.label).toBe("July");

    expect(bucketsFor({ year: 2026, month: 2 }, null)).toHaveLength(28);
    expect(bucketsFor({ year: 2024, month: 2 }, null)).toHaveLength(29);
  });

  it("stops at a fully drilled-in path", () => {
    expect(bucketsFor({ year: 2026, month: 7, day: 16 }, null)).toEqual([]);
  });
});

describe("breadcrumbFor", () => {
  it("names the trail back up", () => {
    expect(breadcrumbFor({ year: 2026, month: 7, day: 16 }).map((c) => c.label)).toEqual(
      ["All dates", "2026", "July", "16"],
    );
    expect(breadcrumbFor({}).map((c) => c.label)).toEqual(["All dates"]);
  });
});

describe("the drill-down in the query", () => {
  it("narrows the list to the window the path selects", () => {
    const { sql, params } = buildListQuery(db, orderCollection, {
      datePath: { year: 2026, month: 7 },
    }).toSQL();
    expect(sql).toContain('"placed_at" >= ?');
    expect(sql).toContain('"placed_at" < ?');
    // Drizzle stores this column as epoch seconds.
    expect(params).toContain(Date.UTC(2026, 6, 1) / 1000);
    expect(params).toContain(Date.UTC(2026, 7, 1) / 1000);
  });

  it("narrows the total the same way", () => {
    const { sql } = buildCountQuery(db, orderCollection, {
      datePath: { year: 2026 },
    }).toSQL();
    expect(sql).toContain('"placed_at" >= ?');
  });

  it("adds nothing when the path is empty", () => {
    expect(buildListQuery(db, orderCollection, { datePath: {} }).toSQL().sql).not.toContain(
      "where",
    );
  });

  it("combines with the filters already narrowing the list", () => {
    const { sql } = buildListQuery(db, orderCollection, {
      datePath: { year: 2026 },
      filters: { placedAt: { op: "isnull", value: false } },
    }).toSQL();
    expect(sql).toContain("is not null");
    expect(sql).toContain('"placed_at" >= ?');
    expect(sql).toContain("and");
  });
});

describe("buildBucketCountQuery", () => {
  const column = columnFor(orderCollection, "placedAt");

  it("counts every bucket in one query", () => {
    const buckets = bucketsFor({ year: 2026 }, null);
    const { sql, params } = buildBucketCountQuery(
      db,
      orderCollection,
      {},
      column,
      buckets,
    ).toSQL();

    // Twelve summed branches, not twelve round trips.
    expect(sql.match(/sum\(case when/g)).toHaveLength(12);
    expect(params).toHaveLength(24);
    expect(params[0]).toBe(Date.UTC(2026, 0, 1) / 1000);

    // Every branch is named. Without the aliases the branches are the same
    // expression text, and a driver that keys rows by column name — D1 does —
    // hands back one collapsed value, leaving every bucket but one empty.
    const aliases = sql.match(/ as "b\d+"/g) ?? [];
    expect(new Set(aliases).size).toBe(12);
  });

  it("counts within whatever the list is already showing", () => {
    const { sql } = buildBucketCountQuery(
      db,
      orderCollection,
      { search: "", filters: { placedAt: { op: "isnull", value: false } } },
      column,
      bucketsFor({ year: 2026 }, null),
    ).toSQL();
    expect(sql).toContain("is not null");
  });
});

describe("dateHierarchy on the collection", () => {
  it("is resolved onto the collection", () => {
    expect(orderCollection.dateHierarchy).toBe("placedAt");
    expect(
      defineCollection({ model: orders, listDisplay: ["reference"] }).dateHierarchy,
    ).toBeNull();
  });

  it("refuses a column that could never be drilled into", () => {
    expect(() =>
      defineCollection({
        model: orders,
        listDisplay: ["reference"],
        dateHierarchy: "reference",
      }),
    ).toThrow(/not a date column/);
  });
});
