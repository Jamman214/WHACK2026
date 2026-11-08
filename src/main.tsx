import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadMap } from "./data/api";
import "./styles.css";

const root = document.getElementById("root")!;
// App is imported only after the map is swapped into the taxonomy: several Atlas modules (solar, atlasThree,
// Search) index CATEGORIES/TOPICS when they load, and would otherwise hold the test fixture's ids.
loadMap()
  .then(() => import("./App"))
  .then(
    ({ default: App }) => createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
    (e) => { root.textContent = `Couldn't load the topic map from the backend (${e.message}). Is it running?`; },
  );
