import type { JSX } from "react";
import type { CollectionListProps } from "./collection-list.types.js";

function defaultCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Render a collection's list view from the core data contract. Purely
 * presentational — it renders what the query layer resolved and nothing more.
 * Cell/header/empty rendering are render-prop slots rather than prop flags.
 */
const SORT_INDICATOR = { asc: " ▲", desc: " ▼" } as const;

export function CollectionList({
  columns,
  rows,
  renderCell,
  renderHeader,
  renderEmpty,
  selection,
  sort,
}: CollectionListProps): JSX.Element {
  if (rows.length === 0 && renderEmpty) {
    return <>{renderEmpty()}</>;
  }

  function headerContent(column: string): JSX.Element | string {
    const label = renderHeader ? renderHeader(column) : column;
    if (!sort) return <>{label}</>;
    const active = sort.field === column ? sort.direction : null;
    return (
      <button type="button" onClick={() => sort.onSort(column)}>
        {label}
        {active ? SORT_INDICATOR[active] : ""}
      </button>
    );
  }

  function ariaSort(column: string): "ascending" | "descending" | "none" {
    if (!sort || sort.field !== column || !sort.direction) return "none";
    return sort.direction === "asc" ? "ascending" : "descending";
  }

  return (
    <table>
      <thead>
        <tr>
          {selection && (
            <th>
              {selection.onToggleAll && (
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={selection.allSelected ?? false}
                  onChange={selection.onToggleAll}
                />
              )}
            </th>
          )}
          {columns.map((column) => (
            <th key={column} aria-sort={sort ? ariaSort(column) : undefined}>
              {headerContent(column)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const id = selection?.getRowId(row) ?? null;
          return (
            <tr key={id ?? index}>
              {selection && (
                <td>
                  {id !== null && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${id}`}
                      checked={selection.selected.has(id)}
                      onChange={() => selection.onToggle(id)}
                    />
                  )}
                </td>
              )}
              {columns.map((column) => (
                <td key={column}>
                  {renderCell
                    ? renderCell({ column, value: row[column], row })
                    : defaultCell(row[column])}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
