import type { Collection } from "../collection/define-collection.types.js";
import type { ReferentialAction } from "../introspection/introspect-table.types.js";
import type { SqliteDb } from "../query/build-list-query.js";
import { buildReferenceCountQuery } from "../query/build-relation-query.js";
import { resolveRelations } from "../relations/resolve-relations.js";

/** A collection whose foreign key points at the record being deleted. */
export interface DeleteRelation {
  collection: Collection;
  /** FK field on that collection. */
  field: string;
  /** Field on the record being deleted that the key points at. */
  targetField: string;
  onDelete?: ReferentialAction;
}

/**
 * What the database does to the referencing rows.
 *
 * `block` is the honest answer for a key that says nothing: SQL's default is to
 * refuse the delete. Where foreign keys are not enforced the rows are left
 * pointing at nothing instead — which is worth warning about either way.
 */
export type DeleteEffect = "cascade" | "clear" | "block";

export interface DeleteImpactEntry {
  collection: string;
  field: string;
  count: number;
  effect: DeleteEffect;
}

export interface DeleteImpact {
  collection: string;
  id: unknown;
  /** Rows that reference this record, per collection; zero counts omitted. */
  related: DeleteImpactEntry[];
  /** Rows that would go with it. */
  cascades: number;
  /** True when a key would refuse the delete. */
  blocked: boolean;
}

function effectOf(onDelete: ReferentialAction | undefined): DeleteEffect {
  switch (onDelete) {
    case "cascade":
      return "cascade";
    case "set null":
    case "set default":
      return "clear";
    default:
      return "block";
  }
}

/**
 * Bind each collection's inbound foreign keys to the collections that hold
 * them, so a delete can be described before it runs. Resolved once over the
 * registry, like the relation graph it reads.
 */
export function resolveDeleteRelations(
  collections: Collection[],
): Map<string, DeleteRelation[]> {
  const bySlug = new Map(collections.map((c) => [c.slug, c]));
  const graph = resolveRelations(collections);
  const resolved = new Map<string, DeleteRelation[]>();

  for (const collection of collections) {
    const relations: DeleteRelation[] = [];
    for (const inbound of graph.inbound[collection.slug] ?? []) {
      const child = bySlug.get(inbound.collection);
      if (!child) continue;
      relations.push({
        collection: child,
        field: inbound.field,
        targetField: inbound.targetField,
        ...(inbound.onDelete ? { onDelete: inbound.onDelete } : {}),
      });
    }
    resolved.set(collection.slug, relations);
  }

  return resolved;
}

/**
 * Count what a delete would reach.
 *
 * Django's delete confirmation exists because a delete is rarely local: it
 * names the dependent objects that go with the record, and refuses outright
 * when something protects it. Comp already knows the shape — the inbound
 * relation graph says who points here, and the key itself says what happens to
 * them — so the confirmation is derived rather than written per collection.
 */
export async function collectDeleteImpact(
  db: SqliteDb,
  collection: Collection,
  record: Record<string, unknown>,
  relations: DeleteRelation[],
): Promise<DeleteImpact> {
  const related: DeleteImpactEntry[] = [];
  let cascades = 0;
  let blocked = false;

  for (const relation of relations) {
    const rows = await buildReferenceCountQuery(
      db,
      relation.collection,
      relation.field,
      record[relation.targetField],
    ).all();
    const count = rows[0]?.count ?? 0;
    if (count === 0) continue;

    const effect = effectOf(relation.onDelete);
    if (effect === "cascade") cascades += count;
    if (effect === "block") blocked = true;

    related.push({
      collection: relation.collection.slug,
      field: relation.field,
      count,
      effect,
    });
  }

  return {
    collection: collection.slug,
    id: collection.primaryKey ? record[collection.primaryKey] : null,
    related,
    cascades,
    blocked,
  };
}
