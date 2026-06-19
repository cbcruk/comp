import type { FieldMeta } from "@comp/core";
import type { JSX } from "react";
import {
  inputTypeFor,
  optionsFor,
} from "../collection-form/collection-form.utils.js";

export interface InlineInputProps {
  field: FieldMeta;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

/**
 * The editing control for a single cell. Enter commits, Escape cancels, blur
 * commits; checkbox and select commit on change. Input type mirrors the form.
 */
export function InlineInput({
  field,
  value,
  busy,
  onChange,
  onCommit,
  onCancel,
}: InlineInputProps): JSX.Element {
  const type = inputTypeFor(field);

  function onKeyDown(e: { key: string; preventDefault: () => void }): void {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  if (type === "select") {
    const options = optionsFor(field) ?? [];
    return (
      <select
        autoFocus
        aria-label={field.name}
        disabled={busy}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (type === "checkbox") {
    return (
      <input
        type="checkbox"
        autoFocus
        aria-label={field.name}
        disabled={busy}
        checked={value === "true"}
        onChange={(e) => onChange(e.target.checked ? "true" : "")}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <input
      type={type}
      autoFocus
      aria-label={field.name}
      disabled={busy}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={onKeyDown}
    />
  );
}
