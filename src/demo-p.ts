/**
 * Phase 3+4 demo: runs the full pipeline (normalize → paint) in the
 * browser on the raw samples, then wires the runtime helper. Exercises
 * all four interaction patterns: hover/focus highlight, label ↔ part
 * linking, tooltips (data-label/data-info), and external controls.
 * Keyboard: Tab into a figure, arrows walk parts, Enter "clicks".
 */

import { samples } from "./demo-common";
import { normalize, paint, resolveConfig } from "./pipeline";
import { aquarel } from "./runtime";

const app = document.getElementById("app")!;
app.innerHTML = `
  <header class="demo">
    <h1>Pipeline + runtime demo</h1>
    <nav><a href="/">index</a><a href="/a.html">A filters</a><a href="/b.html">B geometry</a><a href="/c.html">C hybrid</a></nav>
    <p>Full build pipeline run in-browser + the dependency-free runtime helper.
       Hover parts or labels, use Tab/arrows/Enter, or the external buttons.
       Events appear in the log.</p>
  </header>`;

const log = document.createElement("pre");
log.style.cssText = "position:fixed;right:1rem;bottom:1rem;max-height:12rem;overflow:auto;background:#fffdf5;border:1px solid #c9bfa8;padding:0.5rem;font-size:0.75rem;max-width:22rem;margin:0";
log.textContent = "event log\n";
document.body.appendChild(log);
const logLine = (s: string) => {
  log.textContent += s + "\n";
  log.scrollTop = log.scrollHeight;
};

for (const sample of samples) {
  const section = document.createElement("section");
  section.className = "sample";
  section.innerHTML = `<h2>${sample.name}</h2>`;
  const pane = document.createElement("div");
  pane.className = "pane";
  section.appendChild(pane);
  app.appendChild(section);

  const figure = await normalize(sample.raw, sample.name);
  for (const w of figure.warnings) console.warn(`${sample.name}: ${w}`);
  pane.insertAdjacentHTML("afterbegin", paint(figure, sample.name, resolveConfig(undefined, sample.name)));

  const svg = pane.querySelector<SVGSVGElement>("svg")!;
  const ctrl = aquarel(svg, { tooltip: true, label: `${sample.name} plate` });
  for (const type of ["partenter", "partleave", "partclick"] as const) {
    ctrl.addEventListener(type, (e) => {
      logLine(`${sample.name}: ${type} ${(e as CustomEvent<{ partId: string }>).detail.partId}`);
    });
  }

  // ?activate=<figure>:<part> drives the external-controls API on load
  // (doubles as a headless test of the highlight path)
  const [activateFigure, activatePart] = (
    new URLSearchParams(location.search).get("activate") ?? ""
  ).split(":");
  if (activateFigure === sample.name && ctrl.parts.includes(activatePart)) {
    ctrl.set(activatePart, true);
  }

  // external controls: one toggle button per part
  const controls = document.createElement("div");
  controls.style.marginTop = "0.4rem";
  for (const partId of ctrl.parts) {
    const button = document.createElement("button");
    button.textContent = partId;
    button.style.cssText = "margin-right:0.5rem;font:inherit;padding:0.1rem 0.6rem";
    let on = false;
    button.addEventListener("click", () => {
      on = !on;
      ctrl.set(partId, on);
      button.style.background = on ? "#d8cfba" : "";
    });
    controls.appendChild(button);
  }
  pane.appendChild(controls);
}
