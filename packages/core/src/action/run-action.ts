import type { SqliteDb } from "../query/build-list-query.js";
import type { CollectionOperation } from "../collection/define-collection.types.js";
import type {
  ActionContext,
  ActionDefinition,
  ActionResult,
} from "./define-action.types.js";

/** Thrown when an action touches a db operation it never declared. */
export class CapabilityError extends Error {
  readonly method: string;
  readonly granted: CollectionOperation[];

  constructor(method: string, granted: CollectionOperation[]) {
    super(
      `Action lacks the capability to "${method}" (granted: ${granted.join(", ") || "none"})`,
    );
    this.name = "CapabilityError";
    this.method = method;
    this.granted = granted;
  }
}

/** Which operations a db entrypoint requires. */
const METHOD_CAPABILITY: Record<string, CollectionOperation[]> = {
  select: ["list", "read"],
  insert: ["create"],
  update: ["update"],
  delete: ["delete"],
};

/**
 * Wrap a db so an action can only reach the entrypoints its declared
 * operations permit; everything else throws {@link CapabilityError}. This is
 * the in-process enforcement of the capability manifest — the same boundary a
 * future isolate executor draws, drawn here without one.
 */
export function createCapabilityDb(
  db: SqliteDb,
  operations: CollectionOperation[],
): SqliteDb {
  const granted = new Set(operations);
  return new Proxy(db, {
    get(target, prop, receiver) {
      const required = typeof prop === "string" ? METHOD_CAPABILITY[prop] : undefined;
      if (required && !required.some((op) => granted.has(op))) {
        return () => {
          throw new CapabilityError(String(prop), operations);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as SqliteDb;
}

/** Run an action given a scoped context — swap for an isolate later. */
export type ActionExecutor = (
  action: ActionDefinition,
  context: ActionContext,
) => Promise<ActionResult>;

export const inProcessExecutor: ActionExecutor = (action, context) =>
  action.handler(context);

/**
 * Execute an action through the capability boundary: the handler receives a
 * db scoped to the action's declared operations. The executor is pluggable so
 * the action can later run in a sandboxed isolate with no API change.
 */
export function runAction(
  action: ActionDefinition,
  context: ActionContext,
  executor: ActionExecutor = inProcessExecutor,
): Promise<ActionResult> {
  const scoped: ActionContext = {
    ...context,
    db: createCapabilityDb(context.db, action.operations),
  };
  return executor(action, scoped);
}
