import "@fontsource-variable/geist-mono";
import { createRoot } from "react-dom/client";
import { GlimmProvider } from "glimm/react";
import App from "./App.jsx";
import { PALETA } from "./lib/barrido.js";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/trabajo.css";
import "./styles/nativo.css";

// GlimmProvider: los barridos de vista entera (entrar tras la bienvenida, cambiar el tema). Ver src/lib/barrido.js.
createRoot(document.getElementById("root")).render(
  <GlimmProvider palette={PALETA} sweepMs={1100} reducedMotion="instant">
    <App />
  </GlimmProvider>,
);
