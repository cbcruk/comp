import type { JSX } from "react";
import { CollectionList } from "../collection-list/collection-list.js";
import { useCollectionList } from "../hooks/use-collection-list.js";
import type { CollectionBrowserProps } from "./collection-browser.types.js";
import { hasNextPage, hasPrevPage, pageCount } from "./pagination.js";

/**
 * List view for a collection: search, per-column filters, the table, and
 * pagination — all driven by the query state in {@link useCollectionList} and
 * resolved server-side. The UI sets query params; the query layer does the work.
 */
export function CollectionBrowser({
  client,
  collection,
  pageSize,
  renderCell,
}: CollectionBrowserProps): JSX.Element {
  const { rows, page, pageSize: size, total, query, loading, error, setQuery } =
    useCollectionList(client, collection.slug, pageSize ? { pageSize } : {});

  const totalPages = pageCount(total, size || 1);
  const filters = query.filters ?? {};

  return (
    <div>
      {collection.search.length > 0 && (
        <input
          type="search"
          placeholder={`Search ${collection.slug}`}
          value={query.q ?? ""}
          onChange={(e) => setQuery({ q: e.target.value })}
        />
      )}

      {collection.filters.map((field) => (
        <label key={field}>
          {field}
          <input
            type="text"
            value={filters[field] ?? ""}
            onChange={(e) =>
              setQuery({ filters: { ...filters, [field]: e.target.value } })
            }
          />
        </label>
      ))}

      {error && <p role="alert">{error.message}</p>}

      <CollectionList
        columns={collection.listDisplay}
        rows={rows}
        renderCell={renderCell}
        renderEmpty={() => <p>{loading ? "Loading…" : "No records"}</p>}
      />

      <nav aria-label="Pagination">
        <button
          type="button"
          disabled={!hasPrevPage(page)}
          onClick={() => setQuery({ page: page - 1 })}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages} ({total} total)
        </span>
        <button
          type="button"
          disabled={!hasNextPage(page, total, size || 1)}
          onClick={() => setQuery({ page: page + 1 })}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
