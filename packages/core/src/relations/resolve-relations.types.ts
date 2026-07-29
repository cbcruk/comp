import type { ReferentialAction } from "../introspection/introspect-table.types.js";

/** An FK on this collection, resolved to the collection it points at. */
export interface OutboundRelation {
  /** Field on this collection holding the foreign key. */
  field: string;
  /** Slug of the collection managing the referenced table. */
  collection: string;
  /** Field on the target collection the key points at (usually its pk). */
  targetField: string;
  /** The target's label field, so a UI can show a name instead of an id. */
  labelField: string | null;
}

/** An FK on some *other* collection that points at this one. */
export interface InboundRelation {
  /** Slug of the collection whose foreign key points here. */
  collection: string;
  /** Field on that collection holding the foreign key. */
  field: string;
  /** Field on this collection being referenced (usually its pk). */
  targetField: string;
  /** What the key says happens to those rows when this record is deleted. */
  onDelete?: ReferentialAction;
}

/**
 * The relation graph over a set of collections, both directions. Outbound
 * drives relation widgets and FK labels; inbound is what an inline editor for
 * dependent records reads.
 */
export interface RelationGraph {
  /** Collection slug → its foreign keys. */
  outbound: Record<string, OutboundRelation[]>;
  /** Collection slug → foreign keys pointing at it. */
  inbound: Record<string, InboundRelation[]>;
}
