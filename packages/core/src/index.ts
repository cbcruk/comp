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
export type { ListParams } from "./query/list-query.types.js";

export {
  deriveInsertSchema,
  deriveUpdateSchema,
} from "./validation/derive-schema.js";
