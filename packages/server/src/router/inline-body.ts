import type { InlineWritePayload, ManyToManyWrite } from "@comp/core";

export interface SplitBody {
  /** The record's own fields. */
  values: Record<string, unknown>;
  /** Inline changes, keyed by child collection slug; empty when none. */
  inlines: InlineWritePayload;
  /** Link sets, keyed by relationship name; empty when none. */
  manyToMany: ManyToManyWrite;
}

const INLINES_KEY = "inlines";
const M2M_KEY = "manyToMany";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Split a write body into the record's own values and its inline changes.
 *
 * A record, its children, and its links arrive in one request — that is what
 * makes the write a single user action rather than three. `inlines` and
 * `manyToMany` are therefore reserved keys at the top level of a write body,
 * the way Django reserves formset prefixes in one POST; a column of either
 * name would collide, which is the documented cost of keeping one request.
 */
export function splitInlineBody(body: unknown): SplitBody {
  const record = asObject(body);
  if (!record) return { values: {}, inlines: {}, manyToMany: {} };

  const {
    [INLINES_KEY]: inlines,
    [M2M_KEY]: manyToMany,
    ...values
  } = record;

  return {
    values,
    inlines: (asObject(inlines) ?? {}) as InlineWritePayload,
    manyToMany: (asObject(manyToMany) ?? {}) as ManyToManyWrite,
  };
}
