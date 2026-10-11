import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/shell.css";

// Explicit fixtures (?fixture=…, ?clock=…, ?fault=…) exist only in the dev server
// for the browser demo; production builds drop this branch entirely.
const ready: Promise<unknown> = import.meta.env.DEV
  ? import("./dev/setup").then((m) => m.setupDev())
  : Promise.resolve();

void ready.then(() =>
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  ),
);
