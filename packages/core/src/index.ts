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

export {
  coerceFilterOperand,
  dateRangeFor,
  formatFilterValue,
  parseFilterValue,
} from "./filters/filter-value.js";
export {
  DEFAULT_VALUES_LIMIT,
  filterFields,
  filterSummaries,
  inferFilterKind,
  resolveFilters,
} from "./filters/resolve-filters.js";
export { collectFilterChoices } from "./filters/collect-choices.js";
export type {
  DatePreset,
  FilterChoices,
  FilterConfig,
  FilterKind,
  FilterMap,
  FilterOption,
  FilterSummary,
  FilterValue,
  ResolvedFilter,
} from "./filters/filter.types.js";
export {
  filterCondition,
  filterConditions,
} from "./query/build-filter-where.js";
export { buildDistinctValuesQuery } from "./query/build-choices-query.js";

export { resolveForm, stripReadonly } from "./form/resolve-form.js";
export type { FormConfig } from "./form/resolve-form.js";
export { formFields, writableFields } from "./form/form.types.js";
export type {
  FieldsetConfig,
  FormFieldEntry,
  ResolvedFieldset,
  ResolvedForm,
} from "./form/form.types.js";
export {
  applyPrepopulation,
  prepopulatedValue,
  slugify,
} from "./form/prepopulate.js";

export {
  changedFields,
  describeHistory,
  historyLabel,
} from "./history/changed-fields.js";
export type {
  HistoryAction,
  HistoryEntry,
  HistoryQuery,
  HistoryStore,
} from "./history/history.types.js";
export {
  createDrizzleHistoryStore,
  createMemoryHistoryStore,
} from "./history/history-store.js";
export {
  historyEntries,
  parseFields,
  serializeFields,
} from "./history/history-schema.js";
export {
  createRecord,
  deleteRecord,
  updateRecord,
} from "./mutation/mutate-record.js";
export type { MutationContext } from "./mutation/mutate-record.js";

export {
  breadcrumbFor,
  bucketsFor,
  datePathRange,
  daysInMonth,
  formatDatePath,
  levelOf,
  parseDatePath,
} from "./hierarchy/date-path.js";
export type {
  DatePath,
  HierarchyBucket,
  HierarchyCrumb,
  HierarchyLevel,
} from "./hierarchy/date-path.js";
export { collectDateHierarchy } from "./hierarchy/resolve-hierarchy.js";
export type {
  DateHierarchy,
  HierarchyChoice,
} from "./hierarchy/resolve-hierarchy.js";
export {
  buildBucketCountQuery,
  buildDateBoundQuery,
  hierarchyColumn,
} from "./query/build-hierarchy-query.js";
export { buildListWhere } from "./query/build-list-query.js";

export { resolveSearch, splitSearchTerms } from "./search/resolve-search.js";
export type {
  ResolvedSearch,
  SearchConfig,
  SearchLookup,
  SearchTraversal,
} from "./search/search.types.js";
export {
  searchCondition,
  searchConditions,
} from "./query/build-search-where.js";

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

export { humanize, resolveLabels, singularize } from "./site/labels.js";
export { INDEX_ROUTE, adminPath, parseAdminPath } from "./site/routes.js";
export type { AdminRoute, AdminView } from "./site/routes.js";
export {
  collectDeleteImpact,
  resolveDeleteRelations,
} from "./site/delete-impact.js";
export type {
  DeleteEffect,
  DeleteImpact,
  DeleteImpactEntry,
  DeleteRelation,
} from "./site/delete-impact.js";
export {
  buildReferenceCountQuery,
  columnFor,
} from "./query/build-relation-query.js";
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
