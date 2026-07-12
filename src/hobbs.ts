import type { Pt } from "./path";
import type { Rng } from "./rng";

/**
 * One round of Tyler Hobbs-style polygon deformation: each edge gains a
 * midpoint displaced by a gaussian proportional to the edge length, mostly
 * along the edge normal. Offsets shrink automatically in later rounds
 * because subdivided edges are shorter.
 */
export function deformOnce(points: Pt[], rng: Rng, magnitude: number, closed: boolean): Pt[] {
  const out: Pt[] = [];
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    out.push(p);
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 1e-6) continue;
    const nx = -(q.y - p.y) / len;
    const ny = (q.x - p.x) / len;
    const alongX = (q.x - p.x) / len;
    const alongY = (q.y - p.y) / len;
    const offN = rng.gauss(0, magnitude * len);
    const offT = rng.gauss(0, magnitude * len * 0.5);
    out.push({
      x: (p.x + q.x) / 2 + nx * offN + alongX * offT,
      y: (p.y + q.y) / 2 + ny * offN + alongY * offT,
    });
  }
  if (!closed) out.push(points[points.length - 1]);
  return out;
}

/**
 * Shrinks a polygon toward its centroid. Used before deformation so the
 * outward excursions of the wash land on the ink line instead of past it.
 */
export function insetPolygon(points: Pt[], factor: number): Pt[] {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  return points.map((p) => ({
    x: cx + (p.x - cx) * factor,
    y: cy + (p.y - cy) * factor,
  }));
}

export function deform(
  points: Pt[],
  rng: Rng,
  rounds: number,
  magnitude: number,
  closed: boolean,
): Pt[] {
  let poly = points;
  for (let r = 0; r < rounds; r++) poly = deformOnce(poly, rng, magnitude, closed);
  return poly;
}

export interface LayerOptions {
  /** rounds applied once to derive the shared base polygon */
  baseRounds: number;
  /** extra rounds applied per layer on top of the base */
  layerRounds: number;
  layers: number;
  /** gaussian sd as a fraction of edge length */
  magnitude: number;
  /** magnitude used for the per-layer rounds (defaults to `magnitude`) */
  layerMagnitude?: number;
}

/**
 * Produces the layer stack for one polygon: a deformed base polygon shared
 * by all layers, then per-layer variations that differ in fine detail.
 */
export function watercolorLayers(source: Pt[], rng: Rng, opts: LayerOptions): Pt[][] {
  const base = deform(source, rng, opts.baseRounds, opts.magnitude, true);
  const layerMag = opts.layerMagnitude ?? opts.magnitude;
  const result: Pt[][] = [];
  for (let l = 0; l < opts.layers; l++) {
    result.push(deform(base, rng, opts.layerRounds, layerMag, true));
  }
  return result;
}
