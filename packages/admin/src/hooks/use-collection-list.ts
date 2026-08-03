import { useCallback, useEffect, useState } from "react";
import type { DateHierarchy, FilterChoices } from "@comp/core";
import type {
  CompClient,
  ListQuery,
  Row,
} from "../client/create-client.types.js";
import { applyPatch } from "./row-patch.js";

export interface UseCollectionListResult {
  rows: Row[];
  page: number;
  pageSize: number;
  total: number;
  /** The date drill-down strip the server resolved for this list. */
  hierarchy: DateHierarchy | null;
  /** Per-field values a distinct-value filter offers, read from the data. */
  choices: FilterChoices[];
  query: ListQuery;
  loading: boolean;
  error: Error | null;
  /** Merge into the current query. Changing search/filters resets to page 1. */
  setQuery: (next: Partial<ListQuery>) => void;
  reload: () => void;
  /** Optimistically merge a patch into locally-held rows matching `predicate`. */
  applyLocal: (predicate: (row: Row) => boolean, patch: Row) => void;
}

function resetsToFirstPage(next: Partial<ListQuery>): boolean {
  // Anything that changes *which* records are shown starts over: page 4 of the
  // old result set says nothing about the new one.
  return "q" in next || "filters" in next || "sort" in next || "date" in next;
}

/**
 * Fetch a collection's list through the client, holding the query state
 * (page/pageSize/search/filters/sort) and refetching when it changes.
 */
export function useCollectionList(
  client: CompClient,
  slug: string,
  initialQuery: ListQuery = {},
): UseCollectionListResult {
  const [query, setQueryState] = useState<ListQuery>(initialQuery);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(initialQuery.page ?? 1);
  const [pageSize, setPageSize] = useState(initialQuery.pageSize ?? 0);
  const [total, setTotal] = useState(0);
  const [hierarchy, setHierarchy] = useState<DateHierarchy | null>(null);
  const [choices, setChoices] = useState<FilterChoices[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const setQuery = useCallback((next: Partial<ListQuery>) => {
    setQueryState((prev) => ({
      ...prev,
      ...next,
      page: resetsToFirstPage(next) ? 1 : (next.page ?? prev.page),
    }));
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const applyLocal = useCallback(
    (predicate: (row: Row) => boolean, patch: Row) => {
      setRows((prev) => applyPatch(prev, predicate, patch));
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .list(slug, query)
      .then((result) => {
        if (cancelled) return;
        setRows(result.data);
        setPage(result.page);
        setPageSize(result.pageSize);
        setTotal(result.total);
        setHierarchy(result.hierarchy ?? null);
        setChoices(result.choices ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, slug, query, nonce]);

  return {
    rows,
    page,
    pageSize,
    total,
    hierarchy,
    choices,
    query,
    loading,
    error,
    setQuery,
    reload,
    applyLocal,
  };
}
