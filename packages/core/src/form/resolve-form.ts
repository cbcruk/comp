import type { FieldMap } from "../introspection/introspect-table.types.js";
import type {
  FieldsetConfig,
  FormFieldEntry,
  ResolvedFieldset,
  ResolvedForm,
} from "./form.types.js";

export interface FormConfig<TField extends string = string> {
  /** Which fields, in what order; nest an array to put them on one line. */
  fields?: FormFieldEntry<TField>[];
  /** Fields to leave out, whatever else selected them. */
  exclude?: TField[];
  /** Grouped layout. Takes precedence over `fields`. */
  fieldsets?: FieldsetConfig<TField>[];
  /** Shown but never written. */
  readonlyFields?: TField[];
  /** Target field → fields it is derived from (a slug from a title). */
  prepopulated?: Record<string, TField[]>;
  /** Enum fields to render as radios rather than a select. */
  radioFields?: TField[];
}

function assertKnown(
  fields: FieldMap,
  names: readonly string[],
  where: string,
  slug: string,
): void {
  for (const name of names) {
    if (!fields[name]) {
      throw new Error(
        `Form ${where} on "${slug}" names "${name}", which is not a column`,
      );
    }
  }
}

function toRows(entries: FormFieldEntry[]): string[][] {
  return entries.map((entry) => (Array.isArray(entry) ? [...entry] : [entry]));
}

function withoutExcluded(rows: string[][], excluded: Set<string>): string[][] {
  return rows
    .map((row) => row.filter((field) => !excluded.has(field)))
    .filter((row) => row.length > 0);
}

/**
 * Resolve a collection's form layout.
 *
 * Django's default form is every editable field in model order, and `fields`,
 * `exclude` and `fieldsets` narrow, reorder, and group it from there —
 * `fieldsets` winning over `fields` when both are given. The primary key is
 * never in it: it is server-assigned on add and immutable on change.
 *
 * A name that is not a column throws here, at declaration time. A typo in a
 * layout otherwise costs you an input silently, which is the kind of mistake
 * you find in production.
 */
export function resolveForm(
  slug: string,
  fields: FieldMap,
  primaryKey: string | null,
  config: FormConfig = {},
): ResolvedForm {
  const excluded = new Set<string>(config.exclude ?? []);
  if (primaryKey) excluded.add(primaryKey);

  assertKnown(fields, config.exclude ?? [], "exclude", slug);
  assertKnown(fields, config.readonlyFields ?? [], "readonlyFields", slug);
  assertKnown(fields, config.radioFields ?? [], "radioFields", slug);

  let fieldsets: ResolvedFieldset[];
  if (config.fieldsets) {
    fieldsets = config.fieldsets.map((fieldset) => {
      const rows = toRows(fieldset.fields);
      assertKnown(fields, rows.flat(), "fieldsets", slug);
      return {
        title: fieldset.title ?? null,
        description: fieldset.description ?? null,
        collapsed: fieldset.collapsed ?? false,
        rows: withoutExcluded(rows, excluded),
      };
    });
    // A group emptied by `exclude` is not a group.
    fieldsets = fieldsets.filter((fieldset) => fieldset.rows.length > 0);
  } else {
    const rows = config.fields
      ? toRows(config.fields)
      : Object.keys(fields).map((name) => [name]);
    if (config.fields) assertKnown(fields, rows.flat(), "fields", slug);
    fieldsets = [
      {
        title: null,
        description: null,
        collapsed: false,
        rows: withoutExcluded(rows, excluded),
      },
    ].filter((fieldset) => fieldset.rows.length > 0);
  }

  const present = new Set(fieldsets.flatMap((fieldset) => fieldset.rows.flat()));
  const readonly = (config.readonlyFields ?? []).filter((name) =>
    present.has(name),
  );

  for (const name of readonly) {
    const field = fields[name];
    // Readonly means the write path drops the value, so a required column with
    // nothing to fall back on could never be added at all. Say so here rather
    // than on the first failed insert.
    if (field && field.notNull && !field.hasDefault && !field.primaryKey) {
      throw new Error(
        `Form readonlyFields on "${slug}" includes "${name}", which is required ` +
          `and has no default — a record could never be added`,
      );
    }
  }

  const prepopulated: Record<string, string[]> = {};
  for (const [target, sources] of Object.entries(config.prepopulated ?? {})) {
    assertKnown(fields, [target, ...sources], "prepopulated", slug);
    if (readonly.includes(target)) {
      throw new Error(
        `Form prepopulated on "${slug}" targets "${target}", which is readonly`,
      );
    }
    if (fields[target]?.dataType !== "string") {
      throw new Error(
        `Form prepopulated on "${slug}" targets "${target}", which is not text`,
      );
    }
    if (present.has(target)) prepopulated[target] = [...sources];
  }

  return {
    fieldsets,
    readonly,
    prepopulated,
    radio: (config.radioFields ?? []).filter((name) => present.has(name)),
  };
}

/**
 * Drop values for fields the form does not accept.
 *
 * This is what makes `readonlyFields` mean something: the UI hiding an input is
 * a presentation choice, and a request that names the field anyway would
 * otherwise write it. Silently dropping matches how Django's form simply has no
 * such field to clean.
 */
export function stripReadonly(
  form: ResolvedForm,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (form.readonly.length === 0) return values;
  const readonly = new Set(form.readonly);
  const kept: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(values)) {
    if (!readonly.has(field)) kept[field] = value;
  }
  return kept;
}
