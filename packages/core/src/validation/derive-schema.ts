import { z } from "zod";
import type { Collection } from "../collection/define-collection.types.js";
import type { FieldMeta } from "../introspection/introspect-table.types.js";

function baseSchema(field: FieldMeta): z.ZodTypeAny {
  switch (field.dataType) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "bigint":
      return z.bigint();
    case "boolean":
      return z.boolean();
    case "date":
      return z.coerce.date();
    default:
      return z.unknown();
  }
}

/**
 * Derive a Zod schema for inserting a row from the collection's introspected
 * fields. Nullable columns accept `null`; columns that are nullable or have a
 * default are optional. Validation always traces back to the schema — never
 * hand-maintained alongside it.
 */
export function deriveInsertSchema(
  collection: Collection,
): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const field of Object.values(collection.fields)) {
    let schema = baseSchema(field);
    if (!field.notNull) schema = schema.nullable();
    if (field.primaryKey || !field.notNull || field.hasDefault) {
      schema = schema.optional();
    }
    shape[field.name] = schema;
  }
  return z.object(shape);
}

/** Update schema: every field optional, for partial edits. */
export function deriveUpdateSchema(
  collection: Collection,
): z.ZodObject<z.ZodRawShape> {
  return deriveInsertSchema(collection).partial();
}
