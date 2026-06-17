import type { Column } from "drizzle-orm";

export type FieldDataType = Column["dataType"];

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
}

export type FieldMap = Record<string, FieldMeta>;

export interface TableIntrospection {
  table: string;
  fields: FieldMap;
  primaryKey: string | null;
}
