import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        a: resolve(import.meta.dirname, "a.html"),
        b: resolve(import.meta.dirname, "b.html"),
        c: resolve(import.meta.dirname, "c.html"),
      },
    },
  },
});
