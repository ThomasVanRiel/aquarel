import { addPaper, renderPage, washPaths } from "./demo-common";
import { deform, insetPolygon, watercolorLayers } from "./hobbs";
import { flattenPath, resample, toPathD } from "./path";
import { createRng } from "./rng";

const LAYERS = 30;
const LAYER_OPACITY = 0.055;

renderPage(
  "Demo B — pure build-time geometry (Hobbs layers)",
  `Every wash replaced by ${LAYERS} recursively deformed near-transparent polygons; ink lightly deformed geometry. No filters anywhere — deterministic in every browser, but heavy DOM.`,
  (svg, sample) => {
    const rng = createRng(sample.name.length * 1000 + 7);
    for (const path of washPaths(svg)) {
      const fill = path.getAttribute("fill") ?? "#888";
      const frag = document.createDocumentFragment();
      for (const sub of flattenPath(path.getAttribute("d") ?? "", 8)) {
        const base = insetPolygon(resample(sub.points, 22, true), 0.98);
        for (const layer of watercolorLayers(base, rng, {
          baseRounds: 3,
          layerRounds: 2,
          layers: LAYERS,
          magnitude: 0.12,
          layerMagnitude: 0.09,
        })) {
          const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
          p.setAttribute("d", toPathD([{ points: layer, closed: true }]));
          p.setAttribute("fill", fill);
          p.setAttribute("fill-opacity", String(LAYER_OPACITY));
          frag.appendChild(p);
        }
      }
      path.replaceWith(frag);
    }
    for (const path of svg.querySelectorAll<SVGPathElement>(".ink path")) {
      const subs = flattenPath(path.getAttribute("d") ?? "", 12).map((sub) => ({
        points: deform(resample(sub.points, 40, sub.closed), rng, 1, 0.06, sub.closed),
        closed: sub.closed,
      }));
      path.setAttribute("d", toPathD(subs));
    }
    addPaper(svg, "");
  },
);
