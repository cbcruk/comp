import type { CompClient } from "../client/create-client.types.js";
import type { FieldControl } from "../collection-form/collection-form.types.js";

export interface ReferenceSelectProps {
  client: CompClient;
  /** Slug of the referenced collection to pull options from. */
  collection: string;
  /** The form field control this select drives. */
  control: FieldControl;
  /** Row field shown as the option label. */
  labelField: string;
  /** Row field used as the option value (the FK target). Defaults to "id". */
  valueField?: string;
  /** How many options to fetch. Defaults to 100. */
  pageSize?: number;
}
