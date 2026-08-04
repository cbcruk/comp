import type { InlineWritePayload } from "@comp/core";
import { useEffect, useState, type JSX } from "react";
import { CollectionForm } from "../collection-form/collection-form.js";
import { useRecord } from "../hooks/use-record.js";
import { InlineEditor } from "../inline-editor/inline-editor.js";
import {
  hasInlineChanges,
  inlineRowsFrom,
  toInlineWrite,
  type InlineRow,
} from "../inline-editor/inline-rows.js";
import { changedLinks } from "../many-to-many/links.js";
import { ManyToManySelect } from "../many-to-many/many-to-many-select.js";
import { referenceWidgets } from "../reference-select/reference-widgets.js";
import {
  extractIssues,
  inlineIssuesByRow,
  ownIssues,
} from "../validation/issues.js";
import type { RecordScreenProps } from "./admin-site.types.js";
import { can, recordTitle } from "./site.utils.js";

/**
 * The add and change screens. One form: the record's own fields, a relation
 * select per foreign key, and an editor per inline — all derived, and all saved
 * by the same button, because a record and its children are one edit.
 */
export function RecordScreen({
  client,
  collection,
  collections,
  id,
  navigate,
  onNotify,
  fieldWidgets,
}: RecordScreenProps): JSX.Element {
  const { record, inlines, manyToMany, loading, error } = useRecord(
    client,
    collection.slug,
    id,
  );
  const [rows, setRows] = useState<Record<string, InlineRow[]>>({});
  const [links, setLinks] = useState<Record<string, unknown[]>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, Record<string, string[]>>>(
    {},
  );

  const childBySlug = new Map(collections.map((c) => [c.slug, c]));

  useEffect(() => {
    const seeded: Record<string, InlineRow[]> = {};
    for (const inline of collection.inlines) {
      const child = childBySlug.get(inline.collection);
      if (!child) continue;
      seeded[inline.collection] = inlineRowsFrom(
        inlines[inline.collection] ?? [],
        child.fields,
        child.primaryKey,
        inline.field,
      );
    }
    setRows(seeded);
    // `inlines` is replaced whenever the record is refetched.
  }, [inlines, collection]);

  useEffect(() => {
    const seeded: Record<string, unknown[]> = {};
    for (const relation of collection.manyToMany) {
      seeded[relation.name] = manyToMany[relation.name] ?? [];
    }
    setLinks(seeded);
  }, [manyToMany, collection]);

  if (id !== null && loading) return <p>Loading…</p>;
  if (error) return <p role="alert">{error.message}</p>;

  const editing = id !== null;
  const title = editing
    ? recordTitle(collection, record, id)
    : `Add ${collection.label.toLowerCase()}`;

  function collectInlineWrites(): InlineWritePayload {
    const payload: InlineWritePayload = {};
    for (const inline of collection.inlines) {
      const child = childBySlug.get(inline.collection);
      const state = rows[inline.collection];
      if (!child || !state) continue;
      const write = toInlineWrite(
        state,
        child.fields,
        child.primaryKey,
        inline.field,
      );
      if (hasInlineChanges(write)) payload[inline.collection] = write;
    }
    return payload;
  }

  return (
    <section>
      <h2>{title}</h2>
      <button type="button" onClick={() => navigate({ view: "list", slug: collection.slug })}>
        Back to {collection.labelPlural.toLowerCase()}
      </button>

      <CollectionForm
        key={`${collection.slug}-${id ?? "new"}`}
        fields={collection.fields}
        primaryKey={collection.primaryKey}
        form={collection.form}
        {...(record ? { record } : {})}
        submitLabel={editing ? "Save" : "Create"}
        fieldWidgets={{
          ...referenceWidgets(client, collection.relations),
          ...fieldWidgets,
        }}
        onSubmit={async (values) => {
          setRowErrors({});
          const payload = collectInlineWrites();
          const inlineArg =
            Object.keys(payload).length > 0 ? payload : undefined;
          // Only the relationships whose membership moved: a set the server is
          // not told about is one it leaves alone.
          const linkPayload = changedLinks(
            collection.manyToMany,
            manyToMany,
            links,
          );
          const linkArg =
            Object.keys(linkPayload).length > 0 ? linkPayload : undefined;
          try {
            if (editing) {
              await client.update(
                collection.slug,
                id,
                values,
                inlineArg,
                linkArg,
              );
              onNotify?.("success", `${title} saved`);
              navigate({ view: "list", slug: collection.slug });
            } else {
              const created = await client.create(
                collection.slug,
                values,
                inlineArg,
                linkArg,
              );
              onNotify?.("success", `${collection.label} created`);
              // Django lands you on the record it just made; so does this,
              // which is also where the inlines become editable.
              const newId = collection.primaryKey
                ? created[collection.primaryKey]
                : null;
              navigate(
                newId === null || newId === undefined
                  ? { view: "list", slug: collection.slug }
                  : { view: "change", slug: collection.slug, id: String(newId) },
              );
            }
          } catch (err) {
            // A row's issues go back to the row that caused them; anything
            // about the record itself is re-thrown for the form to render.
            const issues = extractIssues(err);
            if (issues) {
              const perInline: Record<string, Record<string, string[]>> = {};
              for (const inline of collection.inlines) {
                perInline[inline.collection] = inlineIssuesByRow(
                  issues,
                  inline.collection,
                );
              }
              setRowErrors(perInline);
              if (ownIssues(issues).length === 0) return;
            }
            throw err;
          }
        }}
      >
        {collection.manyToMany.map((relation) => (
          <ManyToManySelect
            key={relation.name}
            client={client}
            relation={relation}
            value={links[relation.name] ?? []}
            onChange={(next) =>
              setLinks((prev) => ({ ...prev, [relation.name]: next }))
            }
          />
        ))}

        {collection.inlines.map((inline) => {
          const child = childBySlug.get(inline.collection);
          if (!child || !rows[inline.collection]) return null;
          return (
            <InlineEditor
              key={inline.collection}
              inline={inline}
              fields={child.fields}
              primaryKey={child.primaryKey}
              rows={rows[inline.collection] ?? []}
              onChange={(next) =>
                setRows((prev) => ({ ...prev, [inline.collection]: next }))
              }
              errors={rowErrors[inline.collection] ?? {}}
              legend={child.labelPlural}
              addLabel={`Add ${child.label.toLowerCase()}`}
            />
          );
        })}
      </CollectionForm>

      {editing && (
        <button
          type="button"
          onClick={() => navigate({ view: "history", slug: collection.slug, id })}
        >
          History
        </button>
      )}

      {editing && can(collection, "delete") && (
        <button
          type="button"
          onClick={() => navigate({ view: "delete", slug: collection.slug, id })}
        >
          Delete
        </button>
      )}
    </section>
  );
}
