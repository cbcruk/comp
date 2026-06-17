import type { Collection } from "@comp/core";

/**
 * Summarize a collection's capability manifest for CLI/programmatic surfaces.
 * The CLI reads the same declaration the UI and server do — never its own copy.
 */
export function describeCollection(collection: Collection): string {
  const ops = collection.manifest.operations.join(", ");
  const fields = Object.keys(collection.fields).join(", ");
  return `${collection.slug} [${ops}]\n  fields: ${fields}`;
}

export { listFlag, parseArgs } from "./args.js";
export type { ParsedArgs } from "./args.js";
export { scaffoldCollection } from "./codegen/scaffold-collection.js";
export type { ScaffoldCollectionOptions } from "./codegen/scaffold-collection.js";
export {
  deriveScaffoldDefaults,
  scaffoldFromTable,
} from "./codegen/scaffold-from-table.js";
export type {
  ScaffoldDefaults,
  ScaffoldFromTableOptions,
} from "./codegen/scaffold-from-table.js";
export { toCamelCase, toKebabCase, toPascalCase } from "./naming.js";
