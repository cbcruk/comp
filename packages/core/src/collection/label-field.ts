import type { FieldMap } from "../introspection/introspect-table.types.js";

/**
 * Pick the field that stands in for a whole record when it is referenced from
 * somewhere else — the label shown in an FK cell or a relation select.
 *
 * Django solves this with `__str__` on the model, i.e. the model itself owns
 * its human-readable form. Comp has no model class to hang that on, so the
 * behavior is re-derived from what a collection already declares: the first
 * thing the author chose to show in the list is, in practice, what identifies
 * the record. Order of preference:
 *
 * 1. the first non-primary-key `listDisplay` field holding text,
 * 2. failing that, the first non-primary-key `listDisplay` field,
 * 3. failing that, the primary key (an id is a poor label but never wrong).
 *
 * Authors override it explicitly with `labelField` when the guess is wrong.
 */
export function resolveLabelField(
  fields: FieldMap,
  listDisplay: readonly string[],
  primaryKey: string | null,
): string | null {
  const candidates = listDisplay.filter((name) => {
    const field = fields[name];
    return Boolean(field) && name !== primaryKey && !field?.primaryKey;
  });

  const textual = candidates.find(
    (name) => fields[name]?.dataType === "string",
  );
  return textual ?? candidates[0] ?? primaryKey;
}
