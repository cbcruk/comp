/** Turn a slug into words: `order_items` → `Order items`. */
export function humanize(slug: string): string {
  const words = slug
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Drop one plural ending. Slugs default to table names, which are plural by
 * convention, so this is how a collection gets a name for a *single* record —
 * "Delete this order", not "Delete this orders".
 *
 * Deliberately naive: English regular plurals only, and `label` is there to
 * override it. Guessing harder would mean shipping a word list to the edge for
 * a string the author can just write.
 */
export function singularize(word: string): string {
  if (/ies$/i.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|ss|s|x|z)es$/i.test(word)) return word.slice(0, -2);
  if (/ss$/i.test(word)) return word;
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}

/** A collection's display names, defaulted from its slug. */
export function resolveLabels(
  slug: string,
  label?: string,
  labelPlural?: string,
): { label: string; labelPlural: string } {
  const plural = labelPlural ?? humanize(slug);
  return {
    label: label ?? singularize(plural),
    labelPlural: plural,
  };
}
