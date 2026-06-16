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
export function CollectionList({
  columns,
  rows,
  renderCell,
  renderHeader,
  renderEmpty,
}: CollectionListProps): JSX.Element {
  if (rows.length === 0 && renderEmpty) {
    return <>{renderEmpty()}</>;
  }

  return (
    <table>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{renderHeader ? renderHeader(column) : column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {columns.map((column) => (
              <td key={column}>
                {renderCell
                  ? renderCell({ column, value: row[column], row })
                  : defaultCell(row[column])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
