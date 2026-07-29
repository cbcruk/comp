import { adminPath, parseAdminPath, type AdminRoute } from "@comp/core";
import { useCallback, useEffect, useState } from "react";

export interface HashRoute {
  route: AdminRoute;
  navigate: (route: AdminRoute) => void;
}

/**
 * Keep the admin's current screen in the URL fragment.
 *
 * `AdminSite` is controlled — it takes a route and reports where you clicked —
 * so an app that already has a router keeps using it. This is the batteries
 * for one that does not: the fragment means no server route config, and back
 * and refresh keep working, which is most of what a router was for here.
 */
export function useHashRoute(): HashRoute {
  const read = (): AdminRoute =>
    parseAdminPath(
      typeof window === "undefined" ? "/" : window.location.hash.slice(1),
    );

  const [route, setRoute] = useState<AdminRoute>(read);

  useEffect(() => {
    const onChange = (): void => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((next: AdminRoute) => {
    window.location.hash = adminPath(next);
    // `hashchange` does not fire when the hash is unchanged; set it anyway so
    // navigating to the screen you are already on is not a dead click.
    setRoute(next);
  }, []);

  return { route, navigate };
}
