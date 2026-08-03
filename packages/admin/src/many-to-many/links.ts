import type { ManyToManySummary } from "@comp/core";

/**
 * Ids arrive as numbers from the database and as strings from a form control,
 * and both stand for the same link. Comparison is therefore on the text, once,
 * here — rather than at each call site, where one `===` would quietly leave a
 * checkbox unticked next to a link that exists.
 */
export function isLinked(links: readonly unknown[], id: unknown): boolean {
  const key = String(id);
  return links.some((entry) => String(entry) === key);
}

/** The set with this id added or removed — what a checkbox click means. */
export function toggleLink(links: readonly unknown[], id: unknown): unknown[] {
  return isLinked(links, id)
    ? links.filter((entry) => String(entry) !== String(id))
    : [...links, id];
}

/** Whether a set differs from the one the server sent, ignoring order. */
export function linksChanged(
  before: readonly unknown[],
  after: readonly unknown[],
): boolean {
  if (before.length !== after.length) return true;
  const seen = new Set(before.map(String));
  return after.some((entry) => !seen.has(String(entry)));
}

/**
 * The link sets to send with a write: only the relationships whose membership
 * actually moved.
 *
 * Omission is meaningful — the server leaves a relationship it was not told
 * about alone — so sending every set on every save would turn an unrelated
 * edit into a rewrite of every join row the form happened to have loaded.
 */
export function changedLinks(
  relations: readonly ManyToManySummary[],
  before: Record<string, unknown[]>,
  after: Record<string, unknown[]>,
): Record<string, unknown[]> {
  const payload: Record<string, unknown[]> = {};
  for (const relation of relations) {
    const next = after[relation.name];
    if (!next) continue;
    if (linksChanged(before[relation.name] ?? [], next)) {
      payload[relation.name] = next;
    }
  }
  return payload;
}
