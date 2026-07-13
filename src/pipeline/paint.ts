/**
 * Paint step: normalized Figure → final aquarel SVG string.
 * Mirrors demo C exactly (Phase 1 tuned baselines) and emits the
 * conventions output structure:
 *
 *   defs → paper rect → g.paint (per-part groups, filtered, inert)
 *        → g.ink (filtered, inert) → labels → vignette → g.hit
 *
 * The hit group carries the crisp source geometry with data-part
 * attributes; the Phase 4 runtime helper wires events onto it.
 */

import { inkFilter, paperFilter, vignetteGradient, washFilter } from "../filters";
import { insetPolygon, watercolorLayers } from "../hobbs";
import { flattenPath, perimeter, resample, toSmoothClosedPathD } from "../path";
import { createRng } from "../rng";
import { seedFromName, type FigureConfig, type GeometryConfig } from "./config";
import type { Figure } from "./normalize";

function esc(v: string): string {
  return v.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function attrs(a: Record<string, string>): string {
  return Object.entries(a)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join("");
}

export function paint(figure: Figure, figureName: string, cfg: FigureConfig): string {
  const seed = cfg.seed ?? seedFromName(figureName);
  const rng = createRng(seed);
  const mode = cfg.mode;
  const [vx, vy, vw, vh] = figure.viewBox.split(/[\s,]+/).map(Number);

  // ---- defs: filters + vignette ----
  let defs = "";
  const paperFilterId = `${figureName}-paper`;
  const paperFilterMarkup = cfg.paper.enabled ? paperFilter(paperFilterId, { seed: seed % 100, mode }) : "";
  defs += paperFilterMarkup;
  const inkFilterId = `${figureName}-ink`;
  defs += inkFilter(inkFilterId, { seed: (seed % 100) + 3, mode });
  figure.parts.forEach((_part, i) => {
    defs += washFilter(`${figureName}-wash-${i}`, {
      seed: (seed % 100) + 11 + i * 17,
      mode,
      displacementScale: 2.5,
      edgeFrequency: 0.08,
      rimRadius: 0.9,
      grain: 0.6,
    });
  });
  const vignetteId = `${figureName}-vignette`;
  if (cfg.paper.enabled && cfg.paper.vignette) defs += vignetteGradient(vignetteId);

  // ---- paint layers ----
  const paintGroups = figure.parts
    .map((part, i) => {
      const geo: GeometryConfig = { ...cfg, ...cfg.parts?.[part.id] };
      const layerPaths = part.washes
        .map((wash) => {
          let out = "";
          for (const sub of flattenPath(wash.d, geo.curveSegments)) {
            const n = Math.min(
              geo.maxPoints,
              Math.max(16, Math.round(perimeter(sub.points, true) / geo.spacing)),
            );
            const base = insetPolygon(resample(sub.points, n, true), geo.inset);
            for (const layer of watercolorLayers(base, rng, {
              baseRounds: geo.baseRounds,
              layerRounds: geo.layerRounds,
              layers: geo.layers,
              magnitude: geo.magnitude,
              layerMagnitude: geo.layerMagnitude,
            })) {
              out += `\n      <path d="${toSmoothClosedPathD(layer)}" fill="${esc(wash.fill)}" fill-opacity="${geo.layerOpacity}"/>`;
            }
          }
          return out;
        })
        .join("");
      return `\n    <g id="${esc(part.id)}"${attrs(part.attributes)} filter="url(#${figureName}-wash-${i})">${layerPaths}\n    </g>`;
    })
    .join("");

  // ---- ink ----
  const inkPaths = figure.ink
    .map((p) => `\n    <path d="${esc(p.d)}"${attrs(p.attributes)}/>`)
    .join("");
  const inkGroup =
    figure.ink.length > 0
      ? `\n  <g class="ink"${attrs(figure.inkGroupAttributes)} filter="url(#${inkFilterId})" pointer-events="none">${inkPaths}\n  </g>`
      : "";

  // ---- hit targets: crisp source washes (non-shade) ----
  const hitPaths = figure.parts
    .flatMap((part) =>
      part.washes
        .filter((w) => !w.isShade)
        .map(
          (w) =>
            `\n    <path d="${esc(w.d)}" data-part="${esc(part.id)}" fill="transparent" stroke="none"/>`,
        ),
    )
    .join("");

  const paperRect = cfg.paper.enabled
    ? `\n  <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${esc(cfg.paper.color)}"${
        paperFilterMarkup ? ` filter="url(#${paperFilterId})"` : ""
      }/>`
    : "";
  const vignetteRect =
    cfg.paper.enabled && cfg.paper.vignette
      ? `\n  <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="url(#${vignetteId})" pointer-events="none"/>`
      : "";

  // static accessibility baseline: role="img" + name; the runtime helper
  // upgrades the role to "group" when it wires interactivity
  const rootAttrs = {
    xmlns: "http://www.w3.org/2000/svg",
    role: "img",
    "aria-label": figureName,
    ...figure.rootAttributes,
  };

  return `<svg${attrs(rootAttrs)}>
  <title>${esc(figureName)}</title>
  <defs>${defs}</defs>${paperRect}
  <g class="paint" pointer-events="none">${paintGroups}
  </g>${inkGroup}
  ${figure.labelsMarkup}${vignetteRect}
  <g class="hit">${hitPaths}
  </g>
</svg>
`;
}
