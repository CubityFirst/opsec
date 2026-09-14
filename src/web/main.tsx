import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installability only (public/sw.js caches the shell and the hashed assets, never
// data). In dev any worker left over from a local production build is removed, so
// Vite's HMR always talks to the real server.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    });
  } else {
    void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
  }
}
