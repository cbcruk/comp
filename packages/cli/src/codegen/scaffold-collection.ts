import { toCamelCase } from "../naming.js";

export interface ScaffoldCollectionOptions {
  /** Collection name, e.g. "posts" or "BlogPost". */
  name: string;
  /** Drizzle table identifier to import. */
  table: string;
  /** Module the table is imported from. */
  module: string;
  listDisplay: string[];
  filters?: string[];
  search?: string[];
}

function arrayLiteral(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

/**
 * Generate the source for a collection module. Pure string codegen so it is
 * testable and runtime-agnostic — the same declaration shape the UI, server,
 * and CLI all consume.
 */
export function scaffoldCollection(options: ScaffoldCollectionOptions): string {
  const exportName = `${toCamelCase(options.name)}Collection`;
  const lines = [
    `import { defineCollection } from "@comp/core";`,
    `import { ${options.table} } from "${options.module}";`,
    ``,
    `export const ${exportName} = defineCollection({`,
    `  model: ${options.table},`,
    `  listDisplay: ${arrayLiteral(options.listDisplay)},`,
  ];
  if (options.filters && options.filters.length > 0) {
    lines.push(`  filters: ${arrayLiteral(options.filters)},`);
  }
  if (options.search && options.search.length > 0) {
    lines.push(`  search: ${arrayLiteral(options.search)},`);
  }
  lines.push(`});`, ``);
  return lines.join("\n");
}
