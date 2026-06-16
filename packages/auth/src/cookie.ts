export interface CookieOptions {
  maxAge?: number;
  path?: string;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

/** Serialize an HttpOnly session cookie suitable for a `Set-Cookie` header. */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  const parts = [`${name}=${value}`, "HttpOnly", `Path=${options.path ?? "/"}`];
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.secure ?? true) parts.push("Secure");
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

/** Parse a `Cookie` header into a name→value map. */
export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const name = pair.slice(0, index).trim();
    if (name) cookies[name] = pair.slice(index + 1).trim();
  }
  return cookies;
}

/** Read a single cookie value off a request. */
export function readCookie(request: Request, name: string): string | null {
  return parseCookies(request.headers.get("cookie"))[name] ?? null;
}
