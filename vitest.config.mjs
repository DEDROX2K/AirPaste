import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve("renderer/src"),
    },
  },
  // The app's JSX uses the automatic runtime (no React import); tests that
  // render components need it too.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
