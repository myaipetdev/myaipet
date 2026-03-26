import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    proxy: {
      "/api": {
        target: "http://localhost:8010",
        changeOrigin: true,
      },
      "/static": {
        target: "http://localhost:8010",
        changeOrigin: true,
      },
    },
  },
});
