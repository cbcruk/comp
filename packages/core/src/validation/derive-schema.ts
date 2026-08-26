import { Either, ParseResult, Schema } from 'effect'
import type { Collection } from '../collection/define-collection.types.js'
import type { FieldMeta } from '../introspection/introspect-table.types.js'
import { stripReadonly } from '../form/resolve-form.js'
import { ValidationError, type FieldIssue } from '../errors/comp-error.js'

/** A row, as it arrives on the wire and as it goes on to the driver. */
type Row = Record<string, unknown>

/** A derived schema decodes an unknown payload into a row. */
export type RowSchema = Schema.Schema<Row, Row, never>

export interface ValidateOptions {
  /**
   * Columns to leave out of the schema entirely — not the caller's to supply.
   *
   * An inline's foreign key is the case this exists for: the parent key is set
   * by the write, never by the payload (the update path already strips it, so
   * a row cannot be re-parented). Leaving it out is what lets a child row be
   * checked *before* its parent exists, which is the difference between
   * refusing a bad nested write and refusing it after inserting the parent.
   */
  readonly omit?: readonly string[]
}

/**
 * A date arrives in whatever the transport could carry it in — a Date from a
 * direct call, a string from JSON, a number from a client that sent epoch
 * millis — and all three have to reach the column as a Date. Each member of
 * the union does its own conversion, so the coercion is declared rather than
 * left to `new Date(whatever)`.
 *
 * Every member is the *validating* one: the plain conversions happily produce
 * an Invalid Date, which would then be written to the column instead of
 * refused. Rejecting garbage is the whole reason validation runs before a
 * readonly value is dropped.
 */
const AnyDate = Schema.Union(
  Schema.ValidDateFromSelf,
  Schema.Date,
  Schema.DateFromNumber.pipe(Schema.validDate()),
)

function baseSchema(field: FieldMeta): Schema.Schema.AnyNoContext {
  switch (field.dataType) {
    case 'string':
      return Schema.String
    case 'number':
      return Schema.Number
    case 'bigint':
      return Schema.BigIntFromSelf
    case 'boolean':
      return Schema.Boolean
    case 'date':
      return AnyDate
    default:
      return Schema.Unknown
  }
}

/**
 * Build the struct for a collection. `allOptional` is what separates an insert
 * from an update: an update states only what moved, so nothing is required of
 * it, while an insert still has to carry every column the table demands.
 */
function structFor(
  collection: Collection,
  allOptional: boolean,
  omit: readonly string[] = [],
): RowSchema {
  const fields: Record<string, Schema.Struct.Field> = {}
  for (const field of Object.values(collection.fields)) {
    if (omit.includes(field.name)) continue
    const value = field.notNull
      ? baseSchema(field)
      : Schema.NullOr(baseSchema(field))
    const optional =
      allOptional || field.primaryKey || !field.notNull || field.hasDefault
    fields[field.name] = optional ? Schema.optional(value) : value
  }
  // The field map is built from introspection, so its shape is only known at
  // runtime; this is the one place that has to be stated rather than inferred.
  return Schema.Struct(fields) as unknown as RowSchema
}

/**
 * Derive a schema for inserting a row from the collection's introspected
 * fields. Nullable columns accept `null`; columns that are nullable or have a
 * default are optional. Validation always traces back to the schema — never
 * hand-maintained alongside it.
 */
export function deriveInsertSchema(
  collection: Collection,
  options: ValidateOptions = {},
): RowSchema {
  return structFor(collection, false, options.omit)
}

/** Update schema: every field optional, for partial edits. */
export function deriveUpdateSchema(
  collection: Collection,
  options: ValidateOptions = {},
): RowSchema {
  return structFor(collection, true, options.omit)
}

/**
 * Decode against a derived schema, or raise the failure in the shape the wire
 * expects.
 *
 * `ArrayFormatter` is what keeps this swap invisible from outside: it reports
 * one entry per offending field with the path that reached it, which is the
 * `{path, message}` contract the admin already groups issues by. `errors:
 * 'all'` matters for the same reason a form does — a first-failure-only report
 * would light up one field at a time.
 */
function decode(schema: RowSchema, input: unknown): Row {
  const result = Schema.decodeUnknownEither(schema, { errors: 'all' })(input)
  if (Either.isRight(result)) return result.right
  const issues: FieldIssue[] = ParseResult.ArrayFormatter.formatErrorSync(
    result.left,
  ).map((issue) => ({
    // A path segment is typed as a PropertyKey, but nothing that reaches the
    // wire can be a symbol; name it rather than drop it.
    path: issue.path.map((segment) =>
      typeof segment === 'symbol' ? (segment.description ?? '') : segment,
    ),
    message: issue.message,
  }))
  throw new ValidationError({ issues })
}

/**
 * Validate insert input, throwing {@link ValidationError} on failure. Values
 * for readonly fields are dropped before validation, so declaring one readonly
 * is enforced on every transport rather than only hidden in the UI.
 */
export function validateInsert(
  collection: Collection,
  input: unknown,
  options: ValidateOptions = {},
): Row {
  const values = decode(deriveInsertSchema(collection, options), input)
  return stripReadonly(collection.form, values)
}

/** Validate partial update input, throwing {@link ValidationError} on failure. */
export function validateUpdate(
  collection: Collection,
  input: unknown,
  options: ValidateOptions = {},
): Row {
  const values = decode(deriveUpdateSchema(collection, options), input)
  return stripReadonly(collection.form, values)
}
