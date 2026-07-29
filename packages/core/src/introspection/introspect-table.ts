import {
  getTableColumns,
  getTableName,
  is,
  type Column,
  type Table,
} from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import type {
  FieldMap,
  FieldMeta,
  ReferentialAction,
  TableIntrospection,
  TableRelation,
} from "./introspect-table.types.js";

/**
 * Read the table's foreign keys. Drizzle exposes these per dialect, so this is
 * scoped to SQLite/D1 like the query layer; a non-SQLite table reports no
 * relations rather than throwing.
 */
function tableRelations(
  table: Table,
  fieldNameByColumn: Map<string, string>,
): TableRelation[] {
  if (!is(table, SQLiteTable)) return [];

  const relations: TableRelation[] = [];
  for (const foreignKey of getTableConfig(table).foreignKeys) {
    const reference = foreignKey.reference();
    relations.push({
      fields: reference.columns.map(
        (column: Column) => fieldNameByColumn.get(column.name) ?? column.name,
      ),
      table: getTableName(reference.foreignTable),
      columns: reference.foreignColumns.map((column: Column) => column.name),
      ...(foreignKey.onDelete
        ? { onDelete: foreignKey.onDelete as ReferentialAction }
        : {}),
      ...(foreignKey.onUpdate
        ? { onUpdate: foreignKey.onUpdate as ReferentialAction }
        : {}),
    });
  }
  return relations;
}

/**
 * Build a serializable description of a Drizzle table: one {@link FieldMeta}
 * per column, the primary key, and the foreign keys. This is the structural
 * fact the rest of the framework derives from — the list view, validation, the
 * query layer, and the relation graph all read from here rather than
 * re-reading the Drizzle table directly.
 *
 * Relations are discovered here rather than hand-declared downstream: an FK is
 * a fact about the schema, so finding it is introspection's job.
 */
export function introspectTable(table: Table): TableIntrospection {
  const columns = getTableColumns(table);
  const fields: FieldMap = {};
  const fieldNameByColumn = new Map<string, string>();
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
    fieldNameByColumn.set(column.name, name);
    if (column.primary && primaryKey === null) {
      primaryKey = name;
    }
  }

  const relations = tableRelations(table, fieldNameByColumn);

  // Hang single-column keys off their field so widgets and label resolution
  // can read them without walking the table's key list. Composite keys stay
  // table-level only — they have no single field to belong to.
  for (const relation of relations) {
    const [field] = relation.fields;
    const [column] = relation.columns;
    if (relation.fields.length !== 1 || !field || !column) continue;
    const meta = fields[field];
    if (!meta) continue;
    meta.relation = {
      table: relation.table,
      column,
      ...(relation.onDelete ? { onDelete: relation.onDelete } : {}),
      ...(relation.onUpdate ? { onUpdate: relation.onUpdate } : {}),
    };
  }

  return {
    table: getTableName(table),
    fields,
    primaryKey,
    relations,
  };
}
