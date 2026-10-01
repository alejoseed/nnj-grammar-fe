import { TanStackDevtools } from "@tanstack/react-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing app host");
}

if (import.meta.env.DEV) {
  void import("./dev/svg-source-inspector").then((inspector) =>
    inspector.installSvgSourceInspector(),
  );
}

createRoot(root).render(
  <StrictMode>
    <App />
    <TanStackDevtools />
  </StrictMode>,
);
