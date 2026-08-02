import type { ResolvedSearch } from "@comp/core";
import type { CollectionSummary } from "../client/create-client.types.js";

/** How one search field reads to a person: `name`, `name (starts with)`. */
export function describeSearchField(spec: ResolvedSearch): string {
  const name = spec.through ? `${spec.field} → ${spec.through.field}` : spec.field;
  switch (spec.lookup) {
    case "startswith":
      return `${name} (starts with)`;
    case "exact":
      return `${name} (exact)`;
    default:
      return name;
  }
}

/**
 * Say what the box actually searches. The declaration knows which fields and
 * how, so a user does not have to guess why a query matched — or why it didn't.
 */
export function searchPlaceholder(
  collection: Pick<CollectionSummary, "labelPlural" | "search">,
): string {
  if (collection.search.length === 0) return `Search ${collection.labelPlural}`;
  return `Search ${collection.search.map(describeSearchField).join(", ")}`;
}
