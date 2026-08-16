import { devtools } from "@tanstack/devtools-vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    devtools({
      editor: {
        name: "VSCode",
        open: async (path, lineNumber, columnNumber) => {
          const { exec } = await import("node:child_process");
          const suffix =
            (lineNumber ? `:${lineNumber}` : "") +
            (columnNumber ? `:${columnNumber}` : "");
          exec(`code -g "${path.replaceAll("$", "\\$")}${suffix}"`);
        },
      },
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // Forward API calls to the Rust backend (nnj-grammar-server).
      "/api": "http://127.0.0.1:7878",
    },
    fs: {
      allow: [fileURLToPath(new URL("..", import.meta.url))],
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
