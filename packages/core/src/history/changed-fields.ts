import type { Collection } from "../collection/define-collection.types.js";

function sameValue(before: unknown, after: unknown): boolean {
  if (before === after) return true;
  if (before instanceof Date && after instanceof Date) {
    return before.getTime() === after.getTime();
  }
  // A column that was null and came back undefined, or the reverse, did not
  // change — only the shape of "absent" did.
  if (before == null && after == null) return true;
  return false;
}

/**
 * Which fields a write actually changed.
 *
 * A request that sends the whole record back is the normal case for a form, so
 * comparing what was sent is not the same as reporting what changed — "edited
 * every field" is a useless history entry. Only the columns whose value moved
 * are recorded, which is what Django's change message lists.
 */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  for (const [field, value] of Object.entries(after)) {
    if (!sameValue(before[field], value)) changed.push(field);
  }
  return changed;
}

/**
 * What a record is called in a history entry.
 *
 * Read at the time of the change, because that is the only moment it is
 * knowable: after a delete the row is gone, and after a rename the old entries
 * should still say what the record was called when they were written.
 */
export function historyLabel(
  collection: Collection,
  record: Record<string, unknown> | undefined,
  recordId: string,
): string {
  const value = collection.labelField ? record?.[collection.labelField] : null;
  return value === null || value === undefined || value === ""
    ? `${collection.label} ${recordId}`
    : String(value);
}

/** A history entry as a sentence. */
export function describeHistory(entry: {
  action: string;
  label: string;
  fields: string[];
  actor: string | null;
}): string {
  const who = entry.actor ?? "someone";
  switch (entry.action) {
    case "create":
      return `${who} added ${entry.label}`;
    case "delete":
      return `${who} deleted ${entry.label}`;
    default:
      return entry.fields.length > 0
        ? `${who} changed ${entry.fields.join(", ")} on ${entry.label}`
        : `${who} saved ${entry.label} without changing anything`;
  }
}
