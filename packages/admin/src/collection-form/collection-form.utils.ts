import type { FieldMap, FieldMeta } from "@comp/core";
import type { Row } from "../client/create-client.types.js";

export type InputType =
  | "text"
  | "number"
  | "checkbox"
  | "datetime-local"
  | "select";

/** Enum options for a field, or null when it is not an enum. */
export function optionsFor(field: FieldMeta): string[] | null {
  return field.enumValues && field.enumValues.length > 0
    ? field.enumValues
    : null;
}

/** Map a field's data type onto an HTML input type. */
export function inputTypeFor(field: FieldMeta): InputType {
  if (optionsFor(field)) return "select";
  switch (field.dataType) {
    case "number":
    case "bigint":
      return "number";
    case "boolean":
      return "checkbox";
    case "date":
      return "datetime-local";
    default:
      return "text";
  }
}

/**
 * Fields a user can edit, in declaration order. The auto-managed primary key
 * is excluded — it is server-assigned on create and immutable on edit.
 */
export function editableFields(
  fields: FieldMap,
  primaryKey: string | null,
): FieldMeta[] {
  return Object.values(fields).filter((field) => field.name !== primaryKey);
}

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** String value to seed a controlled input from an existing record. */
export function toInputValue(field: FieldMeta, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.dataType === "date") {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? "" : toLocalDateTimeInput(date);
  }
  if (field.dataType === "boolean") return value ? "true" : "";
  return String(value);
}

/** Coerce a raw input string back to the value the API expects. */
export function fromInputValue(field: FieldMeta, raw: string): unknown {
  switch (field.dataType) {
    case "number":
      return raw === "" ? null : Number(raw);
    case "bigint":
      return raw === "" ? null : BigInt(raw);
    case "boolean":
      return raw === "true";
    case "date":
      return raw === "" ? null : new Date(raw).toISOString();
    default:
      return raw;
  }
}

/** Build initial controlled-input values for a form. */
export function initialValues(
  fields: FieldMeta[],
  record?: Row,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.name] = toInputValue(field, record?.[field.name]);
  }
  return values;
}

/** Coerce a form's string values into an API payload. */
export function toPayload(
  fields: FieldMeta[],
  values: Record<string, string>,
): Row {
  const payload: Row = {};
  for (const field of fields) {
    payload[field.name] = fromInputValue(field, values[field.name] ?? "");
  }
  return payload;
}
