import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "classic-script-for-wkwebview-file-url",
      transformIndexHtml(html) {
        return html
          .replace(/<script type="module" crossorigin/g, "<script defer")
          .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"');
      },
    },
  ],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../Sources/ChromeOverridesManager/Resources",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "[name]-[hash].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
});
