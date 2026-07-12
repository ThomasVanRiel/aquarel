import { addPaper, injectDefs, partGroups, renderPage } from "./demo-common";
import { inkFilter, paperFilter, washFilter } from "./filters";
import { insetPolygon, watercolorLayers } from "./hobbs";
import { flattenPath, perimeter, resample, toSmoothClosedPathD } from "./path";
import { createRng } from "./rng";

const LAYERS = 4;
const LAYER_OPACITY = 0.3;

export interface WashGeometryOptions {
  /**
   * User units between resampled outline points. The main
   * quality/size knob: 5 tracks small features (dinosaur legs, sail
   * scallops); simple blobby shapes (leaf, heart) stay fine up to ~9
   * at roughly half the output bytes.
   */
  spacing: number;
  /** hard cap on points per outline, whatever the spacing says */
  maxPoints: number;
  layers: number;
}

const DEFAULT_GEOMETRY: WashGeometryOptions = {
  spacing: 5,
  maxPoints: 140,
  layers: LAYERS,
};

/** Per-figure overrides, e.g. `leaf: { spacing: 9 }` to trade bytes for
 *  fidelity on shapes without small features. Empty = current look. */
const GEOMETRY_OVERRIDES: Partial<Record<string, Partial<WashGeometryOptions>>> = {};

renderPage(
  "Demo C — hybrid (few layers + light filters) — hover the parts",
  `${LAYERS} deformed layers per wash, smoothed as Catmull-Rom splines, plus filters for a light edge melt + pigment rim + granulation + paper. Crisp source paths kept on top as invisible hover hit-targets.`,
  (svg, sample) => {
    const geo = { ...DEFAULT_GEOMETRY, ...GEOMETRY_OVERRIDES[sample.name] };
    const parts = partGroups(svg);
    let defs = paperFilter(`paper-${sample.name}`) + inkFilter(`ink-${sample.name}`, { seed: 3 });
    const rng = createRng(sample.name.length * 991 + 5);
    const ns = "http://www.w3.org/2000/svg";
    const hitLayer = document.createElementNS(ns, "g");
    hitLayer.setAttribute("class", "hit");

    parts.forEach((part, i) => {
      const id = `washlite-${sample.name}-${i}`;
      defs += washFilter(id, {
        seed: 11 + i * 17,
        displacementScale: 2.5,
        edgeFrequency: 0.08,
        rimRadius: 0.9,
        grain: 0.6,
      });
      part.setAttribute("filter", `url(#${id})`);

      for (const path of [...part.querySelectorAll<SVGPathElement>("path")]) {
        // crisp copy becomes the hit target before the paint replaces it
        if (!path.classList.contains("shade")) {
          const hit = document.createElementNS(ns, "path");
          hit.setAttribute("d", path.getAttribute("d") ?? "");
          hit.setAttribute("fill", "transparent");
          hit.setAttribute("stroke", "none");
          hit.setAttribute("data-part", part.id);
          hit.addEventListener("mouseenter", () => part.classList.add("active"));
          hit.addEventListener("mouseleave", () => part.classList.remove("active"));
          hitLayer.appendChild(hit);
        }
        const fill = path.getAttribute("fill") ?? "#888";
        const frag = document.createDocumentFragment();
        for (const sub of flattenPath(path.getAttribute("d") ?? "", 12)) {
          // sample by spacing, not fixed count: long outlines with small
          // features (dinosaur legs, sail scallops) need proportionally
          // more points or the spline aliases them into jagged flailing
          const n = Math.min(
            geo.maxPoints,
            Math.max(16, Math.round(perimeter(sub.points, true) / geo.spacing)),
          );
          const base = insetPolygon(resample(sub.points, n, true), 0.995);
          for (const layer of watercolorLayers(base, rng, {
            baseRounds: 2,
            layerRounds: 1,
            layers: geo.layers,
            magnitude: 0.05,
            layerMagnitude: 0.035,
          })) {
            const p = document.createElementNS(ns, "path");
            p.setAttribute("d", toSmoothClosedPathD(layer));
            p.setAttribute("fill", fill);
            p.setAttribute("fill-opacity", String(LAYER_OPACITY));
            frag.appendChild(p);
          }
        }
        path.replaceWith(frag);
      }
    });

    injectDefs(svg, defs);
    svg.querySelector(".ink")?.setAttribute("filter", `url(#ink-${sample.name})`);
    addPaper(svg, `paper-${sample.name}`);
    svg.appendChild(hitLayer);
  },
);

const style = document.createElement("style");
style.textContent = `
  .washes g.active path { fill-opacity: 0.42; }
  .hit path { cursor: pointer; }
`;
document.head.appendChild(style);
