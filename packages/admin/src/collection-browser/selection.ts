import type { Id, Row } from "../client/create-client.types.js";

/** Read a row's id via the collection's primary key, as a string key. */
export function rowId(row: Row, primaryKey: string | null): string | null {
  if (primaryKey === null) return null;
  const value = row[primaryKey];
  if (value === null || value === undefined) return null;
  return String(value);
}

/** Toggle an id in a selection set, returning a new set (never mutates). */
export function toggle(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/** Whether every visible row's id is currently selected. */
export function allSelected(
  rows: Row[],
  primaryKey: string | null,
  selected: ReadonlySet<string>,
): boolean {
  const ids = rows
    .map((row) => rowId(row, primaryKey))
    .filter((id): id is string => id !== null);
  return ids.length > 0 && ids.every((id) => selected.has(id));
}

/** Select all visible rows, or clear them if all are already selected. */
export function toggleAll(
  rows: Row[],
  primaryKey: string | null,
  selected: ReadonlySet<string>,
): Set<string> {
  if (allSelected(rows, primaryKey, selected)) return new Set();
  const next = new Set(selected);
  for (const row of rows) {
    const id = rowId(row, primaryKey);
    if (id !== null) next.add(id);
  }
  return next;
}

/** Selected string ids back as the original id type for the API call. */
export function toIds(selected: ReadonlySet<string>): Id[] {
  return [...selected];
}
