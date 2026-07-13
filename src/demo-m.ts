/**
 * Morph demo — prototype of the PLAN.md future-work strategy:
 *
 * - At rest, the figure is a full watercolor render (pipeline output),
 *   pre-generated per pose.
 * - During a morph, a **cheap layer** takes over: crisp fill+stroke paths
 *   under a displacement-only filter (every recipe's declared cheap mode),
 *   morphing via dependency-free point interpolation.
 * - When the morph settles, the target pose's full render crossfades in,
 *   hiding its one-time raster cost.
 *
 * Also measures the Phase 1 stretch metric: FPS during the 800 ms morph.
 */

import { dinoPoses, type Pose, type PoseName } from "./dino-poses";
import { washFilter } from "./filters";
import { flattenPath, resample, toSmoothClosedPathD } from "./path";
import { normalize, paint, resolveConfig } from "./pipeline";

const NS = "http://www.w3.org/2000/svg";
const VIEWBOX = "-10 -10 120 80";
const MORPH_MS = 2000;
const FADE_MS = 600;
const POINTS = 72;

// ---- page scaffold ----
const app = document.getElementById("app")!;
app.innerHTML = `
  <header class="demo">
    <h1>Morph demo — degraded filter during animation</h1>
    <nav><a href="/">index</a><a href="/c.html">C hybrid</a><a href="/p.html">pipeline</a></nav>
    <p>Full watercolor at rest; a cheap displacement-only presentation morphs
       between poses, then the target's full render crossfades back in.</p>
  </header>
  <section class="sample">
    <div class="pane">
      <div id="stage" style="position:relative;width:100%;aspect-ratio:120/80"></div>
      <div class="caption"><span id="buttons"></span><span id="fps"></span></div>
    </div>
  </section>`;
const stage = document.getElementById("stage")!;
const fpsEl = document.getElementById("fps")!;

// ---- pose sample sources → full watercolor renders (pre-generated) ----
function poseSampleSvg(pose: Pose): string {
  return `<svg xmlns="${NS}" viewBox="${VIEWBOX}">
    <g class="washes">
      <g id="sail" data-label="crista dorsalis"><path fill="${pose.sail.fill}" d="${pose.sail.d}"/></g>
      <g id="body" data-label="corpus"><path fill="${pose.body.fill}" d="${pose.body.d}"/></g>
    </g>
    <g class="ink" fill="none" stroke="#2c2620" stroke-width="0.5">
      <path d="${pose.sail.inkD ?? pose.sail.d}"/>
      <path d="${pose.body.inkD ?? pose.body.d}"/>
    </g>
  </svg>`;
}

const STACK_STYLE = `position:absolute;inset:0;width:100%;height:100%;transition:opacity ${FADE_MS}ms`;
const fullRenders = new Map<PoseName, SVGSVGElement>();
for (const name of Object.keys(dinoPoses) as PoseName[]) {
  const figure = await normalize(poseSampleSvg(dinoPoses[name]), `dino-${name}`);
  stage.insertAdjacentHTML("beforeend", paint(figure, `dino-${name}`, resolveConfig(undefined, `dino-${name}`)));
  const svg = stage.querySelector<SVGSVGElement>("svg:last-of-type")!;
  svg.setAttribute("style", STACK_STYLE);
  svg.style.opacity = "0";
  fullRenders.set(name, svg);
}

// ---- cheap morph layer: crisp fill+stroke paths, displacement-only filter ----
stage.insertAdjacentHTML(
  "beforeend",
  `<svg xmlns="${NS}" viewBox="${VIEWBOX}" style="${STACK_STYLE}">
    <defs>${washFilter("morph-cheap", { seed: 11, mode: "cheap", displacementScale: 2.5, edgeFrequency: 0.08 })}</defs>
    <rect x="-10" y="-10" width="120" height="80" fill="#f2e9d3"/>
    <g filter="url(#morph-cheap)" stroke="#2c2620" stroke-width="0.5">
      <path id="morph-sail"/>
      <path id="morph-body"/>
    </g>
  </svg>`,
);
const cheapSvg = stage.querySelector<SVGSVGElement>("svg:last-of-type")!;
cheapSvg.style.opacity = "0";
const morphSail = cheapSvg.querySelector<SVGPathElement>("#morph-sail")!;
const morphBody = cheapSvg.querySelector<SVGPathElement>("#morph-body")!;

// ---- morph math ----
type Pt = { x: number; y: number };
const posePoints = new Map<PoseName, { sail: Pt[]; body: Pt[] }>();
for (const name of Object.keys(dinoPoses) as PoseName[]) {
  const pose = dinoPoses[name];
  posePoints.set(name, {
    sail: resample(flattenPath(pose.sail.d, 12)[0].points, POINTS, true),
    body: resample(flattenPath(pose.body.d, 12)[0].points, POINTS, true),
  });
}

const lerpPts = (a: Pt[], b: Pt[], t: number): Pt[] =>
  a.map((p, i) => ({ x: p.x + (b[i].x - p.x) * t, y: p.y + (b[i].y - p.y) * t }));

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const lerpColor = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const ch = (x: number, y: number) =>
    Math.round(Math.max(0, Math.min(255, x + (y - x) * t)))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
};

/** approximates anime.js easeOutElastic(1, 0.7) */
const easeOutElastic = (t: number): number =>
  t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.7 / 4) * (2 * Math.PI)) / (0.7 * 10)) + 1;

// ---- state machine ----
let current: PoseName = "stego";
let animating = false;
fullRenders.get(current)!.style.opacity = "1";

function morphTo(target: PoseName): void {
  if (animating || target === current) return;
  animating = true;
  const from = dinoPoses[current];
  const to = dinoPoses[target];
  const fromPts = posePoints.get(current)!;
  const toPts = posePoints.get(target)!;

  // cheap layer takes over at the source pose
  morphSail.setAttribute("d", from.sail.d);
  morphSail.setAttribute("fill", from.sail.fill);
  morphBody.setAttribute("d", from.body.d);
  morphBody.setAttribute("fill", from.body.fill);
  cheapSvg.style.opacity = "1";
  fullRenders.get(current)!.style.opacity = "0";

  let frames = 0;
  const t0 = performance.now();
  const tick = (now: number) => {
    frames++;
    const t = Math.min(1, (now - t0) / MORPH_MS);
    const e = easeOutElastic(t);
    morphSail.setAttribute("d", toSmoothClosedPathD(lerpPts(fromPts.sail, toPts.sail, e)));
    morphBody.setAttribute("d", toSmoothClosedPathD(lerpPts(fromPts.body, toPts.body, e)));
    morphSail.setAttribute("fill", lerpColor(from.sail.fill, to.sail.fill, Math.min(1, e)));
    morphBody.setAttribute("fill", lerpColor(from.body.fill, to.body.fill, Math.min(1, e)));
    if (t < 1) {
      requestAnimationFrame(tick);
      return;
    }
    fpsEl.textContent = `morph: ${Math.round((frames / MORPH_MS) * 1000)} fps`;
    // settle: crossfade the target's full watercolor back in
    fullRenders.get(target)!.style.opacity = "1";
    setTimeout(() => {
      cheapSvg.style.opacity = "0";
      current = target;
      animating = false;
    }, FADE_MS);
  };
  requestAnimationFrame(tick);
}

// ---- external controls ----
const buttons = document.getElementById("buttons")!;
const NAMES: Record<PoseName, string> = { stego: "Stegosaurus", diplo: "Diplodocus", raptor: "Velociraptor" };
for (const name of Object.keys(dinoPoses) as PoseName[]) {
  const button = document.createElement("button");
  button.textContent = NAMES[name];
  button.style.cssText = "margin-right:0.5rem;font:inherit;padding:0.1rem 0.6rem";
  button.addEventListener("click", () => morphTo(name));
  buttons.appendChild(button);
}

// ?test=<from>:<to>:<t> renders the cheap morph layer at interpolation
// point t synchronously (headless testing of the morph math + cheap-mode
// visuals; t=1 also shows the settled crossfade state). Timer/rAF-driven
// verification doesn't work in headless Firefox — timers stall while the
// screenshot waits.
const test = new URLSearchParams(location.search).get("test");
if (test) {
  const [f, to, tStr] = test.split(":") as [PoseName, PoseName, string];
  const t = parseFloat(tStr);
  if (f in dinoPoses && to in dinoPoses && t >= 0 && t <= 1) {
    fullRenders.get(current)!.style.opacity = "0";
    const from = dinoPoses[f];
    const target = dinoPoses[to];
    morphSail.setAttribute("d", toSmoothClosedPathD(lerpPts(posePoints.get(f)!.sail, posePoints.get(to)!.sail, t)));
    morphBody.setAttribute("d", toSmoothClosedPathD(lerpPts(posePoints.get(f)!.body, posePoints.get(to)!.body, t)));
    morphSail.setAttribute("fill", lerpColor(from.sail.fill, target.sail.fill, t));
    morphBody.setAttribute("fill", lerpColor(from.body.fill, target.body.fill, t));
    if (t === 1) {
      fullRenders.get(to)!.style.opacity = "1";
      current = to;
    } else {
      cheapSvg.style.opacity = "1";
    }
    fpsEl.textContent = `test: ${f}→${to} @ t=${t}`;
  }
}
