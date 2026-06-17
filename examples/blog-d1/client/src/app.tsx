import {
  CollectionBrowser,
  CollectionForm,
  PasskeyLogin,
  createClient,
  createPasskeyClient,
  type CollectionSummary,
} from "@comp/admin";
import { useEffect, useState, type JSX } from "react";

const client = createClient({ baseUrl: "/admin" });
const passkeys = createPasskeyClient({ baseUrl: "/auth" });

export function App(): JSX.Element {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Bump to refetch the collection list and remount the browser after a write.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    client
      .collections()
      .then(setCollections)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const posts = collections.find((c) => c.slug === "posts");

  return (
    <main>
      <h1>Comp — blog-d1</h1>

      <section>
        <h2>Sign in</h2>
        <PasskeyLogin client={passkeys} onAuthenticated={() => setVersion((v) => v + 1)} />
      </section>

      {error && <p role="alert">{error}</p>}

      {posts && (
        <>
          <section>
            <h2>New {posts.slug}</h2>
            <CollectionForm
              key={`form-${version}`}
              fields={posts.fields}
              primaryKey={posts.primaryKey}
              submitLabel="Create"
              onSubmit={async (values) => {
                await client.create(posts.slug, values);
                setVersion((v) => v + 1);
              }}
            />
          </section>

          <section>
            <h2>{posts.slug}</h2>
            <CollectionBrowser key={`list-${version}`} client={client} collection={posts} />
          </section>
        </>
      )}
    </main>
  );
}
