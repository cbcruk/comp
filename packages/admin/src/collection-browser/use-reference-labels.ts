import { useEffect, useState } from "react";
import type { CompClient } from "../client/create-client.types.js";
import { buildLabelMap, type ReferenceConfig } from "./reference-labels.js";

/**
 * Fetch each referenced collection once and expose column→(value→label) maps
 * for resolving FK display labels in the list. Read-only; the referenced rows
 * are pulled through the same client.
 */
export function useReferenceLabels(
  client: CompClient,
  references: Record<string, ReferenceConfig>,
  pageSize = 100,
): Record<string, Map<string, string>> {
  const [maps, setMaps] = useState<Record<string, Map<string, string>>>({});
  const key = JSON.stringify(references);

  useEffect(() => {
    const entries = Object.entries(references);
    if (entries.length === 0) {
      setMaps({});
      return;
    }
    let cancelled = false;
    Promise.all(
      entries.map(async ([column, ref]) => {
        const result = await client.list(ref.collection, { pageSize });
        const map = buildLabelMap(result.data, ref.valueField ?? "id", ref.labelField);
        return [column, map] as const;
      }),
    )
      .then((pairs) => {
        if (!cancelled) setMaps(Object.fromEntries(pairs));
      })
      .catch(() => {
        /* labels are best-effort; fall back to raw values */
      });
    return () => {
      cancelled = true;
    };
    // `key` is the serialized references; client/pageSize complete the deps.
  }, [client, key, pageSize]);

  return maps;
}
