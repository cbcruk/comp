import type { Row } from "../client/create-client.types.js";

/**
 * Merge `patch` into rows matching `predicate`, returning a new array (never
 * mutates). Used for optimistic local updates before the server confirms.
 */
export function applyPatch(
  rows: Row[],
  predicate: (row: Row) => boolean,
  patch: Row,
): Row[] {
  return rows.map((row) => (predicate(row) ? { ...row, ...patch } : row));
}
