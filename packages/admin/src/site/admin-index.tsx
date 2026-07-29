import type { ComponentPropsWithoutRef, JSX } from "react";
import { mergeProps } from "../merge-props/merge-props.js";
import type { AdminIndexProps } from "./admin-site.types.js";
import { can } from "./site.utils.js";

/**
 * The site index: every collection this caller can open, and an add link where
 * they may create. Registering a collection is what puts it here — there is no
 * separate menu to keep in step with the registry.
 */
export function AdminIndex({
  collections,
  navigate,
  ...rest
}: AdminIndexProps): JSX.Element {
  if (collections.length === 0) {
    return <p>No collections are available to you.</p>;
  }

  return (
    <nav
      {...mergeProps<ComponentPropsWithoutRef<"nav">>(
        { "aria-label": "Collections" },
        rest,
      )}
    >
      <ul>
        {collections.map((collection) => (
          <li key={collection.slug}>
            <button
              type="button"
              onClick={() => navigate({ view: "list", slug: collection.slug })}
            >
              {collection.labelPlural}
            </button>
            {can(collection, "create") && (
              <button
                type="button"
                aria-label={`Add ${collection.label}`}
                onClick={() => navigate({ view: "add", slug: collection.slug })}
              >
                Add
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
