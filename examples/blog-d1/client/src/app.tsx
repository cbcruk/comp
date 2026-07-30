import {
  CollectionBrowser,
  CollectionForm,
  PasskeyLogin,
  Toasts,
  createClient,
  createPasskeyClient,
  referenceWidgets,
  useToasts,
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
  const { toasts, notify, dismiss } = useToasts();

  useEffect(() => {
    client
      .collections()
      .then(setCollections)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const posts = collections.find((c) => c.slug === "posts");
  const authors = collections.find((c) => c.slug === "authors");

  return (
    <main>
      <h1>Comp — blog-d1</h1>
      <Toasts toasts={toasts} onDismiss={dismiss} />

      <section>
        <h2>Sign in</h2>
        <PasskeyLogin client={passkeys} onAuthenticated={() => setVersion((v) => v + 1)} />
      </section>

      {error && <p role="alert">{error}</p>}

      {authors && (
        <>
          <section>
            <h2>New {authors.slug}</h2>
            <CollectionForm
              key={`author-form-${version}`}
              fields={authors.fields}
              primaryKey={authors.primaryKey}
              form={authors.form}
              submitLabel="Create"
              onSubmit={async (values) => {
                await client.create(authors.slug, values);
                setVersion((v) => v + 1);
              }}
            />
          </section>
          <section>
            <h2>{authors.slug}</h2>
            <CollectionBrowser
              key={`author-list-${version}`}
              client={client}
              collection={authors}
              editable
              onNotify={notify}
            />
          </section>
        </>
      )}

      {posts && (
        <>
          <section>
            <h2>New {posts.slug}</h2>
            <CollectionForm
              key={`post-form-${version}`}
              fields={posts.fields}
              primaryKey={posts.primaryKey}
              // The declared layout: grouped fieldsets, a slug prepopulated
              // from the title, a readonly timestamp, radios for the status.
              form={posts.form}
              submitLabel="Create"
              // Relation selects come from the schema's foreign keys; the app
              // never names the target collection.
              fieldWidgets={referenceWidgets(client, posts.relations)}
              onSubmit={async (values) => {
                await client.create(posts.slug, values);
                setVersion((v) => v + 1);
              }}
            />
          </section>

          <section>
            <h2>{posts.slug}</h2>
            <CollectionBrowser
              key={`post-list-${version}`}
              client={client}
              collection={posts}
              editable
              onNotify={notify}
            />
          </section>
        </>
      )}
    </main>
  );
}
