import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { matchApi } from "./src/match/plugin";
import { competitionMiddleware } from "./src/competition/api";

export default defineConfig({
  plugins: [react(), {
    name: "sudoku-competitions",
    configureServer(server) { server.middlewares.use(competitionMiddleware); },
    configurePreviewServer(server) { server.middlewares.use(competitionMiddleware); },
  }, matchApi()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: Number(process.env.PORT) || 4173, allowedHosts: true },
  test: { environment: "node" },
});
