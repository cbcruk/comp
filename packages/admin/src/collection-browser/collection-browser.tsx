import { useState, type JSX } from "react";
import { CollectionList } from "../collection-list/collection-list.js";
import { useCollectionList } from "../hooks/use-collection-list.js";
import type { CollectionBrowserProps } from "./collection-browser.types.js";
import { hasNextPage, hasPrevPage, pageCount } from "./pagination.js";
import { allSelected, rowId, toIds, toggle, toggleAll } from "./selection.js";

/**
 * List view for a collection: search, per-column filters, the table with bulk
 * selection, manifest actions, and pagination. All data resolves server-side —
 * the UI only sets query params and dispatches declared actions over the
 * selected ids.
 */
export function CollectionBrowser({
  client,
  collection,
  pageSize,
  renderCell,
}: CollectionBrowserProps): JSX.Element {
  const { rows, page, pageSize: size, total, query, loading, error, setQuery, reload } =
    useCollectionList(client, collection.slug, pageSize ? { pageSize } : {});

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState<Error | null>(null);

  const totalPages = pageCount(total, size || 1);
  const filters = query.filters ?? {};
  const pk = collection.primaryKey;

  async function runAction(name: string): Promise<void> {
    setRunning(true);
    setActionError(null);
    try {
      await client.action(collection.slug, name, { ids: toIds(selected) });
      setSelected(new Set());
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setRunning(false);
    }
  }

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

      {collection.actions.length > 0 && (
        <div role="toolbar" aria-label="Actions">
          {collection.actions.map((action) => (
            <button
              key={action.name}
              type="button"
              disabled={selected.size === 0 || running}
              onClick={() => runAction(action.name)}
            >
              {action.name} ({selected.size})
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert">{error.message}</p>}
      {actionError && <p role="alert">{actionError.message}</p>}

      <CollectionList
        columns={collection.listDisplay}
        rows={rows}
        renderCell={renderCell}
        renderEmpty={() => <p>{loading ? "Loading…" : "No records"}</p>}
        selection={{
          getRowId: (row) => rowId(row, pk),
          selected,
          onToggle: (id) => setSelected((prev) => toggle(prev, id)),
          onToggleAll: () =>
            setSelected((prev) => toggleAll(rows, pk, prev)),
          allSelected: allSelected(rows, pk, selected),
        }}
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
