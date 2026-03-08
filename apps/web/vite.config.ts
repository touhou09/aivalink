import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
      "/gateway": {
        target: "ws://localhost:3000",
        ws: true,
        rewrite: (path) => path.replace(/^\/gateway/, ""),
      },
      "/vtuber": {
        target: "http://localhost",
        changeOrigin: true,
        ws: true,
      },
      "/models": {
        target: "http://localhost",
        changeOrigin: true,
      },
    },
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
});
