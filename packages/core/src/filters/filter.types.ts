/**
 * What a field offers the person filtering. Django picks a `FieldListFilter`
 * subclass from the field's type and renders the choices it implies; the kind
 * is that decision, made once from the introspected schema.
 */
export type FilterKind =
  | "exact"
  | "choices"
  | "boolean"
  | "date"
  | "relation";

/** One ready-made choice, for kinds that enumerate their values. */
export interface FilterOption {
  value: string;
  label: string;
}

/** A named date window, resolved against "now" at query time. */
export type DatePreset = "today" | "past7" | "month" | "year";

export interface ResolvedFilter {
  field: string;
  kind: FilterKind;
  /** Choices for `choices`/`boolean`; empty for kinds that fetch their own. */
  options: FilterOption[];
  /** Whether the column can be null — an empty/not-empty choice is offered. */
  nullable: boolean;
  /** For `relation`: the referenced table, bound to a collection downstream. */
  table?: string;
}

/**
 * A resolved filter as a client sees it: a `relation` also carries the
 * collection its options come from, so the UI fetches them the same way a
 * relation widget does — it is never told which collection by the app.
 */
export interface FilterSummary extends ResolvedFilter {
  collection?: string;
  /** Field on that collection the key points at — the option's value. */
  targetField?: string;
  labelField?: string | null;
}

/** Authoring form: a bare field name infers its kind, or state it. */
export type FilterConfig<TField extends string = string> =
  | TField
  | {
      field: TField;
      /** Override the kind inferred from the column's type. */
      kind?: FilterKind;
    };

/**
 * A filter's value on the wire and in the query layer: an operation, not a
 * bare scalar. This is the point of the whole layer — `status=draft` and
 * "placed this month" and "has no customer" are different questions, and the
 * query builder can only tell them apart if the value says which one it is.
 */
export type FilterValue =
  | { op: "exact"; value: unknown }
  | { op: "in"; values: unknown[] }
  | { op: "isnull"; value: boolean }
  | { op: "range"; from?: unknown; to?: unknown }
  | { op: "preset"; preset: DatePreset };

export type FilterMap = Record<string, FilterValue>;
