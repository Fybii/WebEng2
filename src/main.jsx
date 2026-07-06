import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import App from "./App.jsx";

import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/layout.css";

registerSW({ immediate: true });

// ── App starten ─────────────────────────────────

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root-Element mit der ID 'root' wurde nicht gefunden.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);