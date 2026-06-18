import { useEffect, useState, type JSX } from "react";
import type { ReferenceSelectProps } from "./reference-select.types.js";
import { toOptions, type ReferenceOption } from "./reference-select.utils.js";

/**
 * A select whose options come from another collection — the relation (FK)
 * widget. Drop it into a form's `fieldWidgets` for the FK field; the framework
 * never guesses references, the app declares which collection to pull from.
 */
export function ReferenceSelect({
  client,
  collection,
  control,
  labelField,
  valueField = "id",
  pageSize = 100,
}: ReferenceSelectProps): JSX.Element {
  const [options, setOptions] = useState<ReferenceOption[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .list(collection, { pageSize })
      .then((result) => {
        if (!cancelled) setOptions(toOptions(result.data, valueField, labelField));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [client, collection, valueField, labelField, pageSize]);

  const required = control.field.notNull && !control.field.hasDefault;

  return (
    <label>
      {control.field.name}
      <select
        value={control.value}
        required={required}
        onChange={(e) => control.onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span role="alert">{error.message}</span>}
    </label>
  );
}
