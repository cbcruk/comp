import type { InlineWritePayload } from "@comp/core";

export interface SplitBody {
  /** The record's own fields. */
  values: Record<string, unknown>;
  /** Inline changes, keyed by child collection slug; empty when none. */
  inlines: InlineWritePayload;
}

const INLINES_KEY = "inlines";

/**
 * Split a write body into the record's own values and its inline changes.
 *
 * A parent and its children arrive in one request — that is what makes the
 * write a single user action rather than several. `inlines` is therefore a
 * reserved key at the top level of a write body, the way Django reserves
 * formset prefixes in one POST; a column of that name would collide, which is
 * the documented cost of keeping one request.
 */
export function splitInlineBody(body: unknown): SplitBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { values: {}, inlines: {} };
  }

  const { [INLINES_KEY]: inlines, ...values } = body as Record<string, unknown>;
  if (!inlines || typeof inlines !== "object" || Array.isArray(inlines)) {
    return { values, inlines: {} };
  }
  return { values, inlines: inlines as InlineWritePayload };
}
