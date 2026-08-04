import { getTableName, type Table } from "drizzle-orm";
import type { Collection } from "../collection/define-collection.types.js";
import { introspectTable } from "../introspection/introspect-table.js";
import type { FieldMap } from "../introspection/introspect-table.types.js";
import type {
  ManyToManyConfig,
  ManyToManyMeta,
  ManyToManySpec,
  ManyToManySummary,
} from "./m2m.types.js";

/** The join table's foreign keys pointing at one table, as field names. */
function keysTo(fields: FieldMap, table: string): string[] {
  return Object.values(fields)
    .filter((field) => field.relation?.table === table)
    .map((field) => field.name);
}

function pick(
  candidates: string[],
  named: string | undefined,
  describe: () => string,
): string {
  if (named) {
    if (!candidates.includes(named)) {
      throw new Error(`${describe()} has no foreign key "${named}"`);
    }
    return named;
  }
  if (candidates.length === 0) {
    throw new Error(`${describe()} has no foreign key to it`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `${describe()} is ambiguous (${candidates.join(", ")}); name one`,
    );
  }
  return candidates[0]!;
}

/** The field on `fields` whose column the join key points at. */
function targetOf(joinFields: FieldMap, key: string): string {
  const relation = joinFields[key]?.relation;
  if (!relation) throw new Error(`"${key}" is not a foreign key`);
  return relation.column;
}

function fieldForColumn(fields: FieldMap, columnName: string): string | null {
  for (const field of Object.values(fields)) {
    if (field.columnName === columnName) return field.name;
  }
  return null;
}

/**
 * Resolve one declared many-to-many against the join table.
 *
 * This runs at declaration time, on the collection alone, because everything
 * it decides is knowable there: the join table's keys say which side is which.
 * The far *collection* is bound later, over the registry — the same split the
 * relation graph makes between a column's foreign key and which collection
 * owns the table it points at.
 *
 * A join table that does not reach both sides, or reaches one of them twice
 * without being told which key to use, throws here rather than producing a
 * widget that silently edits the wrong column.
 */
export function resolveManyToMany(
  slug: string,
  model: Table,
  config: ManyToManyConfig,
): ManyToManyMeta {
  const here = getTableName(model);
  const through = introspectTable(config.through);
  const name = config.name ?? config.collection;
  const describe = (side: string): string =>
    `manyToMany "${name}" on "${slug}": join table ` +
    `"${getTableName(config.through)}" ${side}`;

  const field = pick(
    keysTo(through.fields, here),
    config.field,
    () => describe(`→ "${here}"`),
  );

  // The far side is whatever is left. Named explicitly when a table joins to
  // itself, where "the other one" is not a distinguishing description.
  const targetCandidates = Object.values(through.fields)
    .filter((entry) => entry.relation && entry.name !== field)
    .map((entry) => entry.name);
  const targetField = pick(
    targetCandidates,
    config.targetField,
    () => describe("→ the other side"),
  );

  const targetTable = through.fields[targetField]?.relation?.table;
  if (!targetTable) {
    throw new Error(`${describe("→ the other side")} is not a foreign key`);
  }

  const parentColumn = targetOf(through.fields, field);
  const parentKey = fieldForColumn(introspectTable(model).fields, parentColumn);
  if (!parentKey) {
    throw new Error(`${describe(`→ "${here}"`)} points at no column here`);
  }

  return {
    name,
    collection: config.collection,
    table: targetTable,
    through: config.through,
    field,
    parentKey,
    targetField,
    // A column name until the registry can turn it into the far collection's
    // field name; `bindManyToMany` does that.
    targetKey: targetOf(through.fields, targetField),
    filter: config.filter ?? false,
  };
}

/**
 * Bind each collection's many-to-many declarations to the collections on the
 * far side — which one manages that table is a fact about the registry, not
 * about either table.
 *
 * A relationship whose far side no collection manages is dropped rather than
 * throwing: it is the same situation as a foreign key pointing outside the
 * admin, and there is nothing to offer as choices. A declaration that names a
 * *different* collection than the join table reaches does throw — that is a
 * typo with a working-looking widget on the other end of it.
 */
export function bindManyToMany(
  collections: Collection[],
): Map<string, ManyToManySpec[]> {
  const byTable = new Map<string, Collection>();
  for (const collection of collections) {
    byTable.set(getTableName(collection.model), collection);
  }

  const resolved = new Map<string, ManyToManySpec[]>();
  for (const collection of collections) {
    const specs: ManyToManySpec[] = [];
    for (const meta of collection.manyToMany) {
      const target = byTable.get(meta.table);
      if (!target) continue;
      if (target.slug !== meta.collection) {
        throw new Error(
          `manyToMany "${meta.name}" on "${collection.slug}" names ` +
            `"${meta.collection}", but its join table reaches "${target.slug}"`,
        );
      }

      const targetKey = fieldForColumn(target.fields, meta.targetKey);
      if (!targetKey) continue;

      specs.push({ ...meta, targetKey, target });
    }
    resolved.set(collection.slug, specs);
  }
  return resolved;
}

/** Strip a relationship down to what a client or tool schema can consume. */
export function manyToManySummary(spec: ManyToManySpec): ManyToManySummary {
  return {
    name: spec.name,
    collection: spec.target.slug,
    targetKey: spec.targetKey,
    labelField: spec.target.labelField,
  };
}
