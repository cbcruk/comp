import {
  CollectionBrowser,
  CollectionForm,
  InlineEditor,
  Toasts,
  createClient,
  extractIssues,
  hasInlineChanges,
  inlineIssuesByRow,
  inlineRowsFrom,
  ownIssues,
  referenceWidgets,
  toInlineWrite,
  useRecord,
  useToasts,
  type CollectionSummary,
  type InlineRow,
} from "@comp/admin";
import { useEffect, useState, type JSX } from "react";

const client = createClient({ baseUrl: "/admin" });

/** Edit an order and its line items as one action. */
function OrderEditor({
  order,
  items,
  id,
  onSaved,
}: {
  order: CollectionSummary;
  items: CollectionSummary;
  id: number;
  onSaved: (message: string) => void;
}): JSX.Element {
  const { record, inlines, loading } = useRecord(client, order.slug, id);
  const [rows, setRows] = useState<InlineRow[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string[]>>({});
  const inline = order.inlines[0];

  useEffect(() => {
    if (!inline) return;
    setRows(
      inlineRowsFrom(
        inlines[inline.collection] ?? [],
        items.fields,
        items.primaryKey,
        inline.field,
      ),
    );
  }, [inlines, inline, items]);

  if (loading || !record || !inline) return <p>Loading…</p>;

  return (
    <CollectionForm
      key={`order-${String(id)}`}
      fields={order.fields}
      primaryKey={order.primaryKey}
      record={record}
      submitLabel="Save order"
      fieldWidgets={referenceWidgets(client, order.relations)}
      onSubmit={async (values) => {
        setRowErrors({});
        const write = toInlineWrite(
          rows,
          items.fields,
          items.primaryKey,
          inline.field,
        );
        try {
          await client.update(
            order.slug,
            id,
            values,
            hasInlineChanges(write) ? { [inline.collection]: write } : undefined,
          );
          onSaved(`Saved ${record.reference as string}`);
        } catch (error) {
          // Row-level issues go back to the row that caused them; anything
          // about the order itself is re-thrown for the form to render.
          const issues = extractIssues(error);
          if (issues) {
            setRowErrors(inlineIssuesByRow(issues, inline.collection));
            if (ownIssues(issues).length === 0) return;
          }
          throw error;
        }
      }}
    >
      <InlineEditor
        inline={inline}
        fields={items.fields}
        primaryKey={items.primaryKey}
        rows={rows}
        onChange={setRows}
        errors={rowErrors}
        legend="Line items"
        addLabel="Add line item"
      />
    </CollectionForm>
  );
}

export function App(): JSX.Element {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const { toasts, notify, dismiss } = useToasts();

  useEffect(() => {
    client
      .collections()
      .then(setCollections)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const orders = collections.find((c) => c.slug === "orders");
  const items = collections.find((c) => c.slug === "order_items");

  return (
    <main>
      <h1>Comp — shop-d1</h1>
      <p>An order is edited together with its line items: one form, one save.</p>
      <Toasts toasts={toasts} onDismiss={dismiss} />
      {error && <p role="alert">{error}</p>}

      {orders && items && (
        <>
          <section>
            <h2>New order</h2>
            <CollectionForm
              key={`new-order-${String(version)}`}
              fields={orders.fields}
              primaryKey={orders.primaryKey}
              submitLabel="Create"
              fieldWidgets={referenceWidgets(client, orders.relations)}
              onSubmit={async (values) => {
                await client.create(orders.slug, values);
                setVersion((v) => v + 1);
              }}
            />
          </section>

          <section>
            <h2>Orders</h2>
            <CollectionBrowser
              key={`orders-${String(version)}`}
              client={client}
              collection={orders}
              onNotify={notify}
              renderCell={({ column, value, row }) =>
                column === "reference" ? (
                  <button
                    type="button"
                    onClick={() => setEditing(Number(row[orders.primaryKey ?? "id"]))}
                  >
                    {String(value)}
                  </button>
                ) : (
                  String(value ?? "")
                )
              }
            />
          </section>

          {editing !== null && (
            <section>
              <h2>Order #{editing}</h2>
              <OrderEditor
                order={orders}
                items={items}
                id={editing}
                onSaved={(message) => {
                  notify("success", message);
                  setVersion((v) => v + 1);
                }}
              />
            </section>
          )}
        </>
      )}
    </main>
  );
}
