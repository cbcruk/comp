import {
  AdminSite,
  Toasts,
  createClient,
  useHashRoute,
  useToasts,
  type CollectionSummary,
} from "@comp/admin";
import { useEffect, useState, type JSX } from "react";

const client = createClient({ baseUrl: "/admin" });

/**
 * The whole app. Everything below the fold — the index, each collection's
 * list, the add and change forms with their relation selects and line-item
 * inlines, and the delete confirmation — is generated from the collections the
 * server reports. There is no screen assembled here per collection.
 */
export function App(): JSX.Element {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { route, navigate } = useHashRoute();
  const { toasts, notify, dismiss } = useToasts();

  useEffect(() => {
    client
      .collections()
      .then(setCollections)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (collections.length === 0) return <p>Loading…</p>;

  return (
    <AdminSite
      client={client}
      collections={collections}
      route={route}
      onNavigate={navigate}
      onNotify={notify}
      title="Comp — shop-d1"
      header={<Toasts toasts={toasts} onDismiss={dismiss} />}
    />
  );
}
