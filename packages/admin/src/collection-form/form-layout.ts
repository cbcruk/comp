import type { FieldMap, FieldMeta, ResolvedForm } from "@comp/core";

/** A field with everything the renderer needs to draw its control. */
export interface LayoutField {
  field: FieldMeta;
  readonly: boolean;
  radio: boolean;
}

export interface LayoutRow {
  fields: LayoutField[];
}

export interface LayoutGroup {
  title: string | null;
  description: string | null;
  collapsed: boolean;
  rows: LayoutRow[];
}

/**
 * A flat layout — one unnamed group, every editable field, one per line. This
 * is what a form falls back to when no layout was served, so `CollectionForm`
 * keeps working for a caller that only has a field map.
 */
export function flatLayout(
  fields: FieldMap,
  primaryKey: string | null,
): LayoutGroup[] {
  const rows = Object.values(fields)
    .filter((field) => field.name !== primaryKey)
    .map((field) => ({ fields: [{ field, readonly: false, radio: false }] }));
  return rows.length > 0
    ? [{ title: null, description: null, collapsed: false, rows }]
    : [];
}

/**
 * Bind a resolved form layout to the field metadata it refers to.
 *
 * The layout is field *names* — that is what makes it serializable and the same
 * value on every surface. Pairing them with their columns is the last step
 * before rendering, and it drops a name the field map does not have rather than
 * rendering a control for a column that isn't there.
 */
export function bindLayout(
  form: ResolvedForm,
  fields: FieldMap,
): LayoutGroup[] {
  const readonly = new Set(form.readonly);
  const radio = new Set(form.radio);

  return form.fieldsets
    .map((fieldset) => ({
      title: fieldset.title,
      description: fieldset.description,
      collapsed: fieldset.collapsed,
      rows: fieldset.rows
        .map((row) => ({
          fields: row
            .map((name) => fields[name])
            .filter((field): field is FieldMeta => Boolean(field))
            .map((field) => ({
              field,
              readonly: readonly.has(field.name),
              radio: radio.has(field.name),
            })),
        }))
        .filter((row) => row.fields.length > 0),
    }))
    .filter((group) => group.rows.length > 0);
}

/** Every field the layout renders, in order. */
export function layoutFields(groups: LayoutGroup[]): FieldMeta[] {
  return groups.flatMap((group) =>
    group.rows.flatMap((row) => row.fields.map((entry) => entry.field)),
  );
}

/** Fields the form will submit — readonly ones are displayed, never sent. */
export function submittableFields(groups: LayoutGroup[]): FieldMeta[] {
  return groups.flatMap((group) =>
    group.rows.flatMap((row) =>
      row.fields.filter((entry) => !entry.readonly).map((entry) => entry.field),
    ),
  );
}
