import { useEffect, useState } from "react";
import type { CompClient, Row } from "../client/create-client.types.js";

export interface UseRecordResult {
  record: Row | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Fetch a single record by id through the client. Read-only — mutations go
 * back through the client's create/update/remove so there is one write path.
 */
export function useRecord(
  client: CompClient,
  slug: string,
  id: string | number | null,
): UseRecordResult {
  const [record, setRecord] = useState<Row | null>(null);
  const [loading, setLoading] = useState(id !== null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (id === null) {
      setRecord(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .get(slug, id)
      .then((data) => {
        if (!cancelled) setRecord(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, slug, id]);

  return { record, loading, error };
}
