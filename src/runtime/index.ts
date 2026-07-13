/**
 * aquarel runtime helper — dependency-free, framework-agnostic ES module.
 *
 * Wires interactivity onto an aquarel-rendered SVG (the pipeline's output
 * structure: `g.paint > g[id]` presentation groups, `g.hit > path[data-part]`
 * crisp hit targets, labels optionally tagged `data-part`).
 *
 * Covers the four interaction patterns (PLAN.md Decision 6):
 *  1. hover/focus highlight of a part,
 *  2. label ↔ part linking (hover either, both respond),
 *  3. tooltips fed by part metadata (`data-label` / `data-info`),
 *  4. external controls via the controller API (`set`, `parts`, events).
 * Plus keyboard access: parts are tabbable, arrow keys walk them,
 * Enter/Space activates (fires `partclick`).
 *
 * Events (CustomEvent on the controller, `detail: { partId }`):
 * `partenter`, `partleave`, `partclick`.
 */

export interface AquarelOptions {
  /** show a tooltip near the pointer using data-label/data-info */
  tooltip?: boolean;
  /** fill-opacity multiplier while a part is highlighted */
  highlightBoost?: number;
  /** accessible name for the figure (defaults to existing aria-label) */
  label?: string;
}

interface PartRefs {
  id: string;
  paint: SVGGElement | null;
  hits: SVGPathElement[];
  labels: Element[];
  /** display name from data-label, falling back to the id */
  name: string;
  info: string | null;
}

export class Aquarel extends EventTarget {
  readonly svg: SVGSVGElement;
  private refs = new Map<string, PartRefs>();
  private order: string[] = [];
  private boost: number;
  private tooltipEl: HTMLDivElement | null = null;
  private active = new Set<string>();
  private cleanups: (() => void)[] = [];

  constructor(svg: SVGSVGElement, options: AquarelOptions = {}) {
    super();
    this.svg = svg;
    this.boost = options.highlightBoost ?? 1.35;

    svg.setAttribute("role", "group");
    if (options.label) svg.setAttribute("aria-label", options.label);

    for (const hit of svg.querySelectorAll<SVGPathElement>(".hit path[data-part]")) {
      const id = hit.dataset.part!;
      let refs = this.refs.get(id);
      if (!refs) {
        const paint = svg.querySelector<SVGGElement>(`.paint g[id="${CSS.escape(id)}"]`);
        refs = {
          id,
          paint,
          hits: [],
          labels: [...svg.querySelectorAll(`.labels [data-part="${CSS.escape(id)}"]`)],
          name: paint?.dataset.label ?? id,
          info: paint?.dataset.info ?? null,
        };
        this.refs.set(id, refs);
        this.order.push(id);
      }
      refs.hits.push(hit);
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("role", "button");
      hit.setAttribute("aria-label", refs.name);
      hit.style.cursor = "pointer";
      this.listen(hit, "pointerover", (e) => {
        if (this.isSamePart(e as PointerEvent, id)) return;
        this.enter(id);
      });
      this.listen(hit, "pointerout", (e) => {
        if (this.isSamePart(e as PointerEvent, id)) return;
        this.leave(id);
      });
      this.listen(hit, "pointermove", (e) => this.moveTooltip(e as PointerEvent, id, options));
      this.listen(hit, "click", () => this.emit("partclick", id));
      this.listen(hit, "focusin", () => this.enter(id));
      this.listen(hit, "focusout", () => this.leave(id));
      this.listen(hit, "keydown", (e) => this.onKey(e as KeyboardEvent, id));
    }

    // label → part linking (hover a label, the part responds)
    for (const [id, refs] of this.refs) {
      for (const label of refs.labels) {
        (label as HTMLElement).style.cursor = "pointer";
        this.listen(label, "pointerover", () => this.enter(id));
        this.listen(label, "pointerout", () => this.leave(id));
        this.listen(label, "click", () => this.emit("partclick", id));
      }
    }
  }

  /** part ids in document order */
  get parts(): string[] {
    return [...this.order];
  }

  /** external-controls API: highlight a part on/off programmatically */
  set(partId: string, on: boolean): void {
    if (on) this.enter(partId);
    else this.leave(partId);
  }

  /** move keyboard focus to a part's hit target */
  focus(partId: string): void {
    this.refs.get(partId)?.hits[0]?.focus();
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.tooltipEl?.remove();
    this.tooltipEl = null;
  }

  // ---- internals ----

  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn);
    this.cleanups.push(() => target.removeEventListener(type, fn));
  }

  /** ignore pointerover/out between two hit paths of the same part */
  private isSamePart(e: PointerEvent, id: string): boolean {
    const related = e.relatedTarget as HTMLElement | null;
    return related?.dataset?.part === id;
  }

  private emit(type: string, partId: string): void {
    this.dispatchEvent(new CustomEvent(type, { detail: { partId } }));
  }

  private enter(id: string): void {
    if (this.active.has(id)) return;
    const refs = this.refs.get(id);
    if (!refs) return;
    this.active.add(id);
    if (refs.paint) {
      for (const path of refs.paint.querySelectorAll<SVGPathElement>("path")) {
        const base = parseFloat(path.getAttribute("fill-opacity") ?? "1");
        path.style.fillOpacity = String(Math.min(1, base * this.boost));
      }
    }
    for (const label of refs.labels) {
      const el = label as SVGGraphicsElement;
      if (label.tagName === "text") el.style.fontWeight = "700";
      else {
        const base = parseFloat(label.getAttribute("stroke-width") ?? "1");
        el.style.strokeWidth = String(base * 1.8);
      }
    }
    this.emit("partenter", id);
  }

  private leave(id: string): void {
    if (!this.active.has(id)) return;
    const refs = this.refs.get(id);
    if (!refs) return;
    this.active.delete(id);
    if (refs.paint) {
      for (const path of refs.paint.querySelectorAll<SVGPathElement>("path")) {
        path.style.fillOpacity = "";
      }
    }
    for (const label of refs.labels) {
      const el = label as SVGGraphicsElement;
      el.style.fontWeight = "";
      el.style.strokeWidth = "";
    }
    this.hideTooltip();
    this.emit("partleave", id);
  }

  private onKey(e: KeyboardEvent, id: string): void {
    const index = this.order.indexOf(id);
    let target: string | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") target = this.order[index + 1] ?? this.order[0];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      target = this.order[index - 1] ?? this.order[this.order.length - 1];
    else if (e.key === "Home") target = this.order[0];
    else if (e.key === "End") target = this.order[this.order.length - 1];
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.emit("partclick", id);
      return;
    } else return;
    e.preventDefault();
    if (target) this.focus(target);
  }

  private moveTooltip(e: PointerEvent, id: string, options: AquarelOptions): void {
    if (!options.tooltip) return;
    const refs = this.refs.get(id);
    if (!refs) return;
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement("div");
      Object.assign(this.tooltipEl.style, {
        position: "fixed",
        pointerEvents: "none",
        background: "#fffdf5",
        border: "1px solid #c9bfa8",
        borderRadius: "2px",
        padding: "0.25rem 0.5rem",
        font: "italic 0.85rem Georgia, serif",
        color: "#35302a",
        boxShadow: "1px 1px 3px rgba(60,47,26,0.25)",
        zIndex: "10",
        display: "none",
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(this.tooltipEl);
    }
    this.tooltipEl.innerHTML = refs.info
      ? `<strong>${refs.name}</strong><br><span style="font-style:normal;font-size:0.78rem">${refs.info}</span>`
      : refs.name;
    this.tooltipEl.style.display = "block";
    this.tooltipEl.style.left = `${e.clientX + 12}px`;
    this.tooltipEl.style.top = `${e.clientY + 14}px`;
  }

  private hideTooltip(): void {
    if (this.tooltipEl) this.tooltipEl.style.display = "none";
  }
}

/** Convenience factory. */
export function aquarel(svg: SVGSVGElement, options?: AquarelOptions): Aquarel {
  return new Aquarel(svg, options);
}
