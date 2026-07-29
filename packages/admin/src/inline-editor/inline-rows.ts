import type { FieldMap, InlineWrite } from "@comp/core";
import type { Row } from "../client/create-client.types.js";
import {
  editableFields,
  initialValues,
  toPayload,
} from "../collection-form/collection-form.utils.js";

export interface InlineRow {
  /** Stable identity for rendering and editing — not the record's key. */
  key: string;
  /** Primary key of a stored row; null for one added but not yet saved. */
  id: unknown | null;
  /** Controlled input values, as strings, like the record form uses. */
  values: Record<string, string>;
  /** Marked for removal on the next save. */
  deleted: boolean;
  /** Edited since it was loaded. */
  dirty: boolean;
}

/** Fields an inline row's editor shows: not the key, not the parent link. */
export function inlineFields(
  fields: FieldMap,
  primaryKey: string | null,
  parentField: string,
): ReturnType<typeof editableFields> {
  return editableFields(fields, primaryKey).filter(
    (field) => field.name !== parentField,
  );
}

/** Seed editable state from the rows the server returned. */
export function inlineRowsFrom(
  rows: Row[],
  fields: FieldMap,
  primaryKey: string | null,
  parentField: string,
): InlineRow[] {
  const editable = inlineFields(fields, primaryKey, parentField);
  return rows.map((row, index) => ({
    key: `saved-${String(primaryKey ? row[primaryKey] : index)}`,
    id: primaryKey ? (row[primaryKey] ?? null) : null,
    values: initialValues(editable, row),
    deleted: false,
    dirty: false,
  }));
}

/**
 * Append a blank row. The key comes from the caller so this stays pure and the
 * state is reproducible in tests; a component passes a counter.
 */
export function addInlineRow(
  state: InlineRow[],
  key: string,
  fields: FieldMap,
  primaryKey: string | null,
  parentField: string,
): InlineRow[] {
  const editable = inlineFields(fields, primaryKey, parentField);
  return [
    ...state,
    {
      key,
      id: null,
      values: initialValues(editable),
      deleted: false,
      dirty: true,
    },
  ];
}

/** Edit one cell, marking its row dirty. */
export function setInlineValue(
  state: InlineRow[],
  key: string,
  field: string,
  value: string,
): InlineRow[] {
  return state.map((row) =>
    row.key === key
      ? { ...row, values: { ...row.values, [field]: value }, dirty: true }
      : row,
  );
}

/**
 * Remove a row. A row that was never saved simply disappears; a stored one is
 * flagged so the save can delete it and the user can change their mind first —
 * the same two-step Django's formsets give a delete checkbox.
 */
export function removeInlineRow(state: InlineRow[], key: string): InlineRow[] {
  return state.flatMap((row) => {
    if (row.key !== key) return [row];
    if (row.id === null) return [];
    return [{ ...row, deleted: true }];
  });
}

/** Undo a pending removal. */
export function restoreInlineRow(state: InlineRow[], key: string): InlineRow[] {
  return state.map((row) =>
    row.key === key ? { ...row, deleted: false } : row,
  );
}

/**
 * Turn the edited rows into the write the API takes: new rows create, touched
 * stored rows update, flagged stored rows delete. Untouched rows are left out
 * entirely — a save sends what changed, not the whole table.
 */
export function toInlineWrite(
  state: InlineRow[],
  fields: FieldMap,
  primaryKey: string | null,
  parentField: string,
): InlineWrite {
  const editable = inlineFields(fields, primaryKey, parentField);
  const write: InlineWrite = {};

  const create = state
    .filter((row) => row.id === null && !row.deleted)
    .map((row) => toPayload(editable, row.values));
  if (create.length > 0) write.create = create;

  const update = state
    .filter((row) => row.id !== null && row.dirty && !row.deleted)
    .map((row) => ({ id: row.id, values: toPayload(editable, row.values) }));
  if (update.length > 0) write.update = update;

  const remove = state
    .filter((row) => row.id !== null && row.deleted)
    .map((row) => row.id);
  if (remove.length > 0) write.delete = remove;

  return write;
}

/** True when a save would send anything for this inline. */
export function hasInlineChanges(write: InlineWrite): boolean {
  return Boolean(write.create ?? write.update ?? write.delete);
}
