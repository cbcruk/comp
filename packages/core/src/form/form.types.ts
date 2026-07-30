/**
 * A field, or several to sit on one line. Django's `fields` uses a nested tuple
 * for exactly this — grouping is part of the layout, not of the fields.
 */
export type FormFieldEntry<TField extends string = string> = TField | TField[];

export interface FieldsetConfig<TField extends string = string> {
  /** Heading for the group; omit for an unnamed opening group. */
  title?: string;
  fields: FormFieldEntry<TField>[];
  /** Explanatory text under the heading. */
  description?: string;
  /** Start folded — for a group that is rarely the reason you opened the form. */
  collapsed?: boolean;
}

export interface ResolvedFieldset {
  title: string | null;
  description: string | null;
  collapsed: boolean;
  /** Fields per line; a single field is a row of one. */
  rows: string[][];
}

/**
 * A collection's change/add form as a layout rather than a field list: which
 * fields, grouped how, which are shown but not writable, which are filled in
 * from others, and which render as radios.
 *
 * Resolved once at declaration time and serializable, so the UI renders it and
 * the write path enforces it from the same value.
 */
export interface ResolvedForm {
  fieldsets: ResolvedFieldset[];
  /** Shown, never written — the write path strips these. */
  readonly: string[];
  /** Target field → the fields it is derived from, in order. */
  prepopulated: Record<string, string[]>;
  /** Rendered as a radio group instead of a select. */
  radio: string[];
}

/** Every field the form actually contains, flattened in layout order. */
export function formFields(form: ResolvedForm): string[] {
  return form.fieldsets.flatMap((fieldset) => fieldset.rows.flat());
}

/** Fields the form will accept a value for. */
export function writableFields(form: ResolvedForm): string[] {
  const readonly = new Set(form.readonly);
  return formFields(form).filter((field) => !readonly.has(field));
}
