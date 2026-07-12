import leafRaw from "../samples/leaf.svg?raw";
import heartRaw from "../samples/heart.svg?raw";
import dinosaurRaw from "../samples/dinosaur.svg?raw";

export interface Sample {
  name: string;
  raw: string;
}

export const samples: Sample[] = [
  { name: "leaf", raw: leafRaw },
  { name: "heart", raw: heartRaw },
  { name: "dinosaur", raw: dinosaurRaw },
];

export function parseSvg(raw: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName !== "svg") throw new Error("sample is not an SVG document");
  return document.importNode(svg, true) as unknown as SVGSVGElement;
}

export function injectDefs(svg: SVGSVGElement, defsMarkup: string): void {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = defsMarkup;
  svg.insertBefore(defs, svg.firstChild);
}

function viewBoxOf(svg: SVGSVGElement): { x: number; y: number; w: number; h: number } {
  const [x, y, w, h] = (svg.getAttribute("viewBox") ?? "0 0 100 100").split(/[\s,]+/).map(Number);
  return { x, y, w, h };
}

/**
 * Inserts the paper ground under the artwork and a vignette on top.
 * `paperFilterId` empty = flat paper (demo B has no filters at all).
 */
export function addPaper(svg: SVGSVGElement, paperFilterId: string): void {
  const { x, y, w, h } = viewBoxOf(svg);
  const ns = "http://www.w3.org/2000/svg";

  const paper = document.createElementNS(ns, "rect");
  paper.setAttribute("x", String(x));
  paper.setAttribute("y", String(y));
  paper.setAttribute("width", String(w));
  paper.setAttribute("height", String(h));
  paper.setAttribute("fill", "#f2e9d3");
  if (paperFilterId) paper.setAttribute("filter", `url(#${paperFilterId})`);
  const defs = svg.querySelector("defs");
  svg.insertBefore(paper, defs ? defs.nextSibling : svg.firstChild);

  const gradId = `vignette-${Math.random().toString(36).slice(2, 8)}`;
  const grad = document.createElementNS(ns, "radialGradient");
  grad.setAttribute("id", gradId);
  grad.innerHTML = `
    <stop offset="78%" stop-color="#3c2f1a" stop-opacity="0"/>
    <stop offset="100%" stop-color="#3c2f1a" stop-opacity="0.09"/>`;
  let defsEl = svg.querySelector("defs");
  if (!defsEl) {
    defsEl = document.createElementNS(ns, "defs");
    svg.insertBefore(defsEl, svg.firstChild);
  }
  defsEl.appendChild(grad);

  const vignette = document.createElementNS(ns, "rect");
  vignette.setAttribute("x", String(x));
  vignette.setAttribute("y", String(y));
  vignette.setAttribute("width", String(w));
  vignette.setAttribute("height", String(h));
  vignette.setAttribute("fill", `url(#${gradId})`);
  vignette.setAttribute("pointer-events", "none");
  svg.appendChild(vignette);
}

export function washPaths(svg: SVGSVGElement): SVGPathElement[] {
  return [...svg.querySelectorAll<SVGPathElement>(".washes path")];
}

export function partGroups(svg: SVGSVGElement): SVGGElement[] {
  return [...svg.querySelectorAll<SVGGElement>(".washes > g[id]")];
}

function stats(svg: SVGSVGElement): string {
  const bytes = new XMLSerializer().serializeToString(svg).length;
  const nodes = svg.querySelectorAll("*").length;
  const kb = (bytes / 1024).toFixed(1);
  return `${kb} KB · ${nodes} nodes`;
}

export function renderPage(
  title: string,
  description: string,
  transform: (svg: SVGSVGElement, sample: Sample) => void,
): void {
  const app = document.getElementById("app")!;
  // ?only=<name>&pane=treated renders a single sample's treated SVG
  // full-width — used for capturing README/docs images
  const params = new URLSearchParams(location.search);
  const only = params.get("only");
  const soloTreated = params.get("pane") === "treated";
  if (soloTreated) document.body.classList.add("solo");

  if (!soloTreated) {
    const header = document.createElement("header");
    header.className = "demo";
    header.innerHTML = `<h1>${title}</h1>
      <nav><a href="/">index</a><a href="/a.html">A filters</a><a href="/b.html">B geometry</a><a href="/c.html">C hybrid</a></nav>
      <p>${description}</p>`;
    app.appendChild(header);
  }

  for (const sample of samples.filter((s) => !only || s.name === only)) {
    const section = document.createElement("section");
    section.className = "sample";
    if (!soloTreated) section.innerHTML = `<h2>${sample.name}</h2>`;
    const pair = document.createElement("div");
    pair.className = "pair";

    const original = parseSvg(sample.raw);
    const treated = parseSvg(sample.raw);
    const t0 = performance.now();
    transform(treated, sample);
    const buildMs = performance.now() - t0;

    const panes = soloTreated
      ? ([["treated", treated, ""]] as const)
      : ([
          ["source", original, ""],
          ["treated", treated, ` · built in ${buildMs.toFixed(1)} ms`],
        ] as const);
    for (const [label, svg, extra] of panes) {
      const pane = document.createElement("div");
      pane.className = "pane";
      pane.appendChild(svg);
      const caption = document.createElement("div");
      caption.className = "caption";
      caption.innerHTML = `<span>${label}</span><span>${stats(svg)}${extra}</span>`;
      pane.appendChild(caption);
      pair.appendChild(pane);
    }
    section.appendChild(pair);
    app.appendChild(section);
  }
}
