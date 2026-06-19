import type { FieldMeta } from "@comp/core";
import { useState } from "react";
import type { CompClient } from "../client/create-client.types.js";
import { fromInputValue } from "../collection-form/collection-form.utils.js";
import { extractIssues, fieldMessage } from "../validation/issues.js";
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
 *
 * `applyOptimistic` (optional) patches the visible row before the request; a
 * `reload` on both success and error reconciles with the server (or reverts).
 */
export function useInlineEdit(
  client: CompClient,
  slug: string,
  onSaved: () => void,
  applyOptimistic?: (id: string, field: string, value: unknown) => void,
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
    const coerced = fromInputValue(field, value);
    applyOptimistic?.(id, name, coerced);
    setBusy(true);
    setError(null);
    client
      .update(slug, id, { [name]: coerced })
      .then(() => {
        setEditing(null);
      })
      .catch((err: unknown) => {
        const issueMessage = fieldMessage(extractIssues(err), name);
        if (issueMessage) {
          setError(new Error(`${name}: ${issueMessage}`));
        } else {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        setBusy(false);
        // Reconcile with the server: confirms the optimistic value on success,
        // reverts it on error.
        onSaved();
      });
  }

  return { editing, value, busy, error, start, change: setValue, cancel, commit };
}
