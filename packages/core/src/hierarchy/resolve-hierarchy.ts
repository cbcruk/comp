import type { Collection } from "../collection/define-collection.types.js";
import type { SqliteDb } from "../query/build-list-query.js";
import {
  bucketKey,
  buildBucketCountQuery,
  buildDateBoundQuery,
  hierarchyColumn,
} from "../query/build-hierarchy-query.js";
import type { ListParams } from "../query/list-query.types.js";
import {
  bucketsFor,
  breadcrumbFor,
  levelOf,
  type DatePath,
  type HierarchyCrumb,
  type HierarchyLevel,
} from "./date-path.js";

export interface HierarchyChoice {
  label: string;
  /** The path this choice drills into, ready for the query string. */
  path: string;
  count: number;
}

export interface DateHierarchy {
  field: string;
  /** Where the drill-down is now. */
  path: string;
  level: HierarchyLevel;
  breadcrumb: (HierarchyCrumb & { path: string })[];
  /** Periods one step down that actually contain records. */
  choices: HierarchyChoice[];
}

function pathString(path: DatePath): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  if (path.year === undefined) return "";
  if (path.month === undefined) return String(path.year);
  if (path.day === undefined) return `${String(path.year)}-${pad(path.month)}`;
  return `${String(path.year)}-${pad(path.month)}-${pad(path.day)}`;
}

/**
 * Build the drill-down strip for the current list.
 *
 * Django's date hierarchy offers only periods that have records, counted
 * within whatever the list is already showing — a month emptied by the active
 * filters is not a link worth having. Reproducing that means asking the
 * database, so this costs one query (the bucket counts) plus two more at the
 * top level, where which *years* to offer depends on the data rather than the
 * calendar.
 */
export async function collectDateHierarchy(
  db: SqliteDb,
  collection: Collection,
  params: ListParams = {},
): Promise<DateHierarchy | null> {
  if (!collection.dateHierarchy) return null;

  const column = hierarchyColumn(collection);
  const path = params.datePath ?? {};
  const level = levelOf(path);

  // Drilled all the way in: the list itself is the answer.
  if (level === "record") {
    return {
      field: collection.dateHierarchy,
      path: pathString(path),
      level,
      breadcrumb: breadcrumbFor(path).map((crumb) => ({
        ...crumb,
        path: pathString(crumb.path),
      })),
      choices: [],
    };
  }

  let span: { min: Date; max: Date } | null = null;
  if (level === "year") {
    const [first] = await buildDateBoundQuery(db, collection, params, column, "min").all();
    const [last] = await buildDateBoundQuery(db, collection, params, column, "max").all();
    const min = (first as Record<string, unknown> | undefined)?.[
      collection.dateHierarchy
    ];
    const max = (last as Record<string, unknown> | undefined)?.[
      collection.dateHierarchy
    ];
    if (min instanceof Date && max instanceof Date) span = { min, max };
  }

  const buckets = bucketsFor(path, span);
  const choices: HierarchyChoice[] = [];

  if (buckets.length > 0) {
    const [counts] = await buildBucketCountQuery(
      db,
      collection,
      params,
      column,
      buckets,
    ).all();
    buckets.forEach((bucket, index) => {
      const count = Number(
        (counts as Record<string, unknown> | undefined)?.[bucketKey(index)] ?? 0,
      );
      // A period with nothing in it is not a place to go.
      if (count > 0) {
        choices.push({ label: bucket.label, path: pathString(bucket.path), count });
      }
    });
  }

  return {
    field: collection.dateHierarchy,
    path: pathString(path),
    level,
    breadcrumb: breadcrumbFor(path).map((crumb) => ({
      ...crumb,
      path: pathString(crumb.path),
    })),
    choices,
  };
}
