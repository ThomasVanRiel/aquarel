import { addPaper, injectDefs, partGroups, renderPage } from "./demo-common";
import { inkFilter, paperFilter, washFilter } from "./filters";

renderPage(
  "Demo A — pure runtime SVG filters",
  "Original crisp geometry; all watercolor qualities (edge wobble, pigment rim, granulation, paper) from filter chains. Zero extra DOM weight, re-rasterizes on zoom.",
  (svg, sample) => {
    const parts = partGroups(svg);
    let defs = paperFilter(`paper-${sample.name}`) + inkFilter(`ink-${sample.name}`, { seed: 3 });
    parts.forEach((part, i) => {
      const id = `wash-${sample.name}-${i}`;
      defs += washFilter(id, { seed: 11 + i * 17 });
      part.setAttribute("filter", `url(#${id})`);
    });
    injectDefs(svg, defs);
    svg.querySelector(".ink")?.setAttribute("filter", `url(#ink-${sample.name})`);
    addPaper(svg, `paper-${sample.name}`);
  },
);
