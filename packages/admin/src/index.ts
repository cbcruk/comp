export { mergeProps } from "./merge-props/merge-props.js";

export { CollectionList } from "./collection-list/collection-list.js";
export type {
  CollectionListProps,
  ColumnSort,
  Row,
  RowSelection,
} from "./collection-list/collection-list.types.js";

export { CollectionForm } from "./collection-form/collection-form.js";
export type {
  CollectionFormProps,
  FieldControl,
} from "./collection-form/collection-form.types.js";
export {
  editableFields,
  fromInputValue,
  initialValues,
  inputTypeFor,
  optionsFor,
  toInputValue,
  toPayload,
} from "./collection-form/collection-form.utils.js";
export type { InputType } from "./collection-form/collection-form.utils.js";

export {
  extractIssues,
  fieldMessage,
  inlineIssuesByRow,
  issuesByField,
  ownIssues,
} from "./validation/issues.js";
export type { FieldIssue } from "./validation/issues.js";

export { createClient } from "./client/create-client.js";
export { CompClientError } from "./client/client-error.js";
export type {
  ClientOptions,
  CollectionSummary,
  CompClient,
  ListQuery,
  ListResult,
  RecordResult,
} from "./client/create-client.types.js";

export { CollectionBrowser } from "./collection-browser/collection-browser.js";
export type { CollectionBrowserProps } from "./collection-browser/collection-browser.types.js";
export {
  clampPage,
  hasNextPage,
  hasPrevPage,
  pageCount,
} from "./collection-browser/pagination.js";
export {
  allSelected,
  rowId,
  toggle,
  toggleAll,
  toIds,
} from "./collection-browser/selection.js";
export { nextSort, parseSort } from "./collection-browser/sorting.js";
export { FilterField } from "./collection-browser/filter-field.js";
export type { FilterFieldProps } from "./collection-browser/filter-field.js";
export {
  DATE_PRESETS,
  NULL_OPTIONS,
  activeLabel,
  controlFor,
  optionsFor as filterOptionsFor,
} from "./collection-browser/filter-controls.js";
export type { FilterControl } from "./collection-browser/filter-controls.js";
export { useReferenceOptions } from "./collection-browser/use-reference-options.js";
export type { ParsedSort } from "./collection-browser/sorting.js";
export {
  buildLabelMap,
  referencesFromRelations,
  resolveLabel,
} from "./collection-browser/reference-labels.js";
export type { ReferenceConfig } from "./collection-browser/reference-labels.js";
export { useReferenceLabels } from "./collection-browser/use-reference-labels.js";
export { canEditColumn, isEditing } from "./collection-browser/inline-edit.js";
export type { EditingCell } from "./collection-browser/inline-edit.js";
export { useInlineEdit } from "./collection-browser/use-inline-edit.js";
export type { UseInlineEditResult } from "./collection-browser/use-inline-edit.js";
export { InlineInput } from "./collection-browser/inline-cell.js";
export type { InlineInputProps } from "./collection-browser/inline-cell.js";

export { toastReducer } from "./toast/toast-store.js";
export type { Toast, ToastAction, ToastKind } from "./toast/toast-store.js";
export { useToasts } from "./toast/use-toasts.js";
export type { UseToastsResult } from "./toast/use-toasts.js";
export { Toasts } from "./toast/toasts.js";
export type { ToastsProps } from "./toast/toasts.js";

export { useRecord } from "./hooks/use-record.js";
export type { UseRecordResult } from "./hooks/use-record.js";
export { useCollectionList } from "./hooks/use-collection-list.js";
export type { UseCollectionListResult } from "./hooks/use-collection-list.js";
export { applyPatch } from "./hooks/row-patch.js";

export { InlineEditor } from "./inline-editor/inline-editor.js";
export type { InlineEditorProps } from "./inline-editor/inline-editor.types.js";
export {
  addInlineRow,
  inlineRowsFrom,
  hasInlineChanges,
  inlineFields,
  removeInlineRow,
  restoreInlineRow,
  setInlineValue,
  toInlineWrite,
} from "./inline-editor/inline-rows.js";
export type { InlineRow } from "./inline-editor/inline-rows.js";

export { ReferenceSelect } from "./reference-select/reference-select.js";
export type { ReferenceSelectProps } from "./reference-select/reference-select.types.js";
export { toOptions } from "./reference-select/reference-select.utils.js";
export type { ReferenceOption } from "./reference-select/reference-select.utils.js";
export { referenceWidgets } from "./reference-select/reference-widgets.js";

export { createPasskeyClient } from "./passkey/passkey-client.js";
export type {
  PasskeyClient,
  PasskeyClientOptions,
  WebAuthnBrowser,
} from "./passkey/passkey-client.types.js";
export { PasskeyLogin } from "./passkey/passkey-login.js";
export type { PasskeyLoginProps } from "./passkey/passkey-login.js";
