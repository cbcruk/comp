export interface FieldIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Pull Zod-style issues out of a thrown error. Works on a CompClientError
 * (issues live on `.body.issues`) or any object carrying `issues` directly.
 */
export function extractIssues(error: unknown): FieldIssue[] | null {
  if (!error || typeof error !== "object") return null;
  const source = "body" in error ? (error as { body: unknown }).body : error;
  if (!source || typeof source !== "object" || !("issues" in source)) return null;
  const issues = (source as { issues: unknown }).issues;
  return Array.isArray(issues) ? (issues as FieldIssue[]) : null;
}

/** Group issue messages by their leading path segment (the field name). */
export function issuesByField(issues: FieldIssue[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_";
    (map[key] ??= []).push(issue.message);
  }
  return map;
}

/** First issue message for a given field, or null. */
export function fieldMessage(
  issues: FieldIssue[] | null,
  field: string,
): string | null {
  if (!issues) return null;
  const hit = issues.find(
    (issue) => issue.path.length > 0 && String(issue.path[0]) === field,
  );
  return hit ? hit.message : null;
}

/**
 * Issues belonging to one inline, keyed `<rowIndex>.<field>` — the shape
 * `InlineEditor` puts messages in. The server prefixes an inline's issue paths
 * with `inlines.<slug>.<index>`, so a nested failure still lands on the exact
 * row and field that caused it instead of collapsing into one form-level error.
 */
export function inlineIssuesByRow(
  issues: FieldIssue[],
  slug: string,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const issue of issues) {
    const [scope, collection, index, ...rest] = issue.path;
    if (scope !== "inlines" || collection !== slug || index === undefined) continue;
    const key = `${String(index)}.${rest.length > 0 ? String(rest[0]) : "_"}`;
    (map[key] ??= []).push(issue.message);
  }
  return map;
}

/** Issues that belong to the record itself, not to any of its inlines. */
export function ownIssues(issues: FieldIssue[]): FieldIssue[] {
  return issues.filter((issue) => issue.path[0] !== "inlines");
}
