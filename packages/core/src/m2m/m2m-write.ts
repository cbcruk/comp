import type { ZodIssue } from "zod";
import {
  buildLinkDelete,
  buildLinkInsert,
  buildLinkedIdsQuery,
  buildTargetExistsQuery,
} from "../query/build-m2m-query.js";
import type { SqliteDb } from "../query/build-list-query.js";
import { ValidationError } from "../validation/validation-error.js";
import type {
  ManyToManyResult,
  ManyToManySpec,
  ManyToManyWrite,
} from "./m2m.types.js";

/** Ids as a comparable set — the values arrive as text over HTTP. */
function keyOf(value: unknown): string {
  return String(value);
}

/** The ids currently linked to this record. */
export async function readLinks(
  db: SqliteDb,
  spec: ManyToManySpec,
  parentId: unknown,
): Promise<unknown[]> {
  const rows = (await buildLinkedIdsQuery(db, spec, parentId).all()) as {
    value: unknown;
  }[];
  return rows.map((row) => row.value);
}

/**
 * Every relationship's links for one record, keyed by name.
 *
 * Gated per relationship the way an inline's rows are: the far side is a
 * collection in its own right, and reaching its records sideways must not
 * grant more than listing it would.
 */
export async function readManyToMany(
  db: SqliteDb,
  specs: ManyToManySpec[],
  row: Record<string, unknown>,
  allow?: (spec: ManyToManySpec) => Promise<boolean> | boolean,
): Promise<Record<string, unknown[]> | undefined> {
  if (specs.length === 0) return undefined;

  const result: Record<string, unknown[]> = {};
  for (const spec of specs) {
    if (allow && !(await allow(spec))) continue;
    result[spec.name] = await readLinks(db, spec, row[spec.parentKey]);
  }
  return result;
}

/**
 * Set one relationship's membership to exactly the ids given.
 *
 * Django's `.set()`: the payload is the whole set, and the difference against
 * what is stored is worked out here. A form can only report what is selected
 * now, so asking it for a changelist would mean asking it to remember a state
 * it never had.
 *
 * Unknown ids are refused rather than dropped. A link to a record that is not
 * there is not a link, and silently discarding half a selection is the kind of
 * save that looks like it worked.
 */
export async function writeLinks(
  db: SqliteDb,
  spec: ManyToManySpec,
  parentId: unknown,
  desired: readonly unknown[],
): Promise<ManyToManyResult> {
  const current = await readLinks(db, spec, parentId);
  const currentKeys = new Set(current.map(keyOf));

  // Deduplicated: selecting the same record twice is still one link, and the
  // join table would refuse the second row anyway.
  const wanted = new Map<string, unknown>();
  for (const id of desired) wanted.set(keyOf(id), id);

  const toLink = [...wanted.entries()]
    .filter(([key]) => !currentKeys.has(key))
    .map(([, id]) => id);
  const toUnlink = current.filter((id) => !wanted.has(keyOf(id)));

  if (toLink.length > 0) {
    const rows = (await buildTargetExistsQuery(
      db,
      spec.target,
      spec.targetKey,
      toLink,
    ).all()) as { value: unknown }[];
    const found = new Set(rows.map((row) => keyOf(row.value)));
    const missing = toLink.filter((id) => !found.has(keyOf(id)));
    if (missing.length > 0) {
      const issues: ZodIssue[] = missing.map((id) => ({
        code: "custom",
        path: ["manyToMany", spec.name],
        message: `No ${spec.target.label} with ${spec.targetKey} ${String(id)}`,
      })) as ZodIssue[];
      throw new ValidationError(issues);
    }
  }

  // Unlink first: a set that swaps one member for another stays within any
  // uniqueness the join table declares while it is being applied.
  if (toUnlink.length > 0) {
    await buildLinkDelete(db, spec, parentId, toUnlink);
  }
  if (toLink.length > 0) {
    await buildLinkInsert(db, spec, parentId, toLink);
  }

  return { name: spec.name, linked: toLink, unlinked: toUnlink };
}

/**
 * Apply a record's many-to-many changes.
 *
 * Only the relationships the payload names are touched: a form that does not
 * render a relationship must not be able to clear it by omission.
 */
export async function writeManyToMany(
  db: SqliteDb,
  specs: ManyToManySpec[],
  row: Record<string, unknown>,
  payload: ManyToManyWrite,
): Promise<ManyToManyResult[]> {
  const byName = new Map(specs.map((spec) => [spec.name, spec]));
  const results: ManyToManyResult[] = [];

  for (const [name, ids] of Object.entries(payload)) {
    const spec = byName.get(name);
    if (!spec || !Array.isArray(ids)) continue;
    results.push(await writeLinks(db, spec, row[spec.parentKey], ids));
  }
  return results;
}

/** Which relationships a payload asks to change, for permission checks. */
export function manyToManyNames(payload: ManyToManyWrite): string[] {
  return Object.keys(payload).filter((name) => Array.isArray(payload[name]));
}
