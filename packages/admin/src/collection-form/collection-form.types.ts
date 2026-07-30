import type { FieldMap, FieldMeta, ResolvedForm } from "@comp/core";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { Row } from "../client/create-client.types.js";

export interface FieldControl {
  field: FieldMeta;
  value: string;
  onChange: (value: string) => void;
}

export interface CollectionFormProps
  extends Omit<ComponentPropsWithoutRef<"form">, "onSubmit"> {
  fields: FieldMap;
  primaryKey: string | null;
  /**
   * The collection's resolved layout: groups, readonly fields, prepopulation,
   * radios. Omit it and every editable field renders one per line.
   */
  form?: ResolvedForm;
  /** Existing record when editing; omit for create. */
  record?: Row;
  /** Receives the coerced API payload on submit. */
  onSubmit: (payload: Row) => void | Promise<void>;
  /** Override how a single field renders; defaults to a labeled input. */
  renderField?: (control: FieldControl) => ReactNode;
  /** Per-field render overrides (e.g. a relation select), keyed by field name. */
  fieldWidgets?: Record<string, (control: FieldControl) => ReactNode>;
  /**
   * Rendered after the fields, inside the form — where an `InlineEditor` goes,
   * so a record and its child rows are submitted by the same button.
   */
  children?: ReactNode;
  submitLabel?: string;
  /** Disable the form while a submit is in flight. */
  busy?: boolean;
}
