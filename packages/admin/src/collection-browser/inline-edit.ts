import type { FieldMap } from "@comp/core";

export interface EditingCell {
  id: string;
  field: string;
}

/** Whether the cell at (id, field) is the one currently being edited. */
export function isEditing(
  editing: EditingCell | null,
  id: string,
  field: string,
): boolean {
  return editing !== null && editing.id === id && editing.field === field;
}

/**
 * A column is inline-editable when it maps to a known field and is not the
 * auto-managed primary key.
 */
export function canEditColumn(
  fields: FieldMap,
  primaryKey: string | null,
  column: string,
): boolean {
  return column in fields && column !== primaryKey;
}
