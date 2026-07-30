import type { ResolvedForm } from "./form.types.js";

/**
 * Reduce text to a URL-safe slug: letters and digits, single dashes between
 * words, nothing at the ends.
 *
 * Deliberately ASCII-folding-free — a non-Latin title becomes a short slug or
 * an empty one, and the author can type over it. Guessing at transliteration
 * would mean shipping a table to the edge to sometimes get a name wrong.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The slug a target field would get from its sources' current values. */
export function prepopulatedValue(
  sources: readonly string[],
  values: Record<string, string>,
): string {
  return slugify(sources.map((source) => values[source] ?? "").join(" "));
}

/**
 * Apply prepopulation after one field changed.
 *
 * Two rules, both from how Django's admin behaves. It only fills a field in
 * while adding — rewriting a live record's slug because someone fixed a typo in
 * its title would break every link to it. And it stops as soon as the target is
 * edited by hand: once a human has said what the slug is, the title no longer
 * gets to.
 *
 * `touched` is the set of targets the user has taken over; the caller keeps it
 * and passes it back.
 */
export function applyPrepopulation(
  form: ResolvedForm,
  values: Record<string, string>,
  changed: string,
  options: { adding: boolean; touched: ReadonlySet<string> },
): Record<string, string> {
  if (!options.adding) return values;

  let next = values;
  for (const [target, sources] of Object.entries(form.prepopulated)) {
    if (target === changed) continue;
    if (options.touched.has(target)) continue;
    if (!sources.includes(changed)) continue;
    if (next === values) next = { ...values };
    next[target] = prepopulatedValue(sources, values);
  }
  return next;
}
