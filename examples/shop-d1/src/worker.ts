import { createDrizzleHistoryStore } from "@comp/core";
import { createMcpHandler } from "@comp/mcp";
import { createAdminRouter } from "@comp/server";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { actions, collections } from "./collections.js";

interface Env {
  DB: D1Database;
}

/**
 * Deliberately unauthenticated: `blog-d1` covers passkeys and sessions, so this
 * example stays about the admin surface. Put a real `AuthAdapter` in front of
 * both routers before deploying anything like it.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = drizzle(env.DB);
    // The same store on both transports: an HTTP write and an MCP write are
    // the same change, and a history that sees only one is worse than none.
    const history = createDrizzleHistoryStore(db);
    const app = new Hono();

    app.route(
      "/admin",
      createAdminRouter({ collections, actions, getDb: () => db, history }),
    );
    app.route(
      "/mcp",
      createMcpHandler({
        collections,
        actions,
        getDb: () => db,
        history,
        actor: "mcp",
      }),
    );

    return app.fetch(request, env);
  },
};
