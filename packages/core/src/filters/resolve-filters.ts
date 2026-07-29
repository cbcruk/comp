import type { FieldMap, FieldMeta } from "../introspection/introspect-table.types.js";
import type {
  FilterConfig,
  FilterKind,
  FilterOption,
  FilterSummary,
  ResolvedFilter,
} from "./filter.types.js";

/**
 * Pick the kind a column implies. Django reads the field's type to choose a
 * filter class — an enum gets its choices, a boolean gets yes/no, a date gets
 * ranges, a foreign key gets the related records — and everything else falls
 * back to matching the value exactly. Same decision, re-derived from Drizzle's
 * column metadata.
 */
export function inferFilterKind(field: FieldMeta): FilterKind {
  if (field.enumValues && field.enumValues.length > 0) return "choices";
  if (field.relation) return "relation";
  switch (field.dataType) {
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    default:
      return "exact";
  }
}

function optionsFor(field: FieldMeta, kind: FilterKind): FilterOption[] {
  if (kind === "choices") {
    return (field.enumValues ?? []).map((value) => ({ value, label: value }));
  }
  if (kind === "boolean") {
    return [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ];
  }
  // `date` presets are named by the consumer; `relation` fetches its own
  // options from the target collection; `exact` has no fixed set.
  return [];
}

function normalize(config: FilterConfig): { field: string; kind?: FilterKind } {
  return typeof config === "string" ? { field: config } : config;
}

/**
 * Resolve a collection's declared filters against its fields. Done once, at
 * declaration time: the resolved list is serializable, so the UI renders the
 * right control and the query layer knows which operations a field accepts
 * without either re-deriving it.
 *
 * A filter naming a column the table does not have is dropped rather than
 * throwing — the column keys are already checked at authoring time, so this
 * only fires for a hand-built config.
 */
export function resolveFilters(
  fields: FieldMap,
  configs: FilterConfig[],
): ResolvedFilter[] {
  const resolved: ResolvedFilter[] = [];

  for (const config of configs) {
    const { field: name, kind: override } = normalize(config);
    const field = fields[name];
    if (!field) continue;

    const kind = override ?? inferFilterKind(field);
    resolved.push({
      field: name,
      kind,
      options: optionsFor(field, kind),
      nullable: !field.notNull,
      ...(kind === "relation" && field.relation
        ? { table: field.relation.table }
        : {}),
    });
  }

  return resolved;
}

/** The field names a collection filters on, for gating a request's params. */
export function filterFields(filters: ResolvedFilter[]): string[] {
  return filters.map((filter) => filter.field);
}

/**
 * A resolved filter with its relation bound to a collection. Which collection
 * manages a referenced table is a fact about the registry, not the column, so
 * it is merged in where the whole registry is known — the same split the
 * relation graph makes.
 */
export function filterSummaries(
  filters: ResolvedFilter[],
  outbound: readonly {
    field: string;
    collection: string;
    targetField: string;
    labelField: string | null;
  }[],
): FilterSummary[] {
  return filters.map((filter) => {
    if (filter.kind !== "relation") return filter;
    const relation = outbound.find((entry) => entry.field === filter.field);
    if (!relation) return { ...filter, kind: "exact", options: [] };
    return {
      ...filter,
      collection: relation.collection,
      targetField: relation.targetField,
      labelField: relation.labelField,
    };
  });
}
