import type { ManyToManySummary } from "@comp/core";
import { type ComponentPropsWithoutRef, type JSX } from "react";
import type { CompClient } from "../client/create-client.types.js";
import { useReferenceOptions } from "../collection-browser/use-reference-options.js";
import { mergeProps } from "../merge-props/merge-props.js";
import { isLinked, toggleLink } from "./links.js";

export interface ManyToManySelectProps
  extends Omit<ComponentPropsWithoutRef<"fieldset">, "onChange"> {
  client: CompClient;
  /** The relationship, as the server resolved it. */
  relation: ManyToManySummary;
  /** Ids currently linked. */
  value: readonly unknown[];
  onChange: (next: unknown[]) => void;
  /** Heading for the group; defaults to the relationship's name. */
  legend?: string;
}

/**
 * The widget for a many-to-many: every record on the far side, with the linked
 * ones checked.
 *
 * Checkboxes rather than a multi-select, for the reason Django moved away from
 * one: a `<select multiple>` loses the whole selection to a stray click, and
 * the set is the value here — there is no "changed one row" to fall back on.
 *
 * The options come from the collection the relationship names, fetched the way
 * a relation filter's are. Nothing here is told which collection that is.
 */
export function ManyToManySelect({
  client,
  relation,
  value,
  onChange,
  legend,
  ...rest
}: ManyToManySelectProps): JSX.Element {
  const options = useReferenceOptions(
    client,
    relation.collection,
    relation.labelField,
    relation.targetKey,
  );

  return (
    <fieldset {...mergeProps<ComponentPropsWithoutRef<"fieldset">>({}, rest)}>
      <legend>{legend ?? relation.name}</legend>
      {options.length === 0 && <p>No {relation.collection} to link</p>}
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="checkbox"
            name={relation.name}
            value={option.value}
            checked={isLinked(value, option.value)}
            onChange={() => onChange(toggleLink(value, option.value))}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
