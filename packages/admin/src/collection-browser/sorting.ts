export type SortDirection = "asc" | "desc";

export interface ParsedSort {
  field: string;
  direction: SortDirection;
}

/** Parse a `field:direction` sort string, or null when absent/malformed. */
export function parseSort(sort: string | undefined): ParsedSort | null {
  if (!sort) return null;
  const [field, direction] = sort.split(":");
  if (!field) return null;
  return { field, direction: direction === "desc" ? "desc" : "asc" };
}

/**
 * Next sort string when a column header is clicked, cycling
 * none → asc → desc → none. Returns undefined to clear sorting.
 */
export function nextSort(
  current: string | undefined,
  field: string,
): string | undefined {
  const parsed = parseSort(current);
  if (!parsed || parsed.field !== field) return `${field}:asc`;
  if (parsed.direction === "asc") return `${field}:desc`;
  return undefined;
}
