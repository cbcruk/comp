import type { FieldMap, FieldMeta } from "@comp/core";
import type { ReactNode } from "react";
import type { Row } from "../client/create-client.types.js";

export interface FieldControl {
  field: FieldMeta;
  value: string;
  onChange: (value: string) => void;
}

export interface CollectionFormProps {
  fields: FieldMap;
  primaryKey: string | null;
  /** Existing record when editing; omit for create. */
  record?: Row;
  /** Receives the coerced API payload on submit. */
  onSubmit: (payload: Row) => void | Promise<void>;
  /** Override how a single field renders; defaults to a labeled input. */
  renderField?: (control: FieldControl) => ReactNode;
  submitLabel?: string;
  /** Disable the form while a submit is in flight. */
  busy?: boolean;
}
