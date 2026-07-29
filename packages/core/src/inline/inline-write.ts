import type { ZodIssue } from "zod";
import type { CollectionOperation } from "../collection/define-collection.types.js";
import {
  buildInlineDeleteQuery,
  buildInlineListQuery,
  buildInlineUpdateQuery,
} from "../query/build-inline-query.js";
import { buildInsertQuery } from "../mutation/build-mutations.js";
import type { SqliteDb } from "../query/build-list-query.js";
import { validateInsert, validateUpdate } from "../validation/derive-schema.js";
import { ValidationError } from "../validation/validation-error.js";
import type {
  InlineSpec,
  InlineWrite,
  InlineWritePayload,
  InlineWriteResult,
  PreparedInlineWrite,
} from "./inline.types.js";

/** Thrown when an inline write asks for something the inline never granted. */
export class InlineError extends Error {
  readonly collection: string;
  readonly operation: CollectionOperation;

  constructor(collection: string, operation: CollectionOperation, reason: string) {
    super(`Inline "${collection}" cannot "${operation}": ${reason}`);
    this.name = "InlineError";
    this.collection = collection;
    this.operation = operation;
  }
}

/**
 * Which operations a write needs on the child collection. The caller checks
 * these against the manifest and the identity using the same
 * `CollectionOperation` vocabulary as everything else, before anything runs.
 */
export function inlineOperations(write: InlineWrite): CollectionOperation[] {
  const operations: CollectionOperation[] = [];
  if (write.create?.length) operations.push("create");
  if (write.update?.length) operations.push("update");
  if (write.delete?.length) operations.push("delete");
  return operations;
}

function prefixed(slug: string, index: number, issues: ZodIssue[]): ZodIssue[] {
  return issues.map((issue) => ({
    ...issue,
    path: ["inlines", slug, index, ...issue.path],
  }));
}

function assertGranted(spec: InlineSpec, write: InlineWrite): void {
  const slug = spec.collection.slug;
  const granted = spec.collection.manifest.operations;
  for (const operation of inlineOperations(write)) {
    if (!granted.includes(operation)) {
      throw new InlineError(slug, operation, "the collection does not allow it");
    }
    if (operation === "delete" && !spec.canDelete) {
      throw new InlineError(slug, operation, "the inline declares canDelete: false");
    }
  }
}

/**
 * Validate one inline's changes against the child's derived schema and pin
 * every row to this parent.
 *
 * The parent key is set on creates and stripped from updates rather than
 * trusted from the caller: an inline edits a parent's own rows, so re-parenting
 * a row is not one of the operations it offers. Issue paths are prefixed with
 * `inlines.<slug>.<index>` so a form can put each message on the row and field
 * it came from.
 */
export function prepareInlineWrite(
  spec: InlineSpec,
  write: InlineWrite,
  parentId: unknown,
): PreparedInlineWrite {
  assertGranted(spec, write);
  const child = spec.collection;
  const slug = child.slug;
  const issues: ZodIssue[] = [];

  const create: Record<string, unknown>[] = [];
  (write.create ?? []).forEach((values, index) => {
    try {
      create.push(
        validateInsert(child, { ...values, [spec.field]: parentId }),
      );
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      issues.push(...prefixed(slug, index, error.issues));
    }
  });

  const update: { id: unknown; values: Record<string, unknown> }[] = [];
  (write.update ?? []).forEach((row, index) => {
    const { [spec.field]: _ignored, ...values } = row.values;
    try {
      const validated = validateUpdate(child, values);
      // An update that only tried to move the row to another parent has
      // nothing left to set; drop it rather than emit an empty UPDATE.
      if (Object.keys(validated).length > 0) {
        update.push({ id: row.id, values: validated });
      }
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      issues.push(...prefixed(slug, index, error.issues));
    }
  });

  if (issues.length > 0) throw new ValidationError(issues);

  return { create, update, delete: write.delete ?? [] };
}

/**
 * Apply a parent's inline changes.
 *
 * Order is deliberate: deletes, then updates, then creates — so a row removed
 * and a row added in the same submit cannot collide on a unique column. Every
 * update and delete is scoped to the parent in SQL (see
 * `buildInlineUpdateQuery`), so an id belonging to another parent matches
 * nothing instead of being edited.
 *
 * Application is sequential on the given handle. D1 has no interactive
 * transactions, so this is *not* atomic there today; this function is the one
 * seam where a driver-level batch or transaction drops in, and no caller has to
 * change when it does.
 */
export async function writeInlines(
  db: SqliteDb,
  specs: InlineSpec[],
  parentRow: Record<string, unknown>,
  payload: InlineWritePayload,
): Promise<InlineWriteResult[]> {
  const bySlug = new Map(specs.map((spec) => [spec.collection.slug, spec]));
  const results: InlineWriteResult[] = [];

  for (const [slug, write] of Object.entries(payload)) {
    const spec = bySlug.get(slug);
    if (!spec) {
      throw new Error(`Unknown inline "${slug}" for this collection`);
    }

    const parentId = parentRow[spec.targetField];
    const prepared = prepareInlineWrite(spec, write, parentId);

    const deleted: Record<string, unknown>[] = [];
    for (const id of prepared.delete) {
      const rows = await buildInlineDeleteQuery(db, spec, parentId, id);
      if (rows[0]) deleted.push(rows[0] as Record<string, unknown>);
    }

    const updated: Record<string, unknown>[] = [];
    for (const row of prepared.update) {
      const rows = await buildInlineUpdateQuery(
        db,
        spec,
        parentId,
        row.id,
        row.values,
      );
      if (rows[0]) updated.push(rows[0] as Record<string, unknown>);
    }

    const created: Record<string, unknown>[] = [];
    for (const values of prepared.create) {
      const rows = await buildInsertQuery(db, spec.collection, values);
      if (rows[0]) created.push(rows[0] as Record<string, unknown>);
    }

    results.push({ collection: slug, created, updated, deleted });
  }

  return results;
}

/** Read every inline's rows for one parent record. */
export async function readInlines(
  db: SqliteDb,
  specs: InlineSpec[],
  parentRow: Record<string, unknown>,
  allowed?: (spec: InlineSpec) => boolean | Promise<boolean>,
): Promise<Record<string, Record<string, unknown>[]>> {
  const inlines: Record<string, Record<string, unknown>[]> = {};

  for (const spec of specs) {
    if (allowed && !(await allowed(spec))) continue;
    const rows = await buildInlineListQuery(
      db,
      spec,
      parentRow[spec.targetField],
    ).all();
    inlines[spec.collection.slug] = rows as Record<string, unknown>[];
  }

  return inlines;
}
