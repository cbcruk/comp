import type { FieldMap } from "../introspection/introspect-table.types.js";
import type { ResolvedSearch, SearchLookup } from "./search.types.js";

const PREFIX: Record<string, SearchLookup> = {
  "^": "startswith",
  "=": "exact",
};

/** Split `field__other` into the key and the field on the far side. */
function splitTraversal(name: string): [string, string | undefined] {
  const at = name.indexOf("__");
  return at === -1
    ? [name, undefined]
    : [name.slice(0, at), name.slice(at + 2)];
}

/**
 * Resolve a collection's declared search fields.
 *
 * Each entry names a column and, through its prefix, how that column is
 * matched. `field__other` follows the foreign key held in `field` — the target
 * table comes from the schema, so a traversal names a column that exists rather
 * than a relation the app had to describe.
 *
 * A name that is not a column, or a traversal through something that is not a
 * foreign key, throws here rather than quietly searching one field fewer.
 */
export function resolveSearch(
  slug: string,
  fields: FieldMap,
  configs: readonly string[],
): ResolvedSearch[] {
  const resolved: ResolvedSearch[] = [];

  for (const config of configs) {
    const lookup = PREFIX[config.charAt(0)] ?? "contains";
    const name = lookup === "contains" ? config : config.slice(1);
    const [key, target] = splitTraversal(name);

    const field = fields[key];
    if (!field) {
      throw new Error(
        `Search on "${slug}" names "${key}", which is not a column`,
      );
    }

    if (target === undefined) {
      resolved.push({ field: key, lookup });
      continue;
    }

    if (!field.relation) {
      throw new Error(
        `Search on "${slug}" traverses "${key}", which is not a foreign key`,
      );
    }
    resolved.push({
      field: key,
      lookup,
      through: { table: field.relation.table, field: target },
    });
  }

  return resolved;
}

/**
 * Split a query into terms, keeping a quoted phrase whole.
 *
 * Django splits the search box the same way and requires every term to match
 * something, which is what makes typing more words narrow the list instead of
 * widening it — the behavior people expect from a search box and the opposite
 * of matching the whole string as one substring.
 */
export function splitSearchTerms(query: string): string[] {
  const terms: string[] = [];
  let current = "";
  let quoted = false;

  for (const character of query) {
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && /\s/.test(character)) {
      if (current !== "") terms.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current !== "") terms.push(current);

  return terms;
}
