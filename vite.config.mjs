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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("react-konva") || id.includes(`${path.sep}konva${path.sep}`) || id.includes("/konva/")) {
            return "konva";
          }

          if (id.includes(`${path.sep}three${path.sep}`) || id.includes("/three/")) {
            return "three";
          }

          if (id.includes("framer-motion")) {
            return "motion";
          }

          if (id.includes(`${path.sep}react${path.sep}`) || id.includes(`${path.sep}react-dom${path.sep}`) || id.includes("/react/") || id.includes("/react-dom/")) {
            return "react";
          }

          return undefined;
        },
      },
    },
  },
});
