import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the offline-shell service worker. Gated to production builds and to the
// mock demo (`VITE_MOCK=1`), so a plain `npm run dev` against the live backend keeps
// full HMR with nothing intercepting its module/WebSocket traffic. The app is
// fully functional without the SW — but a failed registration means NO offline
// mode, and a silent `catch(() => {})` hid exactly that (аудит 17.10, R02).
if ("serviceWorker" in navigator && (import.meta.env.PROD || import.meta.env.VITE_MOCK === "1")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      console.warn("[offline] service worker not registered — the app works online only:", err);
    });
  });
}
