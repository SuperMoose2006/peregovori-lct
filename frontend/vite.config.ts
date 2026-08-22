import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Дев-сервер проксирует realtime-сессию и REST на гейтвей. Когда гейтвей не
// поднят, фронтенд уходит в офлайн-ядро (см. src/api/ws.ts) — `npm run dev`
// показывает продукт целиком в любом случае.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1/realtime": {
        target: "ws://localhost:8010",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:8010",
        changeOrigin: true,
      },
    },
  },
});
