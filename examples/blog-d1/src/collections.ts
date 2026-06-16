import { defineCollection } from "@comp/core";
import { posts } from "./schema.js";

export const postCollection = defineCollection({
  model: posts,
  listDisplay: ["title", "status", "createdAt"],
  filters: ["status"],
  search: ["title", "body"],
  ordering: [{ field: "createdAt", direction: "desc" }],
});

export const collections = [postCollection];
