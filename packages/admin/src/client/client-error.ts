/** A non-2xx response from the admin API. Mirrors the server's typed errors. */
export class CompClientError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with status ${status}`,
    );
    this.name = "CompClientError";
    this.status = status;
    this.body = body;
  }
}
