import type {
  Collection,
  FieldMap,
  FieldMeta,
  InlineSpec,
  ManyToManySpec,
  ResolvedFilter,
} from "@comp/core";
import type { JsonSchema } from "./json-schema.js";

function baseSchema(field: FieldMeta): JsonSchema {
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

function fieldSchema(field: FieldMeta): JsonSchema {
  const schema = baseSchema(field);
  // Say what a foreign key points at, so a model filling this tool in knows
  // the value is an id from another table rather than a free number.
  if (field.relation) {
    schema.description = `Foreign key → ${field.relation.table}.${field.relation.column}`;
  }
  return schema;
}

/**
 * Build a JSON Schema for a collection's writable fields. For inserts, a field
 * is required when it is not-null, has no default, and is not the primary key;
 * for updates every field is optional. `skip` drops fields the caller does not
 * get to set — a readonly field, or an inline's parent key filled in from the
 * record being edited — since offering one invites a write that is then
 * silently ignored.
 */
export function fieldsToJsonSchema(
  fields: FieldMap,
  options: { forUpdate?: boolean; skip?: string[] } = {},
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  const skipped = new Set(options.skip ?? []);

  for (const field of Object.values(fields)) {
    if (field.primaryKey || skipped.has(field.name)) continue;
    properties[field.name] = fieldSchema(field);
    if (!options.forUpdate && field.notNull && !field.hasDefault) {
      required.push(field.name);
    }
  }

  const schema: JsonSchema = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

/**
 * Describe a record's many-to-many relationships as tool input.
 *
 * The value is the whole set of links, not a change to it — Django's `.set()`
 * — so the property says that outright: a model that sends one id replaces the
 * membership with that one id, which is the behavior, not a bug to guess at.
 */
export function manyToManyToJsonSchema(
  specs: ManyToManySpec[],
): JsonSchema | null {
  if (specs.length === 0) return null;

  const properties: Record<string, JsonSchema> = {};
  for (const spec of specs) {
    properties[spec.name] = {
      type: "array",
      description:
        `The complete set of ${spec.target.slug} this record links to, as ` +
        `${spec.targetKey} values. Sending it replaces the current set; ` +
        `send [] to unlink everything, and omit it to leave it alone.`,
      items: { type: "string" },
    };
  }
  return {
    type: "object",
    description: "Related records linked through a join table.",
    properties,
  };
}

/**
 * Build the `inlines` property for a parent's write tools: per child, the
 * create/update/delete operations it grants. Generated from the same resolved
 * inlines the HTTP API uses, so a model calling the tool sees exactly the
 * nested write the UI performs — no separate hand-written tool per child.
 */
export function inlinesToJsonSchema(specs: InlineSpec[]): JsonSchema | null {
  if (specs.length === 0) return null;

  const properties: Record<string, JsonSchema> = {};
  for (const spec of specs) {
    const child = spec.collection;
    const granted = child.manifest.operations;
    const operations: Record<string, JsonSchema> = {};

    if (granted.includes("create")) {
      operations.create = {
        type: "array",
        description: `New ${child.slug} rows; ${spec.field} is set from the parent.`,
        items: fieldsToJsonSchema(child.fields, { skip: [spec.field] }),
      };
    }
    if (granted.includes("update")) {
      operations.update = {
        type: "array",
        description: `Edits to existing ${child.slug} rows of this record.`,
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Primary key of the row" },
            values: fieldsToJsonSchema(child.fields, {
              forUpdate: true,
              skip: [spec.field],
            }),
          },
          required: ["id"],
        },
      };
    }
    if (spec.canDelete && granted.includes("delete")) {
      operations.delete = {
        type: "array",
        description: `Ids of ${child.slug} rows to remove from this record.`,
        items: { type: "string" },
      };
    }

    if (Object.keys(operations).length > 0) {
      properties[child.slug] = { type: "object", properties: operations };
    }
  }

  if (Object.keys(properties).length === 0) return null;
  return {
    type: "object",
    description: "Child rows edited together with this record.",
    properties,
  };
}

const PRESET_HINT = "preset:today | preset:past7 | preset:month | preset:year";

/** How one field may be narrowed, in the words its kind allows. */
function filterHint(filter: ResolvedFilter): string {
  const parts: string[] = [];
  switch (filter.kind) {
    case "choices":
    case "boolean":
      parts.push(
        `one of ${filter.options.map((o) => o.value).join(", ")}`,
        `or in:${filter.options.map((o) => o.value).join(",")}`,
      );
      break;
    case "date":
      parts.push(PRESET_HINT, "or range:FROM..TO (ISO dates, upper bound exclusive)");
      break;
    case "relation":
      parts.push(`an id from ${filter.table ?? "the referenced table"}`, "or in:1,2");
      break;
    case "m2m":
      // The choices are the far collection's records; there is no column here
      // to read them off, which is what the join table is for.
      parts.push(
        `an id from ${filter.table ?? "the related table"}`,
        "or in:1,2 for any of them",
      );
      break;
    case "values":
      // The set is whatever the column holds right now, so it cannot be in a
      // schema generated at startup — the list result carries it instead.
      parts.push(
        "a value this column holds; the list result's `choices` names them",
        "or in:a,b",
      );
      break;
    default:
      parts.push("an exact value");
  }
  if (filter.kind === "m2m") {
    // Empty means "linked to nothing" here — there is no column to be null.
    parts.push("or isnull:true for the records with no links / isnull:false");
  } else if (filter.nullable) {
    parts.push("or isnull:true / isnull:false");
  }
  return parts.join("; ");
}

/**
 * Describe a collection's filters as tool input. The generated `filters`
 * property says per field what it accepts — the enum's own values, the date
 * presets, whether null is a thing it can be — so a model narrows a list the
 * same way the UI does instead of guessing at a value the query layer would
 * silently drop.
 */
export function filtersToJsonSchema(collection: Collection): JsonSchema {
  if (collection.filters.length === 0) {
    return { type: "object", description: "This collection declares no filters." };
  }

  const properties: Record<string, JsonSchema> = {};
  for (const filter of collection.filters) {
    properties[filter.field] = { type: "string", description: filterHint(filter) };
  }
  return {
    type: "object",
    description: "Filters by column; each value carries its own operation.",
    properties,
  };
}
