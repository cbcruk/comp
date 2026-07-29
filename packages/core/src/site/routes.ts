/**
 * The screens an admin site has. Registering a collection is supposed to give
 * you all of them; naming them here is what lets the server, the UI, and any
 * link one of them writes agree on where a record lives.
 */
export type AdminView = "index" | "list" | "add" | "change" | "delete";

export type AdminRoute =
  | { view: "index" }
  | { view: "list"; slug: string }
  | { view: "add"; slug: string }
  | { view: "change"; slug: string; id: string }
  | { view: "delete"; slug: string; id: string };

export const INDEX_ROUTE: AdminRoute = { view: "index" };

/** Where a route lives, as a path. */
export function adminPath(route: AdminRoute): string {
  switch (route.view) {
    case "index":
      return "/";
    case "list":
      return `/${encodeURIComponent(route.slug)}`;
    case "add":
      return `/${encodeURIComponent(route.slug)}/add`;
    case "change":
      return `/${encodeURIComponent(route.slug)}/${encodeURIComponent(route.id)}`;
    case "delete":
      return `/${encodeURIComponent(route.slug)}/${encodeURIComponent(route.id)}/delete`;
  }
}

/**
 * Read a path back into a route. Anything unrecognized is the index rather
 * than an error: a bad admin URL should land somewhere usable, not on a
 * failure screen.
 *
 * `add` is a reserved segment, so a record whose id is literally "add" is
 * unreachable by path — the cost of keeping the URLs readable, and the same
 * trade Django makes with its `add/` segment.
 */
export function parseAdminPath(path: string): AdminRoute {
  const segments = path
    .split("?")[0]!
    .split("/")
    .filter((segment) => segment !== "")
    .map(decodeURIComponent);

  const [slug, second, third] = segments;
  if (!slug || segments.length > 3) return INDEX_ROUTE;
  if (second === undefined) return { view: "list", slug };
  if (second === "add") return { view: "add", slug };
  if (third === "delete") return { view: "delete", slug, id: second };
  if (third === undefined) return { view: "change", slug, id: second };
  return INDEX_ROUTE;
}
