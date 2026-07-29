import type { Column } from "drizzle-orm";

export type FieldDataType = Column["dataType"];

/** What a foreign key does to dependent rows; mirrors the SQL clause. */
export type ReferentialAction =
  | "cascade"
  | "restrict"
  | "no action"
  | "set null"
  | "set default";

/**
 * A single-column foreign key seen from the field that holds it: this field
 * points at `table.column`. Both are *database* names, not TypeScript field
 * names — turning them into a collection/field pair needs the whole registry,
 * which is what `resolveRelations` does.
 */
export interface FieldRelation {
  /** Referenced table, as named in the database. */
  table: string;
  /** Referenced column, as named in the database. */
  column: string;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
}

export interface FieldMeta {
  name: string;
  columnName: string;
  dataType: FieldDataType;
  columnType: string;
  notNull: boolean;
  hasDefault: boolean;
  primaryKey: boolean;
  /** Allowed values for enum columns; empty/absent for free-form columns. */
  enumValues?: string[];
  /** Set when this column is a single-column foreign key. */
  relation?: FieldRelation;
}

export type FieldMap = Record<string, FieldMeta>;

/**
 * A foreign key as declared on the table. Composite keys span more than one
 * field, which is why this is kept alongside {@link FieldMeta.relation} — a
 * composite key has no single field to hang off.
 */
export interface TableRelation {
  /** Field names on this table holding the key, in key order. */
  fields: string[];
  /** Referenced table, as named in the database. */
  table: string;
  /** Referenced columns, as named in the database, in key order. */
  columns: string[];
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
}

export interface TableIntrospection {
  table: string;
  fields: FieldMap;
  primaryKey: string | null;
  /** Every foreign key declared on the table, composite ones included. */
  relations: TableRelation[];
}
