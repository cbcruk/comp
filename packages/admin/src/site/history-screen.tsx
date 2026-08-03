import { describeHistory, type HistoryEntry } from "@comp/core";
import { useEffect, useState, type JSX } from "react";
import type { HistoryScreenProps } from "./admin-site.types.js";

/**
 * A record's history — Django's per-object history view.
 *
 * The entries outlive the record, so this screen keeps answering after a
 * delete; that is the whole point of storing what the record was called
 * alongside its id.
 */
export function HistoryScreen({
  client,
  collection,
  id,
  navigate,
}: HistoryScreenProps): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    client
      .history(collection.slug, id)
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, collection.slug, id]);

  return (
    <section>
      <h2>
        History of {collection.label.toLowerCase()} {id}
      </h2>
      <button
        type="button"
        onClick={() => navigate({ view: "change", slug: collection.slug, id })}
      >
        Back to the record
      </button>

      {error && <p role="alert">{error.message}</p>}
      {!entries && !error && <p>Loading…</p>}
      {entries?.length === 0 && <p>Nothing has been recorded for this record.</p>}

      {entries && entries.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Who</th>
              <th scope="col">What</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={`${String(entry.at)}-${String(index)}`}>
                <td>
                  <time dateTime={new Date(entry.at).toISOString()}>
                    {new Date(entry.at).toLocaleString()}
                  </time>
                </td>
                <td>{entry.actor ?? "—"}</td>
                <td>{describeHistory(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
