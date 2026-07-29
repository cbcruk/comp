import {
  parseFilterValue,
  type Collection,
  type FieldOrdering,
  type FilterMap,
  type ListParams,
} from "@comp/core";

function toPositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Translate a request's query string into {@link ListParams}. Only the
 * collection's declared filter/search columns are honored, so the URL surface
 * can never reach a column the declaration didn't opt in to.
 *
 * A filter's value carries its operation (`in:`, `isnull:`, `range:`,
 * `preset:`), so a filtered view is a shareable link that keeps meaning what
 * it said — and a value the encoding does not recognize is dropped rather than
 * guessed at.
 */
export function parseListParams(
  collection: Collection,
  query: Record<string, string>,
): ListParams {
  const filters: FilterMap = {};
  for (const filter of collection.filters) {
    const raw = query[filter.field];
    if (raw === undefined) continue;
    const value = parseFilterValue(raw);
    if (value) filters[filter.field] = value;
  }

  const ordering: FieldOrdering[] = [];
  if (query.sort) {
    const [field, direction] = query.sort.split(":");
    if (field && collection.listDisplay.includes(field)) {
      ordering.push({ field, direction: direction === "desc" ? "desc" : "asc" });
    }
  }

  return {
    // One instant for the whole request, so the rows and their total resolve a
    // relative filter to the same window.
    now: new Date(),
    page: toPositiveInt(query.page),
    pageSize: toPositiveInt(query.pageSize),
    search: query.q?.trim() || undefined,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    ordering: ordering.length > 0 ? ordering : undefined,
  };
}
