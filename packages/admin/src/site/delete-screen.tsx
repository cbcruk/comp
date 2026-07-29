import type { DeleteImpact } from "@comp/core";
import { useEffect, useState, type JSX } from "react";
import type { DeleteScreenProps } from "./admin-site.types.js";
import { describeImpact, summarizeImpact } from "./site.utils.js";

/**
 * The delete confirmation. It does not just ask "are you sure" — it says what
 * the delete reaches, counted from the database, and refuses outright when a
 * foreign key would. A confirmation that cannot tell you the consequences is
 * only a speed bump.
 */
export function DeleteScreen({
  client,
  collection,
  id,
  navigate,
  onNotify,
}: DeleteScreenProps): JSX.Element {
  const [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setImpact(null);
    setError(null);
    client
      .deletePreview(collection.slug, id)
      .then((result) => {
        if (!cancelled) setImpact(result);
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

  const back = (): void => navigate({ view: "change", slug: collection.slug, id });

  if (error) {
    return (
      <section>
        <p role="alert">{error.message}</p>
        <button type="button" onClick={back}>
          Back
        </button>
      </section>
    );
  }
  if (!impact) return <p>Checking what this would affect…</p>;

  const lines = describeImpact(impact);

  return (
    <section>
      <h2>
        Delete {collection.label.toLowerCase()} {id}?
      </h2>
      <p>{summarizeImpact(impact)}</p>

      {lines.length > 0 && (
        <ul>
          {lines.map((line) => (
            <li key={line.collection} {...(line.blocking ? { role: "alert" } : {})}>
              {line.text}
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={back}>
        Cancel
      </button>
      <button
        type="button"
        disabled={impact.blocked || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await client.remove(collection.slug, id);
            onNotify?.("success", `${collection.label} ${id} deleted`);
            navigate({ view: "list", slug: collection.slug });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (onNotify) onNotify("error", message);
            else setError(new Error(message));
          } finally {
            setBusy(false);
          }
        }}
      >
        {impact.blocked ? "Cannot delete" : "Delete"}
      </button>
    </section>
  );
}
