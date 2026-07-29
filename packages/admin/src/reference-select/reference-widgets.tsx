import type { OutboundRelation } from "@comp/core";
import type { ReactNode } from "react";
import type { CompClient } from "../client/create-client.types.js";
import type { FieldControl } from "../collection-form/collection-form.types.js";
import { ReferenceSelect } from "./reference-select.js";

/**
 * Build a `fieldWidgets` map that renders a {@link ReferenceSelect} for every
 * foreign key the collection declares — the write-side counterpart to
 * `referencesFromRelations`. Relations come from schema introspection, so a
 * form gets relation selects without the app naming the target collection;
 * spread your own entries after this to override any one field.
 */
export function referenceWidgets(
  client: CompClient,
  relations: readonly OutboundRelation[],
  pageSize?: number,
): Record<string, (control: FieldControl) => ReactNode> {
  const widgets: Record<string, (control: FieldControl) => ReactNode> = {};
  for (const relation of relations) {
    if (!relation.labelField) continue;
    const { field, collection, labelField, targetField } = relation;
    widgets[field] = (control) => (
      <ReferenceSelect
        client={client}
        collection={collection}
        labelField={labelField}
        valueField={targetField}
        control={control}
        {...(pageSize === undefined ? {} : { pageSize })}
      />
    );
  }
  return widgets;
}
