/**
 * Filter recipes assembled from the composable primitives. Every recipe:
 * - sets color-interpolation-filters="sRGB" explicitly (browser defaults
 *   disagree: Safari sRGB, Chrome/Firefox linearRGB),
 * - expands the filter region so displacement isn't clipped at the bbox,
 * - declares a **cheap mode** (performance playbook / future morphing:
 *   swap to cheap during animation or on constrained figures, crossfade
 *   back to full at rest).
 */

import {
  alphaScale,
  edgeWobble,
  granulation,
  misregister,
  paperGrain,
  paperSpecks,
  pigmentRim,
} from "./primitives";

export type RecipeMode = "full" | "cheap";

const SRGB = `color-interpolation-filters="sRGB"`;

function filterEl(id: string, body: string, region = `x="-25%" y="-25%" width="150%" height="150%"`): string {
  return `\n  <filter id="${id}" ${region} ${SRGB}>${body}\n  </filter>`;
}

export interface WashOptions {
  seed: number;
  mode?: RecipeMode;
  /** edge wobble in user units (5 = full effect on crisp geometry;
   *  2–3 = melt over pre-deformed layers) */
  displacementScale?: number;
  /** wobble noise frequency, 0.03–0.12 */
  edgeFrequency?: number;
  /** pigment rim width, user units */
  rimRadius?: number;
  /** 0..1 rim darkening */
  rimStrength?: number;
  /** 0..1 granulation visibility */
  grain?: number;
  /** skip displacement entirely (geometry already organic) */
  displace?: boolean;
}

/**
 * Watercolor wash: edge wobble + pigment rim + granulation + translucency.
 * Cheap mode: displacement only (no rim, no granulation) — 2 primitives
 * instead of ~12.
 */
export function washFilter(id: string, opts: WashOptions): string {
  const {
    seed,
    mode = "full",
    displacementScale = 5,
    edgeFrequency = 0.045,
    rimRadius = 1.1,
    rimStrength = 0.35,
    grain = 0.5,
    displace = true,
  } = opts;

  const paintStage = displace
    ? edgeWobble({ input: "SourceGraphic", result: "paint", seed, scale: displacementScale, frequency: edgeFrequency })
    : `<feOffset in="SourceGraphic" dx="0" dy="0" result="paint"/>`;

  if (mode === "cheap") {
    return filterEl(id, paintStage + alphaScale({ input: "paint", slope: 0.92 }));
  }

  const body =
    paintStage +
    pigmentRim({ input: "paint", result: "rim-dark", radius: rimRadius, strength: rimStrength }) +
    granulation({ input: "paint", result: "grain", seed: seed + 41, intensity: grain }) +
    alphaScale({ input: "paint", result: "paint-translucent", slope: 0.92 }) +
    `
    <feMerge>
      <feMergeNode in="paint-translucent"/>
      <feMergeNode in="grain"/>
      <feMergeNode in="rim-dark"/>
    </feMerge>`;
  return filterEl(id, body);
}

export interface InkOptions {
  seed: number;
  mode?: RecipeMode;
  /** hand wobble, user units; 1.5–2.5 sensible */
  displacementScale?: number;
  /** misregistration offset, user units */
  offsetX?: number;
  offsetY?: number;
}

/**
 * Ink linework: hand wobble + print misregistration + slight fade.
 * Cheap mode: offset only (keeps the plate's registration character
 * without the turbulence raster).
 */
export function inkFilter(id: string, opts: InkOptions): string {
  const { seed, mode = "full", displacementScale = 1.7, offsetX = 0.55, offsetY = 0.35 } = opts;
  if (mode === "cheap") {
    return filterEl(
      id,
      misregister({ input: "SourceGraphic", result: "shifted", dx: offsetX, dy: offsetY }) +
        alphaScale({ input: "shifted", slope: 0.95 }),
    );
  }
  const body =
    edgeWobble({ input: "SourceGraphic", result: "wobbled", seed, scale: displacementScale, frequency: 0.03, octaves: 2 }) +
    misregister({ input: "wobbled", result: "shifted", dx: offsetX, dy: offsetY }) +
    alphaScale({ input: "shifted", slope: 0.95 });
  return filterEl(id, body);
}

export interface PaperOptions {
  seed?: number;
  mode?: RecipeMode;
}

/**
 * Aged paper ground: apply to a rect filled with the paper color.
 * Cheap mode: returns "" — omit the filter attribute, flat paper.
 */
export function paperFilter(id: string, opts: PaperOptions = {}): string {
  const { seed = 8, mode = "full" } = opts;
  if (mode === "cheap") return "";
  const body =
    paperGrain({ input: "SourceGraphic", result: "papered", seed }) +
    paperSpecks({ input: "papered", result: "specks", seed: seed + 5 });
  return filterEl(id, body, `x="0%" y="0%" width="100%" height="100%"`);
}

/** Radial vignette gradient markup for the plate edges (put in defs). */
export function vignetteGradient(id: string, opts: { start?: string; opacity?: number; color?: string } = {}): string {
  const { start = "78%", opacity = 0.09, color = "#3c2f1a" } = opts;
  return `<radialGradient id="${id}">
    <stop offset="${start}" stop-color="${color}" stop-opacity="0"/>
    <stop offset="100%" stop-color="${color}" stop-opacity="${opacity}"/>
  </radialGradient>`;
}
