import type { ComponentPropsWithoutRef, JSX } from "react";
import { CollectionBrowser } from "../collection-browser/collection-browser.js";
import { mergeProps } from "../merge-props/merge-props.js";
import { AdminIndex } from "./admin-index.js";
import type { AdminSiteProps } from "./admin-site.types.js";
import { DeleteScreen } from "./delete-screen.js";
import { HistoryScreen } from "./history-screen.js";
import { RecordScreen } from "./record-screen.js";
import { can } from "./site.utils.js";

/**
 * The admin site: register collections and you get the screens, rather than an
 * app assembling one per collection by hand. Index, list, add, change, delete
 * confirmation — each derived from the same declarations everything else reads.
 *
 * Controlled on purpose. It takes the current route and reports navigation, so
 * an app with its own router keeps it; `useHashRoute` is the drop-in for one
 * without. Any screen can be replaced through `renderScreen` — headless here
 * means replaceable, not merely unstyled.
 */
export function AdminSite({
  client,
  collections,
  route,
  onNavigate,
  onNotify,
  fieldWidgets,
  renderScreen,
  header,
  title = "Admin",
  ...rest
}: AdminSiteProps): JSX.Element {
  const collection =
    route.view === "index"
      ? undefined
      : collections.find((entry) => entry.slug === route.slug);

  function screen(): JSX.Element {
    if (route.view === "index") {
      return <AdminIndex collections={collections} navigate={onNavigate} />;
    }
    if (!collection) {
      return (
        <section>
          <p role="alert">No collection named &quot;{route.slug}&quot; is available.</p>
          <button type="button" onClick={() => onNavigate({ view: "index" })}>
            Back to the index
          </button>
        </section>
      );
    }

    const replacement = renderScreen?.({
      client,
      collection,
      route,
      navigate: onNavigate,
    });
    if (replacement !== undefined) return <>{replacement}</>;

    switch (route.view) {
      case "list":
        return (
          <section>
            <h2>{collection.labelPlural}</h2>
            {can(collection, "create") && (
              <button
                type="button"
                onClick={() => onNavigate({ view: "add", slug: collection.slug })}
              >
                Add {collection.label.toLowerCase()}
              </button>
            )}
            <CollectionBrowser
              client={client}
              collection={collection}
              {...(onNotify ? { onNotify } : {})}
              {...(can(collection, "read")
                ? {
                    onOpenRecord: (id: string) =>
                      onNavigate({ view: "change", slug: collection.slug, id }),
                  }
                : {})}
            />
          </section>
        );
      case "add":
      case "change":
        return (
          <RecordScreen
            client={client}
            collection={collection}
            collections={collections}
            id={route.view === "change" ? route.id : null}
            navigate={onNavigate}
            {...(onNotify ? { onNotify } : {})}
            {...(fieldWidgets?.[collection.slug]
              ? { fieldWidgets: fieldWidgets[collection.slug] }
              : {})}
          />
        );
      case "history":
        return (
          <HistoryScreen
            client={client}
            collection={collection}
            id={route.id}
            navigate={onNavigate}
          />
        );
      case "delete":
        return (
          <DeleteScreen
            client={client}
            collection={collection}
            id={route.id}
            navigate={onNavigate}
            {...(onNotify ? { onNotify } : {})}
          />
        );
    }
  }

  return (
    <div {...mergeProps<ComponentPropsWithoutRef<"div">>({}, rest)}>
      <header>
        <button type="button" onClick={() => onNavigate({ view: "index" })}>
          {title}
        </button>
        {header}
      </header>
      {screen()}
    </div>
  );
}
