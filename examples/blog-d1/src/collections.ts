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
  search: ["title", "body"],
  ordering: [{ field: "createdAt", direction: "desc" }],
});

export const collections = [postCollection, authorCollection];

export const actions = [
  bulkDeleteAction(postCollection.slug),
  bulkDeleteAction(authorCollection.slug),
];
