import { buildDeleteQuery } from "../mutation/build-mutations.js";
import type {
  ActionConfig,
  ActionDefinition,
} from "./define-action.types.js";

/**
 * Declare a bulk/custom action. The result is a normalized, capability-bearing
 * definition: the manifest states exactly which collection and operations the
 * action touches, kept separate from the handler so it stays serializable and
 * enforceable ahead of execution.
 */
export function defineAction(config: ActionConfig): ActionDefinition {
  if (config.name.trim() === "") {
    throw new Error("Action name is required");
  }
  if (config.operations.length === 0) {
    throw new Error(`Action "${config.name}" must declare its operations`);
  }

  return {
    name: config.name,
    label: config.label ?? config.name,
    collection: config.collection,
    operations: config.operations,
    handler: config.handler,
    manifest: {
      name: config.name,
      collection: config.collection,
      operations: config.operations,
    },
  };
}

/** Built-in bulk delete, declared like any other action. */
export function bulkDeleteAction(collection: string): ActionDefinition {
  return defineAction({
    name: "delete",
    label: "Delete selected",
    collection,
    operations: ["delete"],
    handler: async ({ db, collection: target, ids }) => {
      let affected = 0;
      for (const id of ids) {
        const removed = await buildDeleteQuery(db, target, id);
        affected += removed.length;
      }
      return { affected, message: `Deleted ${affected} record(s)` };
    },
  });
}
