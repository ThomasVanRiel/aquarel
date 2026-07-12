# aquarel

Watercolor rendering for interactive SVGs, in the style of old biology
textbook plates. (Aquarel = Dutch for watercolor.) Renders SVGs with a
watercolor effect while keeping them interactive for embedding in Thomas's
website. GitHub: git@github.com:ThomasVanRiel/aquarel.git

The deliverable is framework-agnostic (plain SVG + dependency-free vanilla
ES module) — transferability is an explicit goal. The Astro 5 website at
`/home/thomas/source/website` is the first consumer, not the target; its
`src/content/articles/03-animated-svg/Dinosaur.astro` provides example SVG
paths for `samples/`. Path morphing (anime.js-style `d`/`fill` animation) is
future work, not a current requirement — don't preclude it; the planned
strategy is a degraded cheap filter during animation, crossfading to the full
watercolor filter at rest (each filter recipe should declare a "cheap mode").

**Start here: read `PLAN.md`** — it contains the full technique research
(SVG filter recipes, Tyler Hobbs geometry algorithm, hybrid approach),
cross-browser gotchas, the phased roadmap, and open questions. Work through
the phases in order; Phase 1 is a comparison spike of three rendering
approaches.

Conventions decided so far:
- Output must stay real, interactive SVG (no canvas/raster final output).
- Every SVG filter sets `color-interpolation-filters="sRGB"` explicitly and
  expands its filter region beyond the shape bbox.
- Interaction is decoupled from paint: invisible crisp hit-target paths on
  top, presentation layers underneath with `pointer-events="none"`.
- Build tooling in TypeScript/Node; dev harness with Vite; no framework
  commitment yet for the deliverable module.
- Environment: Linux (CachyOS). No Safari available — use WebKitGTK as a
  proxy and track Safari verification as an open item. Never run sudo.
