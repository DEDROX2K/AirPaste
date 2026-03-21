import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve("renderer"),
  publicDir: path.resolve("public"),
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve("renderer/src"),
    },
  },
  plugins: [react()],
  server: {
    host: "127.0.0.1", // Forces Vite to use IPv4 so Electron can connect
    port: 5173,        // Locks in the port Electron is expecting
    strictPort: true,  // Fails immediately if 5173 is stuck, preventing silent switching
  },
  build: {
    outDir: path.resolve("dist-renderer"),
    emptyOutDir: true,
  },
});
