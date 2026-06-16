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

export { introspectTable } from "./introspection/introspect-table.js";
export type {
  FieldDataType,
  FieldMap,
  FieldMeta,
  TableIntrospection,
} from "./introspection/introspect-table.types.js";

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
