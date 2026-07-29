import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  plugins: [react()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    // Proxy the API to the worker during `vite dev` (same-origin in prod).
    proxy: { "/admin": "http://localhost:8787" },
  },
});
