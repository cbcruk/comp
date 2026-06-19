import type { FieldMap, FieldMeta } from "@comp/core";
import type { JsonSchema } from "./json-schema.js";

function fieldSchema(field: FieldMeta): JsonSchema {
  if (field.enumValues && field.enumValues.length > 0) {
    return { type: "string", enum: field.enumValues };
  }
  switch (field.dataType) {
    case "number":
    case "bigint":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    default:
      return { type: "string" };
  }
}

/**
 * Build a JSON Schema for a collection's writable fields. For inserts, a field
 * is required when it is not-null, has no default, and is not the primary key;
 * for updates every field is optional.
 */
export function fieldsToJsonSchema(
  fields: FieldMap,
  options: { forUpdate?: boolean } = {},
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const field of Object.values(fields)) {
    if (field.primaryKey) continue;
    properties[field.name] = fieldSchema(field);
    if (!options.forUpdate && field.notNull && !field.hasDefault) {
      required.push(field.name);
    }
  }

  const schema: JsonSchema = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}
