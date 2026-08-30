/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOCK?: string;
  /** Origin бэкенда, вписываемый НА СБОРКЕ (`https://api.example.com`).
   *  Пусто или отсутствует — бэкенд на том же происхождении, что и страница.
   *  Разрешается ровно в одном месте: `src/api/backend.ts`. */
  readonly VITE_API_BASE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
