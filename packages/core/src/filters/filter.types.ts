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
  | "relation"
  | "values";

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
  /** For `values`: how many distinct values to offer before saying "more". */
  limit?: number;
}

/**
 * The values a `values` filter found in its column, resolved per request
 * because only the data knows them. Kept out of {@link ResolvedFilter}, which
 * is static and serializable at declaration time.
 */
export interface FilterChoices {
  field: string;
  /** Values present in the column, each encoded as the query value it stands for. */
  options: FilterOption[];
  /**
   * The column holds more distinct values than the filter's limit, so the list
   * is a prefix. Said out loud rather than silently cut — a filter that quietly
   * omits values is one that quietly hides records.
   */
  truncated: boolean;
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
      /**
       * For `kind: "values"`: how many distinct values to offer. The list is
       * read from the data on every request, so this is the ceiling on what
       * that costs and on how long the control gets.
       */
      limit?: number;
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
