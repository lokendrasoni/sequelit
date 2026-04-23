import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "@xyflow/react/dist/style.css";

// Apply saved theme before first render to avoid flash
const saved = localStorage.getItem("sequelit-theme");
const theme = saved ? (JSON.parse(saved)?.state?.theme ?? "dark") : "dark";
const resolved =
  theme === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    : theme;
document.documentElement.classList.toggle("dark", resolved === "dark");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
