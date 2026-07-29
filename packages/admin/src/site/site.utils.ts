import type { CollectionOperation, DeleteImpact } from "@comp/core";
import type { CollectionSummary } from "../client/create-client.types.js";

/**
 * Whether a screen should exist for this caller. The server already narrowed
 * the manifest by permission, so the UI asks the summary rather than guessing
 * — a button that leads to a 403 is a bug, not a detail.
 */
export function can(
  collection: CollectionSummary,
  operation: CollectionOperation,
): boolean {
  return collection.permitted.includes(operation);
}

/** The label for a record: its label field if there is one, else its key. */
export function recordTitle(
  collection: CollectionSummary,
  record: Record<string, unknown> | null,
  id: string,
): string {
  const value = collection.labelField ? record?.[collection.labelField] : null;
  return value === null || value === undefined || value === ""
    ? `${collection.label} ${id}`
    : String(value);
}

export interface ImpactLine {
  collection: string;
  text: string;
  /** True when this line is why the delete cannot go ahead. */
  blocking: boolean;
}

/**
 * Put a delete's consequences into sentences. Django's confirmation page shows
 * what goes with the record and refuses when something protects it; this is
 * the same three answers — also deleted, left without a link, or in the way —
 * derived from what each foreign key actually says.
 */
export function describeImpact(impact: DeleteImpact): ImpactLine[] {
  return impact.related.map((entry) => {
    const rows = `${String(entry.count)} ${entry.collection}`;
    switch (entry.effect) {
      case "cascade":
        return {
          collection: entry.collection,
          text: `${rows} will be deleted with it`,
          blocking: false,
        };
      case "clear":
        return {
          collection: entry.collection,
          text: `${rows} will lose their ${entry.field}`,
          blocking: false,
        };
      case "block":
        return {
          collection: entry.collection,
          text: `${rows} still reference this record, so the delete will be refused`,
          blocking: true,
        };
    }
  });
}

/** One line summarizing the whole delete, for a heading. */
export function summarizeImpact(impact: DeleteImpact): string {
  if (impact.blocked) return "This record cannot be deleted yet.";
  if (impact.cascades > 0) {
    return `This will also delete ${String(impact.cascades)} related record${
      impact.cascades === 1 ? "" : "s"
    }.`;
  }
  return "Nothing else references this record.";
}
