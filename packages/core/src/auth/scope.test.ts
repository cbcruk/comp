import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../collection/define-collection.js";
import {
  buildDeleteQuery,
  buildUpdateQuery,
} from "../mutation/build-mutations.js";
import { buildGetByIdQuery } from "../query/build-get-query.js";
import { buildCountQuery, buildListQuery } from "../query/build-list-query.js";
import { scopeConditions } from "../query/build-scope-where.js";
import type { AuthAdapter } from "./auth-adapter.types.js";
import {
  authorizeRecordAccess,
  checksRecords,
  resolveScope,
} from "./authorize.js";

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  status: text("status", { enum: ["draft", "published"] }).notNull(),
  authorId: integer("author_id"),
});

const db = drizzle(async () => ({ rows: [] }));
const collection = defineCollection({
  model: posts,
  listDisplay: ["title", "status"],
  filters: ["status"],
});

const base: AuthAdapter = {
  authenticate: () => null,
  authorize: () => true,
};

describe("a scope in the query", () => {
  it("narrows the list and its total the same way", () => {
    const scope = { status: "published" };
    const list = buildListQuery(db, collection, { scope }).toSQL();
    const count = buildCountQuery(db, collection, { scope }).toSQL();
    expect(list.sql).toContain('"status" = ?');
    expect(count.sql).toContain('"status" = ?');
    expect(count.params).toContain("published");
  });

  it("reaches columns the collection never opened for filtering", () => {
    // A filter is the request's to set, so it is limited to declared columns.
    // A scope is the server's own rule and answers to nothing in the request.
    const sql = buildListQuery(db, collection, {
      scope: { authorId: 7 },
      filters: { authorId: 9 },
    }).toSQL();
    expect(sql.params).toContain(7);
    expect(sql.params).not.toContain(9);
  });

  it("speaks the same operations a filter does", () => {
    const conditions = scopeConditions(collection, {
      status: { op: "in", values: ["draft", "published"] },
      authorId: { op: "isnull", value: false },
    });
    expect(conditions).toHaveLength(2);
  });

  it("throws on a column that does not exist", () => {
    // Dropping it — what an unknown *filter* does — would mean returning every
    // row, so this is the one place the query layer fails closed and loudly.
    expect(() => scopeConditions(collection, { tenant: "acme" })).toThrow(
      /not a column/,
    );
  });

  it("narrows a read by id, so an invisible row is simply missing", () => {
    const { sql } = buildGetByIdQuery(db, collection, 1, {
      status: "published",
    }).toSQL();
    expect(sql).toContain('"id" = ?');
    expect(sql).toContain('"status" = ?');
  });

  it("goes inside the update and delete statements", () => {
    // Not checked before the write: a read that says yes and a write that
    // trusts it are two moments the row could change between.
    const update = buildUpdateQuery(
      db,
      collection,
      1,
      { title: "x" },
      { authorId: 7 },
    ).toSQL();
    expect(update.sql).toContain('"author_id" = ?');
    expect(update.params).toContain(7);

    const remove = buildDeleteQuery(db, collection, 1, { authorId: 7 }).toSQL();
    expect(remove.sql).toContain('"author_id" = ?');
  });
});

describe("the per-record decision", () => {
  it("is only paid for by adapters that make one", () => {
    expect(checksRecords(base)).toBe(false);
    expect(checksRecords({ ...base, authorizeRecord: () => true })).toBe(true);
    expect(checksRecords({ ...base, scope: () => ({ authorId: 1 }) })).toBe(true);
  });

  it("refines a grant and never creates one", async () => {
    const auth: AuthAdapter = {
      ...base,
      authorize: ({ operation }) => operation === "read",
      authorizeRecord: () => true,
    };
    const args = {
      identity: null,
      collection,
      record: { id: 1, status: "draft" },
    };
    expect(
      await authorizeRecordAccess(auth, { ...args, operation: "read" }),
    ).toBe(true);
    // The row-level hook says yes; the collection-level grant still says no.
    expect(
      await authorizeRecordAccess(auth, { ...args, operation: "delete" }),
    ).toBe(false);
  });

  it("decides from the row it is given", async () => {
    const auth: AuthAdapter = {
      ...base,
      authorizeRecord: ({ record }) => record.status !== "published",
    };
    const args = { identity: null, collection, operation: "delete" as const };
    expect(
      await authorizeRecordAccess(auth, { ...args, record: { status: "draft" } }),
    ).toBe(true);
    expect(
      await authorizeRecordAccess(auth, {
        ...args,
        record: { status: "published" },
      }),
    ).toBe(false);
  });

  it("reads no scope from an adapter that declares none", async () => {
    expect(await resolveScope(base, null, collection)).toBeUndefined();
    expect(
      await resolveScope({ ...base, scope: () => null }, null, collection),
    ).toBeUndefined();
  });
});
