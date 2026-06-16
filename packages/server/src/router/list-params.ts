import type { Collection, FieldOrdering, ListParams } from "@comp/core";

function toPositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Translate a request's query string into {@link ListParams}. Only the
 * collection's declared filter/search columns are honored, so the URL surface
 * can never reach a column the declaration didn't opt in to.
 */
export function parseListParams(
  collection: Collection,
  query: Record<string, string>,
): ListParams {
  const filters: Record<string, unknown> = {};
  for (const field of collection.filters) {
    const value = query[field];
    if (value !== undefined && value !== "") filters[field] = value;
  }

  const ordering: FieldOrdering[] = [];
  if (query.sort) {
    const [field, direction] = query.sort.split(":");
    if (field && collection.listDisplay.includes(field)) {
      ordering.push({ field, direction: direction === "desc" ? "desc" : "asc" });
    }
  }

  return {
    page: toPositiveInt(query.page),
    pageSize: toPositiveInt(query.pageSize),
    search: query.q?.trim() || undefined,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    ordering: ordering.length > 0 ? ordering : undefined,
  };
}
