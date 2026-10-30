import { fileURLToPath } from "node:url";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here("."),
  css: { devSourcemap: true },
  plugins: [svelte()],
  resolve: {
    alias: {
      "@": here("./src"),
      "@shared": here("./src/shared"),
    },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 3434),
    // En desarrollo PocketBase corre aparte: la web le pasa la API y el
    // tiempo real, así todo vive en el mismo origen como en producción.
    proxy: {
      "/api": { target: process.env.PB_URL ?? "http://127.0.0.1:8093", changeOrigin: true },
      "/_": { target: process.env.PB_URL ?? "http://127.0.0.1:8093", changeOrigin: true },
    },
  },
  build: {
    // PocketBase sirve la web desde aquí: un solo proceso en producción.
    outDir: here("./pocketbase/pb_public"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
