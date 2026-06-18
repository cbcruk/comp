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
