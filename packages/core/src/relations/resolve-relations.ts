import { getTableName } from "drizzle-orm";
import type { Collection } from "../collection/define-collection.types.js";
import type { FieldMap } from "../introspection/introspect-table.types.js";
import type {
  InboundRelation,
  OutboundRelation,
  RelationGraph,
} from "./resolve-relations.types.js";

/** Find the field whose database column carries the given name. */
function fieldForColumn(fields: FieldMap, columnName: string): string | null {
  for (const field of Object.values(fields)) {
    if (field.columnName === columnName) return field.name;
  }
  return null;
}

/**
 * Resolve the relation graph over a set of collections.
 *
 * Introspection can only see one table at a time: it knows `posts.author_id`
 * points at `authors.id`, but not that a collection manages `authors`, and
 * never that anything points *back*. Both facts are properties of the registry,
 * so they are derived here, once, from the declarations — the same
 * "declare, then generate" move the query layer makes.
 *
 * Foreign keys whose target table no collection manages are dropped: there is
 * nothing to link to, and a dangling slug would break every consumer. Composite
 * keys are skipped too — they need a multi-column identity the query layer does
 * not have yet.
 */
export function resolveRelations(collections: Collection[]): RelationGraph {
  const byTable = new Map<string, Collection>();
  for (const collection of collections) {
    byTable.set(getTableName(collection.model), collection);
  }

  const outbound: Record<string, OutboundRelation[]> = {};
  const inbound: Record<string, InboundRelation[]> = {};
  for (const collection of collections) {
    outbound[collection.slug] = [];
    inbound[collection.slug] = [];
  }

  for (const collection of collections) {
    for (const field of Object.values(collection.fields)) {
      const relation = field.relation;
      if (!relation) continue;

      const target = byTable.get(relation.table);
      if (!target) continue;

      const targetField = fieldForColumn(target.fields, relation.column);
      if (!targetField) continue;

      outbound[collection.slug]?.push({
        field: field.name,
        collection: target.slug,
        targetField,
        labelField: target.labelField,
      });
      inbound[target.slug]?.push({
        collection: collection.slug,
        field: field.name,
        targetField,
      });
    }
  }

  return { outbound, inbound };
}
