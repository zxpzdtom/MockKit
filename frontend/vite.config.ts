import { readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootPackage = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf8")) as {
  version?: string;
};
const appVersion = (process.env.APP_VERSION || rootPackage.version || "0.1.0").replace(/^v/i, "");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "classic-script-for-wkwebview-file-url",
      apply: "build",
      transformIndexHtml(html) {
        return html
          .replace(/<script type="module" crossorigin/g, "<script defer")
          .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"');
      },
    },
  ],
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "@codemirror/autocomplete",
      "@codemirror/commands",
      "@codemirror/lang-json",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/search",
      "@codemirror/state",
      "@codemirror/view",
      "codemirror",
    ],
  },
  build: {
    outDir: "../Sources/ChromeOverridesManager/Resources",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: "[name]-[hash].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
});
