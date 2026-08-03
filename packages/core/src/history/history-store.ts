import { and, desc, eq, inArray } from "drizzle-orm";
import type { SqliteDb } from "../query/build-list-query.js";
import {
  historyEntries,
  parseFields,
  serializeFields,
} from "./history-schema.js";
import type {
  HistoryAction,
  HistoryEntry,
  HistoryQuery,
  HistoryStore,
} from "./history.types.js";

const DEFAULT_LIMIT = 50;

/** Newest first, and never unbounded — a history view is a page, not a dump. */
function limitOf(query: HistoryQuery): number {
  return Math.max(1, Math.min(query.limit ?? DEFAULT_LIMIT, 500));
}

/**
 * A {@link HistoryStore} backed by Drizzle over SQLite/D1, using the canonical
 * table. Persistent and isolate-shared, so it survives the request that wrote
 * it — unlike the in-memory store.
 */
export function createDrizzleHistoryStore(db: SqliteDb): HistoryStore {
  return {
    async record(entry) {
      await db.insert(historyEntries).values({
        collection: entry.collection,
        recordId: entry.recordId,
        action: entry.action,
        label: entry.label,
        fields: serializeFields(entry.fields),
        actor: entry.actor,
        at: entry.at,
      });
    },

    async list(query) {
      const conditions = [];
      if (query.collection) {
        conditions.push(eq(historyEntries.collection, query.collection));
      }
      if (query.recordId !== undefined) {
        conditions.push(eq(historyEntries.recordId, query.recordId));
      }
      if (query.collections) {
        // An empty allow-list means the caller may see nothing, which is not
        // the same as no filter at all.
        if (query.collections.length === 0) return [];
        conditions.push(inArray(historyEntries.collection, query.collections));
      }

      let statement = db.select().from(historyEntries).$dynamic();
      if (conditions.length > 0) {
        statement = statement.where(
          conditions.length === 1 ? conditions[0] : and(...conditions),
        );
      }
      const rows = await statement
        .orderBy(desc(historyEntries.at), desc(historyEntries.id))
        .limit(limitOf(query));

      return rows.map((row) => ({
        collection: row.collection,
        recordId: row.recordId,
        action: row.action as HistoryAction,
        label: row.label,
        fields: parseFields(row.fields),
        actor: row.actor,
        at: row.at,
      }));
    },
  };
}

/**
 * A {@link HistoryStore} in memory. For tests and local development — an edge
 * runtime discards it between requests, so it is never the production answer.
 */
export function createMemoryHistoryStore(): HistoryStore & {
  entries: HistoryEntry[];
} {
  const entries: HistoryEntry[] = [];

  return {
    entries,
    record(entry) {
      entries.push(entry);
      return Promise.resolve();
    },
    list(query) {
      const allowed = query.collections ? new Set(query.collections) : null;
      const matches = entries
        .filter((entry) => {
          if (query.collection && entry.collection !== query.collection) return false;
          if (query.recordId !== undefined && entry.recordId !== query.recordId) {
            return false;
          }
          if (allowed && !allowed.has(entry.collection)) return false;
          return true;
        })
        .slice()
        .reverse()
        .slice(0, limitOf(query));
      return Promise.resolve(matches);
    },
  };
}
