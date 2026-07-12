/**
 * Pipeline configuration. Defaults are the Phase 1 tuned baselines
 * (see PLAN.md "Phase 1 results"); per-figure and per-part overrides
 * follow the performance playbook.
 */

export interface GeometryConfig {
  /** user units between resampled outline points; 5 tracks small features,
   *  7–9 halves bytes on simple blobby shapes */
  spacing: number;
  /** hard cap on points per outline */
  maxPoints: number;
  /** translucent layers per wash */
  layers: number;
  /** per-layer fill opacity */
  layerOpacity: number;
  /** shrink toward centroid before deforming, so excursions land on the line */
  inset: number;
  /** deformation rounds for the shared base polygon / per layer */
  baseRounds: number;
  layerRounds: number;
  /** gaussian sd as fraction of edge length (base / per-layer) */
  magnitude: number;
  layerMagnitude: number;
  /** cubic flattening density */
  curveSegments: number;
}

export interface PaperConfig {
  enabled: boolean;
  color: string;
  vignette: boolean;
}

export interface FigureConfig extends GeometryConfig {
  /** deterministic seed; default derives from the figure name */
  seed?: number;
  /** "cheap" swaps every filter recipe to its declared cheap mode */
  mode: "full" | "cheap";
  paper: PaperConfig;
  /** per-part geometry overrides, keyed by part id */
  parts?: Record<string, Partial<GeometryConfig>>;
}

export const DEFAULT_FIGURE_CONFIG: FigureConfig = {
  spacing: 5,
  maxPoints: 140,
  layers: 4,
  layerOpacity: 0.3,
  inset: 0.995,
  baseRounds: 2,
  layerRounds: 1,
  magnitude: 0.05,
  layerMagnitude: 0.035,
  curveSegments: 12,
  mode: "full",
  paper: { enabled: true, color: "#f2e9d3", vignette: true },
};

export interface PipelineConfigFile {
  defaults?: Partial<FigureConfig>;
  /** keyed by figure name (input basename without extension) */
  figures?: Record<string, Partial<FigureConfig>>;
}

export function resolveConfig(file: PipelineConfigFile | undefined, figureName: string): FigureConfig {
  const merged = {
    ...DEFAULT_FIGURE_CONFIG,
    ...file?.defaults,
    ...file?.figures?.[figureName],
  };
  merged.paper = {
    ...DEFAULT_FIGURE_CONFIG.paper,
    ...file?.defaults?.paper,
    ...file?.figures?.[figureName]?.paper,
  };
  return merged;
}

/** Deterministic seed from the figure name (djb2). */
export function seedFromName(name: string): number {
  let h = 5381;
  for (const ch of name) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h >>> 0;
}
