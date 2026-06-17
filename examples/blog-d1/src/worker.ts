import { createAuthRoutes } from "@comp/auth";
import { createAdminRouter } from "@comp/server";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { createBlogAuth, type BlogAuthEnv } from "./auth.js";
import { actions, collections } from "./collections.js";

interface Env extends BlogAuthEnv {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = drizzle(env.DB);
    const { auth, store, rp } = createBlogAuth(env, db);

    const app = new Hono();
    app.get("/", (c) =>
      c.text("Comp — blog-d1 example. Admin API under /admin, auth under /auth"),
    );

    app.route(
      "/admin",
      createAdminRouter({ collections, actions, getDb: () => db, auth }),
    );

    app.route(
      "/auth",
      createAuthRoutes({
        store,
        rp,
        auth,
        // Example-only: grant every verified user the admin role.
        resolveIdentity: (userId) => ({ subject: userId, roles: ["admin"] }),
      }),
    );

    return app.fetch(request, env);
  },
};
