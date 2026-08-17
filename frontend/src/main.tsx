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
// full HMR with nothing intercepting its module/WebSocket traffic. Failures are
// swallowed — the app is fully functional without the SW.
if ("serviceWorker" in navigator && (import.meta.env.PROD || import.meta.env.VITE_MOCK === "1")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
