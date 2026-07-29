import type { FilterSummary } from "@comp/core";
import type { JSX } from "react";
import type { CompClient } from "../client/create-client.types.js";
import { useReferenceOptions } from "./use-reference-options.js";
import { NULL_OPTIONS, controlFor, optionsFor } from "./filter-controls.js";

export interface FilterFieldProps {
  client: CompClient;
  filter: FilterSummary;
  value: string;
  onChange: (value: string) => void;
}

/**
 * One filter control, chosen by what the column can actually be asked. An enum
 * offers its values, a date its windows, a foreign key the records it points
 * at, and a nullable column empty/not-empty — none of which the app configures,
 * because the schema already said so.
 */
export function FilterField({
  client,
  filter,
  value,
  onChange,
}: FilterFieldProps): JSX.Element {
  const control = controlFor(filter);
  const references = useReferenceOptions(
    client,
    control === "reference" ? filter.collection : undefined,
    filter.labelField ?? null,
    filter.targetField,
  );

  if (control === "text") {
    return (
      <label>
        {filter.field}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  const options =
    control === "reference"
      ? [...references, ...(filter.nullable ? NULL_OPTIONS : [])]
      : optionsFor(filter);

  return (
    <label>
      {filter.field}
      <select
        value={value}
        aria-label={`Filter by ${filter.field}`}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
