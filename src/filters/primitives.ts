/**
 * Composable SVG filter primitives. Each builder emits a fragment of filter
 * markup that reads from `input` and writes to `result`, so recipes can
 * chain them freely. Parameter ranges documented per builder; values are
 * the Phase 1 tuned baselines.
 */

export interface EdgeWobbleParams {
  input: string;
  result: string;
  seed: number;
  /** displacement in user units. 5 = full wash wobble; 2–3 = subtle melt
   *  over already-organic geometry; >8 starts to shred thin strokes */
  scale: number;
  /** noise frequency. 0.03–0.05 = broad wet-edge undulation;
   *  0.08–0.12 = fine tremble */
  frequency: number;
  /** keep ≤ 3 for per-part filters (cost grows per octave) */
  octaves?: number;
}

/** Wet-edge wobble: fractal noise displacing the painted shape. */
export function edgeWobble(p: EdgeWobbleParams): string {
  const noise = `${p.result}-noise`;
  return `
    <feTurbulence type="fractalNoise" baseFrequency="${p.frequency}" numOctaves="${p.octaves ?? 3}" seed="${p.seed}" result="${noise}"/>
    <feDisplacementMap in="${p.input}" in2="${noise}" scale="${p.scale}" xChannelSelector="R" yChannelSelector="G" result="${p.result}"/>`;
}

export interface PigmentRimParams {
  input: string;
  result: string;
  /** rim width in user units; 0.8–1.4 sensible, scales with stroke weight */
  radius: number;
  /** 0..1 — how much darker the rim reads; 0.3–0.5 sensible */
  strength: number;
  /** rim opacity; lower if the rim reads as an outline glow */
  alpha?: number;
}

/**
 * Pigment pooling at the wash edge: erode the alpha, keep the rim band,
 * soften and darken it. Merge `result` over the paint afterwards.
 */
export function pigmentRim(p: PigmentRimParams): string {
  const slope = (1 - p.strength).toFixed(3);
  return `
    <feMorphology in="${p.input}" operator="erode" radius="${p.radius}" result="${p.result}-eroded"/>
    <feComposite in="${p.input}" in2="${p.result}-eroded" operator="out" result="${p.result}-band"/>
    <feGaussianBlur in="${p.result}-band" stdDeviation="${(p.radius * 0.55).toFixed(2)}" result="${p.result}-soft"/>
    <feComponentTransfer in="${p.result}-soft" result="${p.result}">
      <feFuncR type="linear" slope="${slope}"/>
      <feFuncG type="linear" slope="${slope}"/>
      <feFuncB type="linear" slope="${slope}"/>
      <feFuncA type="linear" slope="${p.alpha ?? 0.75}"/>
    </feComponentTransfer>`;
}

export interface GranulationParams {
  /** clip target: the painted shape whose interior gets the texture */
  input: string;
  result: string;
  seed: number;
  /** 0..1 pigment-speck visibility; 0.4–0.7 sensible */
  intensity: number;
  /** speck scale; 0.1–0.15 = coarse pigment, 0.2+ = fine grain */
  frequency?: string;
  /** speck color — dark warm tones read as pigment deposits */
  color?: string;
}

/** Granulation: noise-masked dark specks clipped to the paint alpha. */
export function granulation(p: GranulationParams): string {
  return `
    <feTurbulence type="fractalNoise" baseFrequency="${p.frequency ?? "0.11 0.13"}" numOctaves="2" seed="${p.seed}" result="${p.result}-noise"/>
    <feColorMatrix in="${p.result}-noise" type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0.9 0 0 -0.55" result="${p.result}-mask"/>
    <feFlood flood-color="${p.color ?? "#2c2013"}" flood-opacity="${(0.24 * p.intensity).toFixed(3)}" result="${p.result}-color"/>
    <feComposite in="${p.result}-color" in2="${p.result}-mask" operator="in" result="${p.result}-specks"/>
    <feComposite in="${p.result}-specks" in2="${p.input}" operator="in" result="${p.result}"/>`;
}

export interface PaperGrainParams {
  input: string;
  result: string;
  seed: number;
  /** relief height; 0.4–0.8 = laid paper, >1.2 reads as stucco */
  surfaceScale?: number;
  /** grain frequency; 0.04–0.06 typical */
  frequency?: number;
  /** light angle; higher elevation = flatter, brighter paper */
  elevation?: number;
}

/** Paper tooth: diffuse-lit noise multiplied over the paper color. */
export function paperGrain(p: PaperGrainParams): string {
  return `
    <feTurbulence type="fractalNoise" baseFrequency="${p.frequency ?? 0.05}" numOctaves="4" seed="${p.seed}" result="${p.result}-noise"/>
    <feDiffuseLighting in="${p.result}-noise" lighting-color="#ffffff" surfaceScale="${p.surfaceScale ?? 0.55}" result="${p.result}-light">
      <feDistantLight azimuth="45" elevation="${p.elevation ?? 70}"/>
    </feDiffuseLighting>
    <feBlend in="${p.input}" in2="${p.result}-light" mode="multiply" result="${p.result}"/>`;
}

export interface PaperSpecksParams {
  input: string;
  result: string;
  seed: number;
}

/** Sparse fiber flecks over the paper ground. */
export function paperSpecks(p: PaperSpecksParams): string {
  return `
    <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" seed="${p.seed}" result="${p.result}-noise"/>
    <feColorMatrix in="${p.result}-noise" type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.4 1.4 0 0 -1.75" result="${p.result}-mask"/>
    <feFlood flood-color="#5a4a30" flood-opacity="0.22" result="${p.result}-color"/>
    <feComposite in="${p.result}-color" in2="${p.result}-mask" operator="in" result="${p.result}-flecks"/>
    <feMerge>
      <feMergeNode in="${p.input}"/>
      <feMergeNode in="${p.result}-flecks"/>
    </feMerge>`;
}

export interface MisregisterParams {
  input: string;
  result: string;
  /** print offset in user units; 0.4–0.8 reads vintage without sloppiness */
  dx: number;
  dy: number;
}

/** Print misregistration: shifts the (already wobbled) ink plate. */
export function misregister(p: MisregisterParams): string {
  return `<feOffset in="${p.input}" dx="${p.dx}" dy="${p.dy}" result="${p.result}"/>`;
}

export interface AlphaScaleParams {
  input: string;
  result?: string;
  /** 0..1 multiplier on the alpha channel */
  slope: number;
}

/** Uniform translucency (watercolor never reaches full coverage). */
export function alphaScale(p: AlphaScaleParams): string {
  return `
    <feComponentTransfer in="${p.input}"${p.result ? ` result="${p.result}"` : ""}>
      <feFuncA type="linear" slope="${p.slope}"/>
    </feComponentTransfer>`;
}
