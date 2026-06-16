import type { ZodIssue } from "zod";

/**
 * Thrown when an input fails the schema derived from a collection. Carries the
 * raw Zod issues so the server can shape a 400 response without re-validating.
 * A plain typed throw — no Result channel until concrete pain justifies one.
 */
export class ValidationError extends Error {
  readonly issues: ZodIssue[];

  constructor(issues: ZodIssue[]) {
    super("Validation failed");
    this.name = "ValidationError";
    this.issues = issues;
  }
}
