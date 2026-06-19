import type { Row } from "../client/create-client.types.js";

export interface ReferenceConfig {
  /** Slug of the referenced collection. */
  collection: string;
  /** Field shown as the label. */
  labelField: string;
  /** FK target field. Defaults to "id". */
  valueField?: string;
}

/** Build a value→label map from a referenced collection's rows. */
export function buildLabelMap(
  rows: Row[],
  valueField: string,
  labelField: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const value = row[valueField];
    if (value === null || value === undefined) continue;
    const label = row[labelField];
    map.set(String(value), label === null || label === undefined ? String(value) : String(label));
  }
  return map;
}

/** Resolve a cell's display label via the column's map, or the fallback. */
export function resolveLabel(
  maps: Record<string, Map<string, string>>,
  column: string,
  value: unknown,
  fallback: string,
): string {
  const map = maps[column];
  if (!map || value === null || value === undefined) return fallback;
  return map.get(String(value)) ?? fallback;
}
