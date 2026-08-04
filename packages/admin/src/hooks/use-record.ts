import { useEffect, useState } from "react";
import type { CompClient, Row } from "../client/create-client.types.js";

export interface UseRecordResult {
  record: Row | null;
  /** Child rows per inline, as the server resolved them; empty when none. */
  inlines: Record<string, Row[]>;
  /** Ids linked through each many-to-many, keyed by relationship name. */
  manyToMany: Record<string, unknown[]>;
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
  const [inlines, setInlines] = useState<Record<string, Row[]>>({});
  const [manyToMany, setManyToMany] = useState<Record<string, unknown[]>>({});
  const [loading, setLoading] = useState(id !== null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (id === null) {
      setRecord(null);
      setInlines({});
      setManyToMany({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .getRecord(slug, id)
      .then((result) => {
        if (cancelled) return;
        setRecord(result.data);
        setInlines(result.inlines ?? {});
        setManyToMany(result.manyToMany ?? {});
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

  return { record, inlines, manyToMany, loading, error };
}
