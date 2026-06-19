import type { ActionDefinition, Collection } from "@comp/core";
import { fieldsToJsonSchema } from "./fields-to-schema.js";
import type { JsonSchema } from "./json-schema.js";

export type ToolKind = "list" | "get" | "create" | "update" | "delete" | "action";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface ToolBinding {
  tool: McpTool;
  kind: ToolKind;
  collection: Collection;
  actionName?: string;
}

const ID_SCHEMA: JsonSchema = {
  type: "object",
  properties: { id: { type: "string", description: "Primary key value" } },
  required: ["id"],
};

const LIST_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    pageSize: { type: "number" },
    q: { type: "string", description: "Free-text search" },
    sort: { type: "string", description: "field:asc | field:desc" },
    filters: { type: "object", description: "Equality filters by column" },
  },
};

function toolName(slug: string, suffix: string): string {
  return `${slug}__${suffix}`;
}

function readTools(collection: Collection): ToolBinding[] {
  const bindings: ToolBinding[] = [];
  const ops = collection.manifest.operations;
  const slug = collection.slug;

  if (ops.includes("list")) {
    bindings.push({
      kind: "list",
      collection,
      tool: {
        name: toolName(slug, "list"),
        description: `List ${slug} records (search, filter, sort, paginate).`,
        inputSchema: LIST_SCHEMA,
      },
    });
  }
  if (ops.includes("read")) {
    bindings.push({
      kind: "get",
      collection,
      tool: {
        name: toolName(slug, "get"),
        description: `Get a single ${slug} record by id.`,
        inputSchema: ID_SCHEMA,
      },
    });
  }
  if (ops.includes("create")) {
    bindings.push({
      kind: "create",
      collection,
      tool: {
        name: toolName(slug, "create"),
        description: `Create a ${slug} record.`,
        inputSchema: fieldsToJsonSchema(collection.fields),
      },
    });
  }
  if (ops.includes("update")) {
    const fieldSchema = fieldsToJsonSchema(collection.fields, { forUpdate: true });
    bindings.push({
      kind: "update",
      collection,
      tool: {
        name: toolName(slug, "update"),
        description: `Update a ${slug} record by id.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" }, ...fieldSchema.properties },
          required: ["id"],
        },
      },
    });
  }
  if (ops.includes("delete")) {
    bindings.push({
      kind: "delete",
      collection,
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

  for (const collection of collections) {
    for (const binding of readTools(collection)) {
      registry.set(binding.tool.name, binding);
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
