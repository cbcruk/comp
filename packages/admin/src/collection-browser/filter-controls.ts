import {
  formatFilterValue,
  parseFilterValue,
  type DatePreset,
  type FilterChoices,
  type FilterOption,
  type FilterSummary,
} from "@comp/core";

/** The empty/not-empty pair a nullable column offers, on top of its own values. */
export const NULL_OPTIONS: FilterOption[] = [
  { value: "isnull:true", label: "Empty" },
  { value: "isnull:false", label: "Not empty" },
];

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "past7", label: "Past 7 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

/**
 * How a filter should be rendered. `select` covers everything with a known set
 * of answers; `values` is a select whose answers the current list reports,
 * because only the data knows them; `reference` fetches its answers from the
 * collection the key points at; `text` is the fallback for a column whose
 * values nothing can enumerate.
 */
export type FilterControl = "select" | "values" | "reference" | "text";

export function controlFor(filter: FilterSummary): FilterControl {
  switch (filter.kind) {
    case "choices":
    case "boolean":
    case "date":
      return "select";
    case "values":
      // Its answers come with the list rather than with the collection, so it
      // is a select whose options arrive per request.
      return "values";
    case "relation":
      return filter.collection ? "reference" : "text";
    default:
      return "text";
  }
}

/**
 * What a distinct-value filter offers this time round: the values the column
 * holds, with the empty entry already in place when there are rows without one.
 * The list already encodes each option as its query value, so this is only the
 * lookup by field.
 */
export function choicesFor(
  choices: readonly FilterChoices[] | undefined,
  field: string,
): FilterChoices | undefined {
  return choices?.find((entry) => entry.field === field);
}

/**
 * The options a select-style filter offers, already encoded as the query value
 * they stand for — so choosing one is assignment, not a second translation
 * step that could disagree with the query layer.
 */
export function optionsFor(filter: FilterSummary): FilterOption[] {
  const own =
    filter.kind === "date"
      ? DATE_PRESETS.map((preset) => ({
          value: `preset:${preset.value}`,
          label: preset.label,
        }))
      : filter.options;
  return filter.nullable ? [...own, ...NULL_OPTIONS] : own;
}

/**
 * The label to show for a filter's current value — the matching option's label
 * when there is one, otherwise the raw value. Used for a summary of what is
 * currently narrowing the list.
 */
export function activeLabel(
  filter: FilterSummary,
  raw: string | undefined,
): string | null {
  if (!raw) return null;
  const option = optionsFor(filter).find((entry) => entry.value === raw);
  if (option) return option.label;

  const value = parseFilterValue(raw);
  if (!value) return null;
  if (value.op === "exact") return String(value.value);
  return formatFilterValue(value);
}
