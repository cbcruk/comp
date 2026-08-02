import {
  inlineSummary,
  resolveDeleteRelations,
  resolveInlines,
  type ActionDefinition,
  type Collection,
  type DeleteRelation,
  type InlineSpec,
} from "@comp/core";
import {
  fieldsToJsonSchema,
  filtersToJsonSchema,
  inlinesToJsonSchema,
} from "./fields-to-schema.js";
import type { JsonSchema } from "./json-schema.js";

export type ToolKind =
  | "list"
  | "get"
  | "create"
  | "update"
  | "delete"
  | "delete_preview"
  | "action";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface ToolBinding {
  tool: McpTool;
  kind: ToolKind;
  collection: Collection;
  /** Inlines of this collection, so a write tool can apply them. */
  inlines: InlineSpec[];
  /** Inbound keys, so a delete can be described before it runs. */
  deleteRelations?: DeleteRelation[];
  actionName?: string;
}

const ID_SCHEMA: JsonSchema = {
  type: "object",
  properties: { id: { type: "string", description: "Primary key value" } },
  required: ["id"],
};

/** Say what the search box matches, so a caller knows why a query missed. */
function searchHint(collection: Collection): string {
  if (collection.search.length === 0) return "This collection declares no search fields.";
  const fields = collection.search.map((spec) => {
    const name = spec.through
      ? `${spec.field} → ${spec.through.table}.${spec.through.field}`
      : spec.field;
    if (spec.lookup === "startswith") return `${name} (starts with)`;
    if (spec.lookup === "exact") return `${name} (exact)`;
    return name;
  });
  return (
    `Free-text search over ${fields.join(", ")}. ` +
    "Every word must match at least one of them; quote a phrase to keep it whole."
  );
}

function listSchema(collection: Collection): JsonSchema {
  return {
    type: "object",
    properties: {
      page: { type: "number" },
      pageSize: { type: "number" },
      q: { type: "string", description: searchHint(collection) },
      sort: { type: "string", description: "field:asc | field:desc" },
      filters: filtersToJsonSchema(collection),
    },
  };
}

function toolName(slug: string, suffix: string): string {
  return `${slug}__${suffix}`;
}

/** Attach the generated `inlines` property to a write tool's input schema. */
function withInlines(
  schema: JsonSchema,
  inlineSchema: JsonSchema | null,
): JsonSchema {
  if (!inlineSchema) return schema;
  return {
    ...schema,
    properties: { ...schema.properties, inlines: inlineSchema },
  };
}

function readTools(
  collection: Collection,
  inlines: InlineSpec[],
): ToolBinding[] {
  const bindings: ToolBinding[] = [];
  const ops = collection.manifest.operations;
  const slug = collection.slug;
  const inlineSchema = inlinesToJsonSchema(inlines);
  const inlineNote =
    inlines.length > 0
      ? ` Child rows (${inlines.map((i) => inlineSummary(i).collection).join(", ")}) can be written in the same call.`
      : "";

  if (ops.includes("list")) {
    bindings.push({
      kind: "list",
      collection,
      inlines,
      tool: {
        name: toolName(slug, "list"),
        description: `List ${slug} records (search, filter, sort, paginate).`,
        inputSchema: listSchema(collection),
      },
    });
  }
  if (ops.includes("read")) {
    bindings.push({
      kind: "get",
      collection,
      inlines,
      tool: {
        name: toolName(slug, "get"),
        description:
          `Get a single ${slug} record by id.` +
          (inlines.length > 0 ? " Returns its child rows alongside it." : ""),
        inputSchema: ID_SCHEMA,
      },
    });
  }
  if (ops.includes("create")) {
    bindings.push({
      kind: "create",
      collection,
      inlines,
      tool: {
        name: toolName(slug, "create"),
        description: `Create a ${slug} record.${inlineNote}`,
        inputSchema: withInlines(
          fieldsToJsonSchema(collection.fields, { skip: collection.form.readonly }),
          inlineSchema,
        ),
      },
    });
  }
  if (ops.includes("update")) {
    const fieldSchema = fieldsToJsonSchema(collection.fields, {
      forUpdate: true,
      skip: collection.form.readonly,
    });
    bindings.push({
      kind: "update",
      collection,
      inlines,
      tool: {
        name: toolName(slug, "update"),
        description: `Update a ${slug} record by id.${inlineNote}`,
        inputSchema: withInlines(
          {
            type: "object",
            properties: { id: { type: "string" }, ...fieldSchema.properties },
            required: ["id"],
          },
          inlineSchema,
        ),
      },
    });
  }
  if (ops.includes("delete")) {
    bindings.push({
      kind: "delete_preview",
      collection,
      inlines,
      tool: {
        name: toolName(slug, "delete_preview"),
        description:
          `What deleting a ${slug} record would reach: how many rows in other ` +
          `collections point at it, and whether a foreign key would refuse the ` +
          `delete. Check this before calling ${toolName(slug, "delete")}.`,
        inputSchema: ID_SCHEMA,
      },
    });
    bindings.push({
      kind: "delete",
      collection,
      inlines,
      tool: {
        name: toolName(slug, "delete"),
        description: `Delete a ${slug} record by id.`,
        inputSchema: ID_SCHEMA,
      },
    });
  }
  return bindings;
}

/**
 * Generate the MCP tool registry from collections + actions — the same
 * declarations the UI, server, and CLI consume. Tools are gated by each
 * collection's manifest operations.
 */
export function buildToolRegistry(
  collections: Collection[],
  actions: ActionDefinition[] = [],
): Map<string, ToolBinding> {
  const registry = new Map<string, ToolBinding>();
  // Inlines bind to the relation graph over the whole registry, exactly as in
  // the HTTP API — one resolution, two transports.
  const inlines = resolveInlines(collections);
  const deleteRelations = resolveDeleteRelations(collections);

  for (const collection of collections) {
    for (const binding of readTools(collection, inlines.get(collection.slug) ?? [])) {
      registry.set(binding.tool.name, {
        ...binding,
        deleteRelations: deleteRelations.get(collection.slug) ?? [],
      });
    }
  }

  const bySlug = new Map(collections.map((c) => [c.slug, c]));
  for (const action of actions) {
    const collection = bySlug.get(action.collection);
    if (!collection) continue;
    const name = toolName(collection.slug, `action__${action.name}`);
    registry.set(name, {
      kind: "action",
      collection,
      inlines: [],
      deleteRelations: [],
      actionName: action.name,
      tool: {
        name,
        description: `Run the "${action.name}" action on ${collection.slug}.`,
        inputSchema: {
          type: "object",
          properties: {
            ids: { type: "array", items: { type: "string" } },
            input: { type: "object" },
          },
          required: ["ids"],
        },
      },
    });
  }

  return registry;
}

/** The public tool list for `tools/list`. */
export function listTools(registry: Map<string, ToolBinding>): McpTool[] {
  return [...registry.values()].map((binding) => binding.tool);
}
