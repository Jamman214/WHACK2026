import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadMap } from "./data/api";
import "./styles.css";

const root = document.getElementById("root")!;
loadMap().then(
  () => createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
  (e) => { root.textContent = `Couldn't load the topic map from the backend (${e.message}). Is it running?`; },
);
