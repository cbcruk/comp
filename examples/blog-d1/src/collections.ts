import { bulkDeleteAction, defineCollection } from "@comp/core";
import { authors, posts } from "./schema.js";

export const authorCollection = defineCollection({
  model: authors,
  listDisplay: ["name"],
  search: ["name"],
});

export const postCollection = defineCollection({
  model: posts,
  listDisplay: ["title", "status", "authorId", "createdAt"],
  filters: ["status", "authorId"],
  // A bare column matches anywhere inside it, `^` anchors to the start, and
  // `authorId__name` follows the foreign key to search by the author's name.
  search: ["title", "body", "^slug", "authorId__name"],
  ordering: [{ field: "createdAt", direction: "desc" }],
  // The layout, not just the fields: the slug writes itself from the title
  // while adding, the timestamp is shown but never written, and publishing
  // settings sit in their own group.
  fieldsets: [
    { title: "Content", fields: [["title", "slug"], "body"] },
    {
      title: "Publishing",
      fields: ["status", "authorId", "createdAt"],
      description: "Who wrote it, and whether anyone can see it.",
    },
  ],
  prepopulated: { slug: ["title"] },
  readonlyFields: ["createdAt"],
  radioFields: ["status"],
});

export const collections = [postCollection, authorCollection];

export const actions = [
  bulkDeleteAction(postCollection.slug),
  bulkDeleteAction(authorCollection.slug),
];
