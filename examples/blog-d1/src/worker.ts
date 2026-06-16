import { createAdminRouter } from "@comp/server";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { collections } from "./collections.js";

interface Env {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("Comp — blog-d1 example. Admin API under /admin"));

const admin = createAdminRouter({
  collections,
  getDb: (c) => drizzle(c.env.DB),
});

app.route("/admin", admin);

export default app;
