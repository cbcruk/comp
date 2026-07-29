export { defineCollection } from "./collection/define-collection.js";
export type {
  Collection,
  CollectionConfig,
  CollectionManifest,
  CollectionOperation,
  ColumnKey,
  FieldOrdering,
  OrderingSpec,
  SortDirection,
} from "./collection/define-collection.types.js";

export { resolveLabelField } from "./collection/label-field.js";

export type { Table } from "drizzle-orm";
export { introspectTable } from "./introspection/introspect-table.js";
export type {
  FieldDataType,
  FieldMap,
  FieldMeta,
  FieldRelation,
  ReferentialAction,
  TableIntrospection,
  TableRelation,
} from "./introspection/introspect-table.types.js";

export { inlineSummary, resolveInlines } from "./inline/resolve-inlines.js";
export {
  InlineError,
  inlineOperations,
  prepareInlineWrite,
  readInlines,
  writeInlines,
} from "./inline/inline-write.js";
export type {
  InlineConfig,
  InlineSpec,
  InlineSummary,
  InlineWrite,
  InlineWritePayload,
  InlineWriteResult,
  PreparedInlineWrite,
} from "./inline/inline.types.js";
export {
  buildInlineDeleteQuery,
  buildInlineListQuery,
  buildInlineUpdateQuery,
} from "./query/build-inline-query.js";

export { resolveRelations } from "./relations/resolve-relations.js";
export type {
  InboundRelation,
  OutboundRelation,
  RelationGraph,
} from "./relations/resolve-relations.types.js";

export {
  buildCountQuery,
  buildListQuery,
} from "./query/build-list-query.js";
export type { SqliteDb } from "./query/build-list-query.js";
export { buildGetByIdQuery } from "./query/build-get-query.js";
export { primaryKeyColumn } from "./query/primary-key.js";

export { allowAll } from "./auth/allow-all.js";
export type {
  AuthAdapter,
  AuthorizeArgs,
  Identity,
} from "./auth/auth-adapter.types.js";

export { bulkDeleteAction, defineAction } from "./action/define-action.js";
export type {
  ActionConfig,
  ActionContext,
  ActionDefinition,
  ActionManifest,
  ActionResult,
} from "./action/define-action.types.js";
export {
  CapabilityError,
  createCapabilityDb,
  inProcessExecutor,
  runAction,
} from "./action/run-action.js";
export type { ActionExecutor } from "./action/run-action.js";
export type { ListParams } from "./query/list-query.types.js";

export {
  buildDeleteQuery,
  buildInsertQuery,
  buildUpdateQuery,
} from "./mutation/build-mutations.js";

export {
  deriveInsertSchema,
  deriveUpdateSchema,
  validateInsert,
  validateUpdate,
} from "./validation/derive-schema.js";
export { ValidationError } from "./validation/validation-error.js";
