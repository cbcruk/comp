import { getTableColumns, getTableName, type Table } from "drizzle-orm";
import type {
  FieldMap,
  FieldMeta,
  TableIntrospection,
} from "./introspect-table.types.js";

/**
 * Build a serializable description of a Drizzle table: one {@link FieldMeta}
 * per column plus the primary key. This is the structural fact the rest of the
 * framework derives from — the list view, validation, and query layer all read
 * from here rather than re-reading the Drizzle table directly.
 */
export function introspectTable(table: Table): TableIntrospection {
  const columns = getTableColumns(table);
  const fields: FieldMap = {};
  let primaryKey: string | null = null;

  for (const [name, column] of Object.entries(columns)) {
    const enumValues = column.enumValues;
    const meta: FieldMeta = {
      name,
      columnName: column.name,
      dataType: column.dataType,
      columnType: column.columnType,
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      primaryKey: column.primary,
      ...(enumValues && enumValues.length > 0 ? { enumValues } : {}),
    };
    fields[name] = meta;
    if (column.primary && primaryKey === null) {
      primaryKey = name;
    }
  }

  return {
    table: getTableName(table),
    fields,
    primaryKey,
  };
}
