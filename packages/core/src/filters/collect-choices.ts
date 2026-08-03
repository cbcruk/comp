import type { RecordScope } from "../auth/auth-adapter.types.js";
import type { Collection } from "../collection/define-collection.types.js";
import { buildDistinctValuesQuery } from "../query/build-choices-query.js";
import type { SqliteDb } from "../query/build-list-query.js";
import { DEFAULT_VALUES_LIMIT } from "./resolve-filters.js";
import type { FilterChoices, FilterOption } from "./filter.types.js";

/** The choice a nullable column offers for the rows that have no value. */
const EMPTY_OPTION: FilterOption = { value: "isnull:true", label: "Empty" };

/**
 * Render one stored value as the query value that selects it — the same text
 * an exact filter carries, so choosing an option is assignment rather than a
 * translation that could disagree with the query layer.
 */
function optionFor(value: unknown): FilterOption | null {
  if (value === null || value === undefined) return null;
  // The empty string is the one value this encoding cannot carry — an empty
  // query value means "not filtering" — so it is left out rather than offered
  // as a choice that would clear the filter instead of applying it.
  const text = String(value);
  return text === "" ? null : { value: text, label: text };
}

/**
 * Read the values each `values` filter's column actually holds.
 *
 * Django's `AllValuesFieldListFilter` offers what is in the column rather than
 * what the schema declares, which is the only way to filter a plain text column
 * from a list — re-derived here from that behavior. Two properties of it are
 * worth keeping: the choices come from the whole table rather than from the
 * currently-narrowed list (a filter that narrows itself can only be cleared,
 * not changed), and a column with nulls in it offers an entry for them.
 *
 * The cost is a query per declared filter, per request — which is why the kind
 * is never inferred, only asked for, and why each one carries a limit. A
 * collection that declares none pays nothing: this returns without touching
 * the database.
 */
export async function collectFilterChoices(
  db: SqliteDb,
  collection: Collection,
  scope?: RecordScope,
): Promise<FilterChoices[]> {
  const filters = collection.filters.filter((filter) => filter.kind === "values");
  if (filters.length === 0) return [];

  return Promise.all(
    filters.map(async (filter): Promise<FilterChoices> => {
      const limit = filter.limit ?? DEFAULT_VALUES_LIMIT;
      const rows = (await buildDistinctValuesQuery(
        db,
        collection,
        filter.field,
        limit,
        scope,
      ).all()) as { value: unknown }[];

      const present = rows.filter((row) => row.value !== null);
      const truncated = present.length > limit;
      const options = present
        .slice(0, limit)
        .map((row) => optionFor(row.value))
        .filter((option): option is FilterOption => option !== null);

      // Nulls sort last, so their absence is only proof of anything when the
      // whole column fit in the answer; past that, fall back to what the
      // schema says the column allows.
      const hasNull = truncated
        ? filter.nullable
        : rows.some((row) => row.value === null);

      return {
        field: filter.field,
        options: hasNull ? [...options, EMPTY_OPTION] : options,
        truncated,
      };
    }),
  );
}
