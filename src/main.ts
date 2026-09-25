import "./styles/global.css";
import "./styles/app.css";
import "./styles/finanzas.css";
import "./styles/glass.css";

import { mount } from "svelte";

import App from "./App.svelte";

const root = document.getElementById("root");
if (!root) throw new Error("Falta el elemento #root en el HTML");

mount(App, { target: root });

// La app queda guardada en el teléfono para abrir sin internet (public/sw.js).
// En desarrollo no: pelearía con la recarga en caliente de Vite.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
