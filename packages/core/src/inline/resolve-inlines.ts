import type { Collection } from "../collection/define-collection.types.js";
import { resolveRelations } from "../relations/resolve-relations.js";
import type { InlineConfig, InlineSpec, InlineSummary } from "./inline.types.js";

function normalize(config: InlineConfig): {
  collection: string;
  field?: string;
  canDelete: boolean;
} {
  if (typeof config === "string") return { collection: config, canDelete: true };
  return {
    collection: config.collection,
    ...(config.field === undefined ? {} : { field: config.field }),
    canDelete: config.canDelete ?? true,
  };
}

/**
 * Resolve every collection's inlines against the relation graph.
 *
 * An inline names a child collection; which foreign key ties it to the parent
 * is a fact already in the schema, so it is looked up rather than declared —
 * and only stated explicitly when the child points at the parent twice and the
 * choice is genuinely ambiguous. Everything is checked here, once at startup:
 * an unknown child, a child with no key to this parent, or an ambiguous key
 * throws immediately rather than failing on a request.
 */
export function resolveInlines(
  collections: Collection[],
): Map<string, InlineSpec[]> {
  const bySlug = new Map(collections.map((c) => [c.slug, c]));
  const graph = resolveRelations(collections);
  const resolved = new Map<string, InlineSpec[]>();

  for (const parent of collections) {
    const specs: InlineSpec[] = [];
    const inbound = graph.inbound[parent.slug] ?? [];

    for (const config of parent.inlines) {
      const { collection: slug, field, canDelete } = normalize(config);
      const child = bySlug.get(slug);
      if (!child) {
        throw new Error(
          `Inline "${slug}" on "${parent.slug}" is not a registered collection`,
        );
      }

      const candidates = inbound.filter((r) => r.collection === slug);
      if (candidates.length === 0) {
        throw new Error(
          `Inline "${slug}" on "${parent.slug}" has no foreign key to it`,
        );
      }

      const relation = field
        ? candidates.find((r) => r.field === field)
        : candidates.length === 1
          ? candidates[0]
          : undefined;
      if (!relation) {
        throw new Error(
          field
            ? `Inline "${slug}" on "${parent.slug}" has no foreign key "${field}"`
            : `Inline "${slug}" on "${parent.slug}" is ambiguous (${candidates
                .map((r) => r.field)
                .join(", ")}); name one with { field }`,
        );
      }

      specs.push({
        collection: child,
        field: relation.field,
        targetField: relation.targetField,
        canDelete,
      });
    }

    resolved.set(parent.slug, specs);
  }

  return resolved;
}

/** Strip an inline down to what a client or tool schema can consume. */
export function inlineSummary(spec: InlineSpec): InlineSummary {
  return {
    collection: spec.collection.slug,
    field: spec.field,
    targetField: spec.targetField,
    canDelete: spec.canDelete,
  };
}
