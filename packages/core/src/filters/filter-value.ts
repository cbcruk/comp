import type { FieldMeta } from "../introspection/introspect-table.types.js";
import type { DatePreset, FilterValue } from "./filter.types.js";

const PRESETS = new Set<string>(["today", "past7", "month", "year"]);

/**
 * Read a filter value off the wire.
 *
 * A bare value is an exact match, so the plain `?status=draft` case keeps
 * reading like a plain query string; anything richer states its operation
 * first: `in:`, `isnull:`, `range:`, `preset:`. Keeping the operation in the
 * URL rather than resolving it client-side means a filtered view is a link
 * that still means the same thing tomorrow — "this month" stays this month.
 *
 * Only those four prefixes are operators. A value that merely contains a colon
 * (an ISO timestamp, say) is an exact match, so parsing never depends on the
 * shape of the data.
 */
export function parseFilterValue(raw: string): FilterValue | null {
  if (raw === "") return null;

  const separator = raw.indexOf(":");
  const prefix = separator === -1 ? "" : raw.slice(0, separator);
  const rest = raw.slice(separator + 1);

  switch (prefix) {
    case "in": {
      const values = rest
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value !== "");
      return values.length > 0 ? { op: "in", values } : null;
    }
    case "isnull":
      return { op: "isnull", value: rest !== "false" };
    case "range": {
      const [from, to] = rest.split("..");
      if (!from && !to) return null;
      return {
        op: "range",
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      };
    }
    case "preset":
      return PRESETS.has(rest) ? { op: "preset", preset: rest as DatePreset } : null;
    default:
      return { op: "exact", value: raw };
  }
}

/** Render a filter value back into its query-string form. */
export function formatFilterValue(value: FilterValue): string {
  switch (value.op) {
    case "exact":
      return String(value.value);
    case "in":
      return `in:${value.values.map(String).join(",")}`;
    case "isnull":
      return `isnull:${String(value.value)}`;
    case "range":
      return `range:${value.from === undefined ? "" : String(value.from)}..${
        value.to === undefined ? "" : String(value.to)
      }`;
    case "preset":
      return `preset:${value.preset}`;
  }
}

/**
 * Coerce a raw filter operand to what the column stores. A query string only
 * ever carries text, so without this a numeric column is compared against a
 * string and a timestamp column against an ISO string — both quietly match
 * nothing rather than failing.
 */
export function coerceFilterOperand(field: FieldMeta, raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return raw;

  switch (field.dataType) {
    case "number":
      return raw === "" ? null : Number(raw);
    case "bigint":
      return raw === "" ? null : BigInt(raw);
    case "boolean":
      return raw === "true" || raw === "1";
    case "date": {
      const date = new Date(raw);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    default:
      return raw;
  }
}

function startOfDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * Turn a named window into a concrete half-open range `[from, to)`.
 *
 * `now` is an argument rather than read from the clock so the resolution stays
 * pure and testable, and boundaries are computed in UTC — an edge worker has
 * no local timezone worth trusting.
 */
export function dateRangeFor(
  preset: DatePreset,
  now: Date,
): { from: Date; to: Date } {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);

  switch (preset) {
    case "today":
      return { from: today, to: tomorrow };
    case "past7":
      return { from: addDays(today, -7), to: tomorrow };
    case "month":
      return {
        from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      };
    case "year":
      return {
        from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
        to: new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)),
      };
  }
}
