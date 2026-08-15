import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies the turn-protocol WebSocket to the FastAPI backend.
// When the backend is not running, the frontend auto-falls back to the local
// MockServer (see src/api/ws.ts), so `npm run dev` shows the full UI regardless.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
