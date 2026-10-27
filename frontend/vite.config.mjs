import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function healthCheckPlugin() {
  let state = "idle";
  let errors = [];
  let warnings = [];
  let lastCompileTime = null;
  let lastSuccessTime = null;
  let compileDuration = 0;
  let totalCompiles = 0;
  let firstCompileTime = null;
  const startedAt = Date.now();

  return {
    name: "whycom-health-check",
    apply: "serve",
    buildStart() {
      state = "compiling";
      lastCompileTime = Date.now();
      firstCompileTime ??= lastCompileTime;
    },
    buildEnd(error) {
      totalCompiles += 1;
      compileDuration = lastCompileTime ? Date.now() - lastCompileTime : 0;
      if (error) {
        state = "failed";
        errors = [{ message: error.message, stack: error.stack }];
      } else {
        state = "success";
        errors = [];
        lastSuccessTime = Date.now();
      }
    },
    transform(_code, id) {
      if (state === "compiling" && !id.includes("/node_modules/")) {
        state = "success";
        errors = [];
        lastSuccessTime = Date.now();
        compileDuration = lastCompileTime ? lastSuccessTime - lastCompileTime : 0;
        totalCompiles += 1;
      }
      return null;
    },
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        state = "success";
        lastSuccessTime = Date.now();
        totalCompiles = Math.max(totalCompiles, 1);
      });
      server.watcher.on("change", (file) => {
        if (file.includes("/node_modules/")) return;
        state = "compiling";
        lastCompileTime = Date.now();
      });

      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, "http://localhost").pathname;
        if (!pathname.startsWith("/health")) return next();

        const healthy = state === "success";
        const health = {
          state,
          isHealthy: healthy,
          hasCompiled: totalCompiles > 0,
          errorCount: errors.length,
          warningCount: warnings.length,
          errors,
          warnings,
          lastCompileTime,
          lastSuccessTime,
          compileDuration,
          totalCompiles,
          firstCompileTime,
        };
        const json = (status, body) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(body));
        };

        if (pathname === "/health/live") return json(200, { alive: true, timestamp: new Date().toISOString() });
        if (pathname === "/health/simple") {
          res.statusCode = state === "failed" ? 503 : 200;
          res.end(state === "success" ? "OK" : state.toUpperCase());
          return;
        }
        if (pathname === "/health/ready") return json(healthy ? 200 : 503, { ready: healthy, state });
        if (pathname === "/health/errors") return json(200, health);
        if (pathname === "/health/stats") return json(200, {
          totalCompiles,
          averageCompileTime: totalCompiles ? `${Math.round((Date.now() - startedAt) / totalCompiles)}ms` : null,
          lastCompileDuration: compileDuration ? `${compileDuration}ms` : null,
          serverUptime: `${Math.floor((Date.now() - startedAt) / 1000)}s`,
        });
        if (pathname === "/health") return json(200, {
          status: healthy ? "healthy" : "unhealthy",
          timestamp: new Date().toISOString(),
          uptime: { seconds: Math.floor((Date.now() - startedAt) / 1000) },
          vite: health,
          environment: process.env.NODE_ENV || "development",
        });
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  return {
    plugins: [react(), tailwindcss(), ...(env.ENABLE_HEALTH_CHECK === "true" ? [healthCheckPlugin()] : [])],
    resolve: {
      alias: { "@": path.resolve(rootDir, "src") },
    },
    server: {
      host: "0.0.0.0",
      port: Number(env.PORT || 3000),
      strictPort: true,
      watch: {
        ignored: ["**/.git/**", "**/build/**", "**/dist/**", "**/coverage/**"],
      },
    },
    preview: { host: "0.0.0.0", port: Number(env.PORT || 3000), strictPort: true },
  };
});
