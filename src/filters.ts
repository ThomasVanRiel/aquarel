/**
 * Parametric SVG filter recipe generators.
 * Every filter sets color-interpolation-filters="sRGB" (browsers disagree on
 * the default) and an expanded filter region so displacement isn't clipped.
 */

const REGION = `x="-25%" y="-25%" width="150%" height="150%"`;
const SRGB = `color-interpolation-filters="sRGB"`;

export interface WashOptions {
  seed: number;
  /** edge wobble strength in user units */
  displacementScale?: number;
  /** turbulence frequency for edge wobble */
  edgeFrequency?: number;
  /** width of the darkened pigment rim, user units */
  rimRadius?: number;
  /** 0..1, how much darker the rim reads */
  rimStrength?: number;
  /** granulation intensity 0..1 */
  grain?: number;
  /** skip the displacement stage (hybrid demo: geometry already organic) */
  displace?: boolean;
}

/** Full watercolor wash: edge wobble + pigment rim + granulation. */
export function washFilter(id: string, opts: WashOptions): string {
  const {
    seed,
    displacementScale = 5,
    edgeFrequency = 0.045,
    rimRadius = 1.1,
    rimStrength = 0.35,
    grain = 0.5,
    displace = true,
  } = opts;
  const rimSlope = (1 - rimStrength).toFixed(3);
  const grainOpacity = (0.24 * grain).toFixed(3);
  const displaceStage = displace
    ? `<feTurbulence type="fractalNoise" baseFrequency="${edgeFrequency}" numOctaves="3" seed="${seed}" result="edge-noise"/>
       <feDisplacementMap in="SourceGraphic" in2="edge-noise" scale="${displacementScale}" xChannelSelector="R" yChannelSelector="G" result="paint"/>`
    : `<feOffset in="SourceGraphic" dx="0" dy="0" result="paint"/>`;
  return `
  <filter id="${id}" ${REGION} ${SRGB}>
    ${displaceStage}
    <feMorphology in="paint" operator="erode" radius="${rimRadius}" result="eroded"/>
    <feComposite in="paint" in2="eroded" operator="out" result="rim"/>
    <feGaussianBlur in="rim" stdDeviation="${(rimRadius * 0.55).toFixed(2)}" result="rim-soft"/>
    <feComponentTransfer in="rim-soft" result="rim-dark">
      <feFuncR type="linear" slope="${rimSlope}"/>
      <feFuncG type="linear" slope="${rimSlope}"/>
      <feFuncB type="linear" slope="${rimSlope}"/>
      <feFuncA type="linear" slope="0.75"/>
    </feComponentTransfer>
    <feTurbulence type="fractalNoise" baseFrequency="0.11 0.13" numOctaves="2" seed="${seed + 41}" result="grain-noise"/>
    <feColorMatrix in="grain-noise" type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0.9 0 0 -0.55" result="grain-mask"/>
    <feFlood flood-color="#2c2013" flood-opacity="${grainOpacity}" result="grain-color"/>
    <feComposite in="grain-color" in2="grain-mask" operator="in" result="grain"/>
    <feComposite in="grain" in2="paint" operator="in" result="grain-clipped"/>
    <feComponentTransfer in="paint" result="paint-translucent">
      <feFuncA type="linear" slope="0.92"/>
    </feComponentTransfer>
    <feMerge>
      <feMergeNode in="paint-translucent"/>
      <feMergeNode in="grain-clipped"/>
      <feMergeNode in="rim-dark"/>
    </feMerge>
  </filter>`;
}

export interface InkOptions {
  seed: number;
  /** wobble strength, user units */
  displacementScale?: number;
  /** misregistration offset, user units */
  offsetX?: number;
  offsetY?: number;
}

/** Ink outline: light hand wobble + print misregistration offset. */
export function inkFilter(id: string, opts: InkOptions): string {
  const { seed, displacementScale = 1.7, offsetX = 0.55, offsetY = 0.35 } = opts;
  return `
  <filter id="${id}" ${REGION} ${SRGB}>
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="${seed}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="${displacementScale}" xChannelSelector="R" yChannelSelector="G" result="wobbled"/>
    <feOffset in="wobbled" dx="${offsetX}" dy="${offsetY}" result="shifted"/>
    <feComponentTransfer in="shifted">
      <feFuncA type="linear" slope="0.95"/>
    </feComponentTransfer>
  </filter>`;
}

/** Paper grain: apply to a rect flood-filled with the paper color. */
export function paperFilter(id: string, seed = 8): string {
  return `
  <filter id="${id}" x="0%" y="0%" width="100%" height="100%" ${SRGB}>
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4" seed="${seed}" result="n"/>
    <feDiffuseLighting in="n" lighting-color="#ffffff" surfaceScale="0.55" result="light">
      <feDistantLight azimuth="45" elevation="70"/>
    </feDiffuseLighting>
    <feBlend in="SourceGraphic" in2="light" mode="multiply" result="papered"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" seed="${seed + 5}" result="speck-noise"/>
    <feColorMatrix in="speck-noise" type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.4 1.4 0 0 -1.75" result="speck-mask"/>
    <feFlood flood-color="#5a4a30" flood-opacity="0.22" result="speck-color"/>
    <feComposite in="speck-color" in2="speck-mask" operator="in" result="specks"/>
    <feMerge>
      <feMergeNode in="papered"/>
      <feMergeNode in="specks"/>
    </feMerge>
  </filter>`;
}
