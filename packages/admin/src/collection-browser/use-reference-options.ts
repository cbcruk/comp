import type { FilterOption } from "@comp/core";
import { useEffect, useState } from "react";
import type { CompClient } from "../client/create-client.types.js";
import { toOptions } from "../reference-select/reference-select.utils.js";

/**
 * Options for a filter that narrows by a foreign key: the referenced records,
 * pulled through the same client. Django queries the related model to build
 * that filter's choices; here the collection comes from the relation graph, so
 * the UI is never told which one to read.
 */
export function useReferenceOptions(
  client: CompClient,
  collection: string | undefined,
  labelField: string | null,
  valueField = "id",
  pageSize = 100,
): FilterOption[] {
  const [options, setOptions] = useState<FilterOption[]>([]);

  useEffect(() => {
    if (!collection || !labelField) {
      setOptions([]);
      return;
    }

    let cancelled = false;
    client
      .list(collection, { pageSize })
      .then((result) => {
        if (cancelled) return;
        setOptions(
          toOptions(result.data, valueField, labelField).map((option) => ({
            value: String(option.value),
            label: option.label,
          })),
        );
      })
      .catch(() => {
        /* options are best-effort; the filter still accepts a typed id */
      });

    return () => {
      cancelled = true;
    };
  }, [client, collection, labelField, valueField, pageSize]);

  return options;
}
