import type { FieldMeta } from "@comp/core";
import { useState } from "react";
import type { CompClient } from "../client/create-client.types.js";
import { fromInputValue } from "../collection-form/collection-form.utils.js";
import type { EditingCell } from "./inline-edit.js";

export interface UseInlineEditResult {
  editing: EditingCell | null;
  value: string;
  busy: boolean;
  error: Error | null;
  start: (id: string, field: string, current: string) => void;
  change: (value: string) => void;
  cancel: () => void;
  /** Coerce the draft for `field` and PATCH it; reloads via `onSaved`. */
  commit: (field: FieldMeta) => void;
}

/**
 * Own the single editing cell and its draft, committing through the client's
 * update — the same write path everything else uses. Coercion reuses the
 * form's `fromInputValue`, so inline edits and the form agree on types.
 */
export function useInlineEdit(
  client: CompClient,
  slug: string,
  onSaved: () => void,
): UseInlineEditResult {
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  function start(id: string, field: string, current: string): void {
    setEditing({ id, field });
    setValue(current);
    setError(null);
  }

  function cancel(): void {
    setEditing(null);
    setError(null);
  }

  function commit(field: FieldMeta): void {
    if (!editing || busy) return;
    const { id, field: name } = editing;
    setBusy(true);
    setError(null);
    client
      .update(slug, id, { [name]: fromInputValue(field, value) })
      .then(() => {
        setEditing(null);
        onSaved();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => setBusy(false));
  }

  return { editing, value, busy, error, start, change: setValue, cancel, commit };
}
