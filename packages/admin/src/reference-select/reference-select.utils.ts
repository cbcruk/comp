import type { Row } from "../client/create-client.types.js";

export interface ReferenceOption {
  value: string;
  label: string;
}

/**
 * Map fetched rows into select options. The value is the referenced row's id
 * field; the label falls back to the value when the label field is empty.
 */
export function toOptions(
  rows: Row[],
  valueField: string,
  labelField: string,
): ReferenceOption[] {
  const options: ReferenceOption[] = [];
  for (const row of rows) {
    const value = row[valueField];
    if (value === null || value === undefined) continue;
    const label = row[labelField];
    options.push({
      value: String(value),
      label: label === null || label === undefined ? String(value) : String(label),
    });
  }
  return options;
}
