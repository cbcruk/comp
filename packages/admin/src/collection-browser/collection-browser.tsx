import { useState, type JSX } from "react";
import { toInputValue } from "../collection-form/collection-form.utils.js";
import { CollectionList } from "../collection-list/collection-list.js";
import type { CollectionListProps } from "../collection-list/collection-list.types.js";
import { useCollectionList } from "../hooks/use-collection-list.js";
import type { CollectionBrowserProps } from "./collection-browser.types.js";
import { InlineInput } from "./inline-cell.js";
import { canEditColumn, isEditing } from "./inline-edit.js";
import { hasNextPage, hasPrevPage, pageCount } from "./pagination.js";
import { allSelected, rowId, toIds, toggle, toggleAll } from "./selection.js";
import { nextSort, parseSort } from "./sorting.js";
import { useInlineEdit } from "./use-inline-edit.js";

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

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
  editable = false,
}: CollectionBrowserProps): JSX.Element {
  const { rows, page, pageSize: size, total, query, loading, error, setQuery, reload } =
    useCollectionList(client, collection.slug, pageSize ? { pageSize } : {});

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState<Error | null>(null);
  const edit = useInlineEdit(client, collection.slug, reload);

  const totalPages = pageCount(total, size || 1);
  const filters = query.filters ?? {};
  const pk = collection.primaryKey;
  const currentSort = parseSort(query.sort);

  const editableRenderCell: CollectionListProps["renderCell"] = ({
    column,
    value,
    row,
  }) => {
    const field = collection.fields[column];
    const id = rowId(row, pk);
    if (!field || id === null || !canEditColumn(collection.fields, pk, column)) {
      return displayValue(value);
    }
    if (isEditing(edit.editing, id, column)) {
      return (
        <InlineInput
          field={field}
          value={edit.value}
          busy={edit.busy}
          onChange={edit.change}
          onCommit={() => edit.commit(field)}
          onCancel={edit.cancel}
        />
      );
    }
    return (
      <button
        type="button"
        onClick={() => edit.start(id, column, toInputValue(field, value))}
      >
        {displayValue(value) || "—"}
      </button>
    );
  };

  const cellRenderer = renderCell ?? (editable ? editableRenderCell : undefined);

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
      {edit.error && <p role="alert">{edit.error.message}</p>}

      <CollectionList
        columns={collection.listDisplay}
        rows={rows}
        renderCell={cellRenderer}
        renderEmpty={() => <p>{loading ? "Loading…" : "No records"}</p>}
        sort={{
          field: currentSort?.field ?? null,
          direction: currentSort?.direction ?? null,
          onSort: (column) => setQuery({ sort: nextSort(query.sort, column) }),
        }}
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
