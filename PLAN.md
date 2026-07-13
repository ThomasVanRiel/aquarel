# aquarel — Project Plan

Goal: render SVGs with a watercolor effect in the style of old biology/anatomy
textbook plates (muted washes, edge darkening, ink outlines, aged paper), while
keeping the result an **interactive SVG** embeddable in a website. This plan is
written to be self-contained for future sessions.

## Scope & target integration

The deliverable is **framework-agnostic**: plain SVG output plus (if needed)
a dependency-free vanilla ES module for interactivity. No coupling to Astro,
anime.js, or Tailwind — transferability is an explicit goal. Thomas's Astro 5
website (`/home/thomas/source/website`) is simply the *first consumer*; its
`src/content/articles/03-animated-svg/Dinosaur.astro` component is useful
mainly as a **source of example SVG paths** (three morph-compatible dinosaur
poses, fill + stroke on the same paths) — copy those paths into `samples/`,
normalized to the authoring conventions below (split each path into a
fill-only and a stroke-only copy).

## Research summary (July 2026)

There are two fundamentally different ways to get a watercolor look while
staying in SVG, plus a recommended hybrid.

### Approach A — Runtime SVG filters

Apply `<filter>` chains to the existing shapes. The classic recipe stack:

- **Wobbly wet edges**: `feTurbulence type="fractalNoise"` →
  `feDisplacementMap` (scale ~5–20). Different `seed` per layer varies edges.
- **Edge darkening** (the dark rim where pigment pools): erode the shape's
  alpha with `feMorphology operator="erode"`, subtract from the original via
  `feComposite operator="out"` to isolate a rim, blur slightly, darken with
  `feColorMatrix`/`feComposite arithmetic`, recomposite over the fill.
- **Granulation/mottling inside washes**: a second `feTurbulence` composited
  into the fill alpha with `feComposite operator="arithmetic"` or
  `feBlend mode="multiply"`.
- **Paper texture** (one filter on a background rect): `feTurbulence`
  (fractalNoise, baseFrequency ~0.04, numOctaves 4–5) → `feDiffuseLighting`
  with `feDistantLight` (azimuth ~45, elevation ~60), blended `multiply`.
- **Print misregistration**: render the ink-outline layer with its own
  displacement seed and a 1–2px `feOffset` so outlines don't align perfectly
  with fills — signature vintage-lithograph look.
- **Muted palette / aging**: `feColorMatrix` to desaturate + warm, or just
  design the palette that way.

Pros: full interactivity preserved (filters don't affect pointer events or
DOM semantics); small payload; parametric (hover can tweak filter params).
Cons: performance and fidelity caveats below.

**Hard-won gotchas from research:**

- Set `color-interpolation-filters="sRGB"` explicitly on every filter. The
  spec default is linearRGB; Safari defaults to sRGB, Chrome/Firefox to
  linearRGB — unset, results differ visibly across browsers.
- Expand the filter region (`x="-20%" y="-20%" width="140%" height="140%"`)
  or displacement/blur gets clipped at the shape's bbox.
- `feTurbulence` cost grows with `numOctaves` (keep ≤ 3–4 for per-shape
  filters) and with filter-region area. GPU acceleration of SVG filters is
  inconsistent across browsers; assume CPU. Firefox historically slowest at
  feTurbulence (Bugzilla #422371).
- Prefer **one filter on a group** over per-path filters where the recipe
  allows; each filtered element is a separate raster pass.
- Static (non-animated) filters are rendered once and cached until
  invalidated — cost is mostly at load/zoom, not per-frame. Avoid animating
  filter parameters except on small areas.
- `backdrop-filter` + SVG filters is NOT interoperable (WebKit bug 245510) —
  irrelevant as long as we use plain `filter=` on SVG elements, which is
  well-supported.

### Approach B — Build-time geometry generation (Tyler Hobbs algorithm)

Preprocess each SVG in Node: for every filled path, recursively deform the
polygon (~7 rounds for a base polygon, then 4–5 more rounds per layer) and
stack 30–100 near-transparent (~4% opacity) layers. Output is plain SVG paths:
deterministic, identical in every browser, no runtime filter cost, and the
most authentic watercolor fade-out at edges.

- Reference algorithm: Tyler Hobbs, "A Guide to Simulating Watercolor Paint
  with Generative Art" (tylerxhobbs.com).
- Existing JS implementation: `32bitkid/watercolorizer` (TypeScript monorepo:
  deformation core, tracer, Visvalingam–Whyatt simplifier; ~15 stars, license
  unclear — check before depending on it; likely easier to implement the
  algorithm ourselves, it's simple).

Cons: file size and DOM node count explode (30–100 paths per shape); gzip
helps a lot (self-similar geometry) but the DOM cost is real for complex
plates. Edge darkening and granulation are harder to get from pure geometry.

### Approach C — Hybrid (recommended starting point)

- A **small number of pre-deformed layers** per shape (2–5, generated at
  build time) for the organic silhouette variation filters can't fake well,
  **plus** lightweight runtime filters for edge darkening, granulation, and
  paper texture.
- **Interactivity pattern**: keep the *original* crisp paths on top as
  invisible hit targets (`fill="transparent"`, `pointer-events="fill"`,
  proper `id`/`aria-label`/`tabindex`), with the painterly presentation
  layers underneath marked `pointer-events="none"`. Hover/focus toggles a
  class that adjusts the presentation layers (e.g. brighten a wash, thicken
  outline). This decouples aesthetics from interaction completely.
- Labels stay real `<text>` (old-style serif, leader lines), so they remain
  selectable/accessible.

### Aesthetic checklist for the "old biology textbook" look

1. Muted, slightly desaturated palette on a warm/yellowed paper ground.
2. Washes with edge darkening + granulation, not flat fills.
3. Fine ink/lithograph outlines with slight wobble, misregistered 1–2px
   from the fills.
4. Paper texture + subtle vignette.
5. Engraved-style serif labels with leader lines; figure numbering.
6. Optional: stippling/hatching for shading (SVG pattern fills, displaced).

## Future work (out of scope for now): path morphing

Thomas wants to try morphing the watercolor figures later (the Dinosaur.astro
pattern: animate `d` + `fill` between compatible poses). Not a current
requirement, but keep the architecture from precluding it:

- Morphing breaks build-time deformed layers (frozen copies of one pose) but
  composes naturally with runtime filters — the filter re-rasterizes the
  morphing shape every frame. That per-frame re-rasterization is the
  expensive case for SVG filters.
- **Planned strategy: degraded-filter mode during animation.** While a morph
  runs, swap to a cheap presentation (no filter, or a minimal displacement-
  only filter); when it settles, crossfade to the full watercolor rendering
  (both variants briefly in the DOM, opacity crossfade, so the one-time
  re-raster of the full filter is hidden). Design the filter recipe library
  so each recipe has a declared "cheap mode" from the start.
- Authoring note for future morphable figures: implement the fills/outlines
  separation as *two stacked copies of the same path* (one fill-only, one
  stroke-only) so both morph with the same `d` targets.
- If filters-during-morph ever must look full-quality: per-pose layer
  generation with same seed and matching vertex counts is the (complex)
  fallback.

**Prototype built 2026-07-12 — `/m.html` (`src/demo-m.ts`,
`src/dino-poses.ts`).** Demonstrates the full strategy with the three
Dinosaur.astro poses: full pipeline render per pose pre-generated
in-browser; on morph, a cheap layer (crisp fill+stroke paths, cheap-mode
wash filter, flat paper) takes over and morphs via dependency-free point
interpolation — both poses resampled to 72 arc-length-uniform points,
lerped, serialized with `toSmoothClosedPathD` (robust to incompatible
path command structures, unlike raw `d` lerping) — with an
easeOutElastic ease; on settle, the target's full render crossfades in
(200 ms) hiding its one-time raster cost. Sail ink per pose derives from
the trim rule (drop the closed outline's bottom-return segments). FPS
counter included; measure in a real browser — headless Firefox stalls
timers/rAF while a screenshot waits on the load event, so the morph loop
can't be exercised headlessly (synchronous `?test=<from>:<to>:<t>` hook
verifies the interpolation + cheap/settled states instead).

## Performance playbook (when a figure costs too much)

Ordered by what to try first; "leave the look as is" is the default and
these are the sanctioned degradation steps. The geometry knobs are
parametrized per figure in the hybrid pipeline (`WashGeometryOptions` /
`GEOMETRY_OVERRIDES` in demo-c, to be carried into the Phase 3 CLI).

**Output size / DOM weight (geometry side):**
1. Raise `spacing` per figure (5 → 7–9). Simple blobby shapes (leaf, heart
   were confirmed OK) lose nothing visible; roughly halves output bytes.
   Keep 5 only for figures with small features (thin legs, scallops).
2. Lower `maxPoints` (140 → 96) to cap pathological outlines.
3. Drop `layers` 4 → 3 (raise opacity 0.30 → 0.38 to keep density).
4. Serialize coordinates at precision 1 (already default); gzip does the
   rest — self-similar layer geometry compresses very well.

**Filter raster cost (runtime side):**
1. Prefer one filter per part *group*, never per path (already the
   pattern); if a figure has many parts, merge parts that share a seed
   into one filtered group.
2. Drop the granulation stage first — it's the least visible primitive
   and removes a turbulence + three composites.
3. Keep `numOctaves` ≤ 3 on washes; the paper filter (octaves 4–5) exists
   once per figure so it matters less, but it's next in line.
4. Reduce filter region padding (-25%/150% → -10%/120%) on figures whose
   displacement is small; smaller region = fewer rasterized pixels.
5. Last resort: the "cheap mode" swap from the Future-work section (no
   filter or displacement-only during interaction, full recipe at rest).

**Whole-page:** lazy-render offscreen figures (IntersectionObserver before
injecting the treated SVG); never animate filter parameters on large areas.

## Authoring source SVGs

Sources are the "paint-by-numbers" version; the pipeline adds all painterly
qualities. Conventions the pipeline must be built against:

- Each wash region = one closed path, flat `fill`, no stroke, no gradients,
  no filters in source. Muted final palette authored directly.
- **Adjacent regions overlap slightly** (trapping): edge deformation is
  independent per shape, so shared boundaries without overlap produce
  paper-colored gaps. Consistent stacking order: broad washes below,
  detail washes above.
- Shading = additional darker overlapping wash shapes (2–3 tone steps),
  never gradients.
- Ink linework is a **separate group** of stroked paths on top of the fills;
  it gets only light wobble + misregistration, not the wash treatment.
- Because the ink group draws above *all* washes, **trim linework that the
  source's stacking order would hide**: where one part overlaps another,
  outline only the visible edge (open path), don't close the occluded
  boundary. (Example: the dinosaur sail's ink is only the scalloped top
  edge — its base would otherwise stroke across the body.)
- One `<g id="part-name">` per interactive part, containing that part's
  fill shapes; the build step derives hit-targets and interactivity from
  these ids.
- Labels + leader lines in their own top-level group, kept as real `<text>`.
- Geometry hygiene: modest node counts, no embedded rasters, no `<use>` for
  fill geometry (or flatten before deforming).
- Tooling: Inkscape (layers ↔ fills/outlines/labels split); trace over
  public-domain plates (BHL, old Gray's Anatomy) on a locked reference layer.

## Roadmap

### Phase 1 — Spike & comparison harness
- Repo scaffolding: `git init`, Vite + vanilla TS dev harness (no framework
  commitment yet), a `samples/` dir with 3 test SVGs — one simple botanical
  shape (leaf), one multi-part anatomical-style figure, and the dinosaur
  paths from Dinosaur.astro normalized per "Scope & target integration".
  Public-domain plates (e.g. from BHL / old Gray's Anatomy scans) as
  *visual reference only*.
- Build 3 demo pages: pure-filter recipe (A), pure-geometry (B, quick Hobbs
  implementation), hybrid (C). Same source SVG in each.
- Measure: visual quality side by side, file size, load-time raster cost,
  interaction latency on hover.
- Test Chrome + Firefox; Safari is best-effort (Decision 4) — spot-check in
  WebKitGTK (Epiphany) as a proxy, never block on real-Safari verification.
- Stretch (informs future morphing work, not a decision input): morph the
  filtered dinosaur sample with a quick rAF `d` interpolation and note the
  frame rate, to size up the degraded-filter-mode need early.
- **Exit criterion**: pick the approach (expected: C) with the user.
  → **DECIDED 2026-07-12: Thomas picked C (hybrid).** Phase 1 complete;
  A's filter recipes live on inside C. Demo B stays as reference only.

**Phase 1 results (2026-07-12).** Harness built (`npm run dev`, pages
`/a.html` `/b.html` `/c.html`), all three approaches implemented and tuned
in Firefox. Output size for the same source (leaf 1.2 KB / heart 1.9 KB /
dinosaur 2.9 KB):

| Approach | leaf | heart | dinosaur | build time |
|---|---|---|---|---|
| A pure filters | 6.2 KB | 10.1 KB | 7.9 KB | ~0–1 ms |
| B 30 Hobbs layers, no filters | 605 KB | 1 201 KB | ~325 KB | 17–27 ms |
| C hybrid (4 layers + light filters) | 49 KB | 97 KB | 37 KB | 3–4 ms |

Findings: A and C both read convincingly as old-plate watercolor after one
tuning pass; C has the softest, most organic wash edges. B alone proves the
size explosion is real and lacks rim/granulation. Tuned parameter baselines
live in the demo sources (`washFilter` defaults, displacement 5; B: inset
0.98, magnitude 0.12/0.09 at 22 resampled points; C: 4 layers, **resampled by
spacing, never fixed count** (one point per ~5 user units, clamp 16–140;
fixed-count sampling aliased small features — dinosaur legs and sail
scallops came out jagged), flatten 12 segments/cubic,
inset 0.995, baseRounds 2 / layerRounds 1, magnitude 0.05/0.035, opacity
0.30, **layers serialized as Catmull-Rom splines** (`toSmoothClosedPathD`
— raw midpoint-displacement polygons look jaggy, Thomas rejected them) plus
a light filter displacement (scale 2.5, freq 0.08) to melt layer edges.
Amplitude lesson (Thomas rejected two rounds of larger values): deformation
must stay *small* — washes hug the linework like Demo A, ±1 user unit of
wobble; the layers' job is tonal depth at the edge, not silhouette variation;
paper: surfaceScale 0.55, elevation 70; ink displacement 1.7, alpha 0.95). Containment feedback from Thomas: washes
must stay essentially inside the linework — solved by insetting the base
polygon toward its centroid (`insetPolygon`) before deforming, so outward
excursions land on the ink line. Hover hit-target pattern implemented in C.
Still to do: user eyeballs demos + picks approach; WebKitGTK spot-check;
Chrome check (not installed here); stretch morph FPS test.

### Phase 2 — Filter recipe library
- `src/filters/`: composable filter defs (wash, edge-darken, granulate,
  paper + vignette, misregister) generated by a small TS function so
  parameters (seed, scale, frequency) are data, not copy-paste.
- Every filter: `color-interpolation-filters="sRGB"`, expanded region,
  documented parameter ranges.

**DONE 2026-07-12.** `src/filters/` now holds `primitives.ts` (edgeWobble,
pigmentRim, granulation, paperGrain, paperSpecks, misregister, alphaScale —
each a chainable in/result fragment with parameter ranges in JSDoc) and
`recipes.ts` (washFilter / inkFilter / paperFilter assembled from
primitives + vignetteGradient). Every recipe declares a **cheap mode**
(wash: displacement-only; ink: offset-only; paper: none/flat) per the
performance playbook. Verified pixel-identical to the pre-refactor demos
(magick compare, only timing-caption text differs). Gotcha for dev: after
deleting/moving a module, restart `vite` — the dev server's module graph
kept resolving the old `filters.ts` and served a blank page while the
production build was fine.

### Phase 3 — Build-time pipeline
*(The normalization + hit-target/paint-structure part is a firm requirement
— adapting existing SVGs is in scope per Decision 2. The Hobbs-deformation
part depends on the Phase 1 decision and is dropped if pure filters win.)*
- Normalization step: restructure arbitrary input SVGs to the authoring
  conventions — split fill/stroke paths, build part groups, flag (or
  auto-add) trapping overlaps where adjacent regions share boundaries.
- Node CLI: input SVG → parse paths (svgson or similar) → flatten to
  polygons (svg-path-properties / flatten-js) → Hobbs deformation for N
  presentation layers → emit output SVG with `<g class="paint">` +
  `<g class="hit">` structure described above.
- Deterministic via seeded PRNG so builds are reproducible.
- Config per-shape: layer count, opacity, deform intensity, palette mapping.

**DONE 2026-07-12.** `npm run pipeline -- <input.svg> [-o out] [-c
config.json] [--cheap] [--no-paper]` (tsx + svgson devDeps; core modules
were already DOM-free). `src/pipeline/`: `config.ts` (defaults = Phase 1
baselines; per-figure + per-part overrides; djb2 name-derived seed),
`normalize.ts` (conventions fast path via `.washes`/`.ink`/`.labels`
classes, heuristic path for arbitrary SVGs: fill/stroke split, part ids
from ancestor `g[id]`, text → labels, bbox-based adjacent-without-overlap
warning), `paint.ts` (emits defs/paper/g.paint/g.ink/labels/vignette/g.hit).
Path parser extended with S/Q commands (arcs still unsupported — error).
Verified: conventions samples byte-size-match demo C and render identically
in character (seeds differ by design); heuristic path tested on a
fill+stroke+text SVG; cheap mode drops turbulence count 7 → 2 on the leaf.
v1 limits documented in normalize.ts: `style` attrs ignored, leader lines
stay in ink, occluded-ink trimming remains an authoring task.

### Phase 4 — Interactivity & a11y
All four interaction patterns confirmed in scope (Decision 6):
- Hover/focus highlight of a part via the hit-target layer.
- Label ↔ part linking (hover either, both highlight; leader line
  emphasized) — the classic textbook-plate interaction.
- Tooltips / adjacent info panel fed by part metadata.
- External controls (buttons outside the SVG) changing figure state,
  as a supported pattern in the runtime helper.
- Keyboard navigation across parts; `role="img"`/`aria-label` structure.
- Small runtime helper (dependency-free ES module) the website imports.

**DONE 2026-07-12.** `src/runtime/index.ts` — dependency-free `Aquarel`
class (an EventTarget; factory `aquarel(svg, options)`). Covers all four
patterns: hover/focus boosts each layer path's fill-opacity ×1.35 (JS
inline style, NOT css `filter` — that would override the SVG filter
attribute); labels tagged `data-part` link both ways with leader-line
emphasis; opt-in pointer tooltip fed by `data-label`/`data-info`;
external controls via `ctrl.set(id, on)`/`ctrl.parts`/`ctrl.focus(id)`
plus `partenter`/`partleave`/`partclick` CustomEvents. Keyboard: hit
paths get tabindex+role=button+aria-label, arrows/Home/End walk parts,
Enter/Space clicks. Pipeline now carries part `data-*` through to paint
groups and emits `role="img"` + `aria-label` + `<title>` statically
(runtime upgrades role to `group`). Metadata conventions: `data-label`
(display name), `data-info` (tooltip detail) on part groups; `data-part`
on label text + leaders. Demo: `/p.html` runs normalize→paint in-browser
on the raw samples + wires the runtime (event log, per-part toggle
buttons, `?activate=<figure>:<part>` for headless highlight testing —
verified via pixel diff). Multi-path parts: pointerover/out filtered by
`relatedTarget.dataset.part` to avoid flicker between washes of the
same part.

### Phase 5 — Website integration & performance validation
- Deliverable stays framework-agnostic (plain SVG + optional vanilla ES
  module); write a thin example integration for the Astro site as the first
  consumer, plus a plain-HTML usage example to prove transferability.
- Lazy-render offscreen figures; measure with real plate-complexity SVGs;
  budget: first render < 100ms for a typical figure on mid hardware.
- Check filter raster quality across rendered sizes (small inline figure vs
  full-width vs browser zoom): filters re-rasterize on zoom and noise-based
  texture is resolution-dependent, so verify the effect holds up and
  parameters don't need size-tiered presets.
- Dark mode: probably keep paper look (a plate is a plate), but decide.

## Decisions (all former open questions resolved 2026-07-12)
1. **Stack**: keep it generic — plain SVG + dependency-free ES module, no
   framework coupling. The Astro 5 website is the first consumer, not the
   target.
2. **SVG sources: both** — flagship figures traced by hand in Inkscape over
   public-domain plates, *and* adapting existing/found SVGs is supported.
   Consequence: the pipeline's normalization step (split fill/stroke, part
   groups, trapping overlaps) is a firm requirement, not conditional.
3. **Animation**: static for now; path morphing is future work (see "Future
   work" section) — don't preclude it.
4. **Safari: best effort** — follow the known gotchas (explicit sRGB
   color-interpolation, expanded regions, no backdrop-filter), spot-check in
   WebKitGTK/Epiphany, but never block on real-Safari verification.
5. **Dark mode: decide later**, once real figures exist on a real page
   (Phase 5). Default assumption remains keeping the paper look.
6. **Interactions (Phase 4 scope, all confirmed)**: hover/focus highlight,
   label ↔ part linking, tooltips/info panel, and external controls that
   change figure state — all four are in scope for the runtime helper.

## Sources
- https://tylerxhobbs.com/words/a-guide-to-simulating-watercolor-paint-with-generative-art
- https://github.com/32bitkid/watercolorizer
- https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/
- https://www.smashingmagazine.com/2021/09/deep-dive-wonderful-world-svg-displacement-filtering/
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/color-interpolation-filters
- http://tavmjong.free.fr/SVG/COLOR_INTERPOLATION/ (color-space gotcha)
- https://bugzilla.mozilla.org/show_bug.cgi?id=422371 (feTurbulence perf)
- https://codepen.io/sevenissimo/pen/Kojaqj and
  https://codepen.io/origan/pen/YOGpjp (watercolor filter recipes to study)
- https://codepen.io/Chokcoco/pen/OJWLXPY (rough paper texture)
- https://camillovisini.com/coding/simulating-hand-drawn-motion-with-svg-filters
