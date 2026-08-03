import type { FieldMap, FieldMeta } from "../introspection/introspect-table.types.js";
import type { ManyToManyMeta } from "../m2m/m2m.types.js";
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
  // options from the target collection; `values` reads them off the data per
  // request; `exact` has no fixed set.
  return [];
}

function normalize(config: FilterConfig): {
  field: string;
  kind?: FilterKind;
  limit?: number;
} {
  return typeof config === "string" ? { field: config } : config;
}

/** How many distinct values a `values` filter offers before saying "more". */
export const DEFAULT_VALUES_LIMIT = 100;

/**
 * A `values` filter reads its choices from the data on every request, so it is
 * only ever declared, never inferred — the cost belongs to whoever asked for
 * it. The two columns that already know their own answers are refused here,
 * at declaration time, rather than issuing a query whose result is worse than
 * what they offer: a date's values are one per row, and a foreign key's are
 * opaque ids the relation filter already resolves to labels.
 */
function checkValuesKind(name: string, field: FieldMeta): void {
  if (field.dataType === "date") {
    throw new Error(
      `Filter "${name}": a date column cannot list its values — use the date ` +
        `filter (its named windows) or dateHierarchy`,
    );
  }
  if (field.relation) {
    throw new Error(
      `Filter "${name}": a foreign key cannot list its values — the relation ` +
        `filter offers the records it points at, with their labels`,
    );
  }
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
  manyToMany: ManyToManyMeta[] = [],
): ResolvedFilter[] {
  const resolved: ResolvedFilter[] = [];
  const byName = new Map(manyToMany.map((meta) => [meta.name, meta]));

  for (const config of configs) {
    const { field: name, kind: override, limit } = normalize(config);

    // A many-to-many is filterable by name, not by column — there is no column
    // to read, which is the whole reason it needed the join table.
    const link = byName.get(name);
    if (link) {
      resolved.push({
        field: name,
        kind: "m2m",
        options: [],
        // "Empty" reads as "linked to nothing", which is a question worth
        // being able to ask of any relationship.
        nullable: true,
        table: link.table,
      });
      continue;
    }

    const field = fields[name];
    if (!field) continue;

    const kind = override ?? inferFilterKind(field);
    if (kind === "values") checkValuesKind(name, field);
    resolved.push({
      field: name,
      kind,
      options: optionsFor(field, kind),
      nullable: !field.notNull,
      ...(kind === "relation" && field.relation
        ? { table: field.relation.table }
        : {}),
      ...(kind === "values"
        ? { limit: Math.max(1, limit ?? DEFAULT_VALUES_LIMIT) }
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
  manyToMany: readonly {
    name: string;
    collection: string;
    targetKey: string;
    labelField: string | null;
  }[] = [],
): FilterSummary[] {
  return filters.map((filter) => {
    if (filter.kind === "m2m") {
      // Its choices are the far collection's records, fetched the way a
      // relation filter's are — the UI is told which collection, never the app.
      const link = manyToMany.find((entry) => entry.name === filter.field);
      if (!link) return { ...filter, kind: "exact", options: [] };
      return {
        ...filter,
        collection: link.collection,
        targetField: link.targetKey,
        labelField: link.labelField,
      };
    }
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
