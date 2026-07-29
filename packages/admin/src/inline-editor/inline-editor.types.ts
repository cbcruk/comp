import type { FieldMap, InlineSummary } from "@comp/core";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { FieldControl } from "../collection-form/collection-form.types.js";
import type { InlineRow } from "./inline-rows.js";

export interface InlineEditorProps
  extends Omit<ComponentPropsWithoutRef<"fieldset">, "onChange"> {
  /** The inline as the server resolved it. */
  inline: InlineSummary;
  /** The child collection's fields. */
  fields: FieldMap;
  primaryKey: string | null;
  /** Row state, owned by the caller so one submit can carry every inline. */
  rows: InlineRow[];
  onChange: (rows: InlineRow[]) => void;
  /** Per-field render overrides, keyed by field name. */
  fieldWidgets?: Record<string, (control: FieldControl) => ReactNode>;
  /** Messages keyed by `<rowIndex>.<field>`, from a failed save. */
  errors?: Record<string, string[]>;
  legend?: ReactNode;
  addLabel?: string;
}
