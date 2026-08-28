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
  build: {
    rollupOptions: {
      output: {
        // ОДИН ФАЙЛ НА 570 КБ — это 570 КБ до первого экрана, и львиная доля в
        // нём не нужна, пока человек не открыл курс. Делим по тому, КОГДА оно
        // нужно, а не по тому, откуда пришло:
        //
        //   react   — нужен сразу и не меняется от правки к правке, поэтому
        //             отдельным файлом он переживает наши сборки в кеше;
        //   course  — сгенерированные девять блоков, 37 уроков и 69 упражнений;
        //             на домашнем экране не нужны ни байтом;
        //   engine  — офлайн-ядро: нужно, только когда сервер не ответил.
        //
        // Дальше дробить нечего: остальное — экраны, которые и так открываются
        // первым же кликом.
        manualChunks(id: string) {
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) {
            return "react";
          }
          if (id.includes("/src/data/course.generated")) return "course";
          if (id.includes("/src/mock/")) return "engine";
          return undefined;
        },
      },
    },
  },
});
