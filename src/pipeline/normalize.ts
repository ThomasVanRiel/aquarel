/**
 * Normalization: any input SVG → the aquarel authoring structure
 * (see PLAN.md "Authoring source SVGs").
 *
 * Two paths:
 * - **conventions fast path**: input already has `.washes` / `.ink` /
 *   `.labels` groups — taken as-is.
 * - **heuristic path** for arbitrary SVGs: filled paths become washes
 *   (split off their strokes into ink copies), stroke-only paths become
 *   ink, `<text>` becomes labels. Part grouping: nearest ancestor `<g id>`,
 *   else the path's own id, else generated `part-N`.
 *
 * Known v1 limits (documented, warn where detectable): only `path`,
 * `polygon`, `rect` and `text` elements are handled; `style` attributes
 * and CSS are ignored; occluded-edge ink trimming stays an authoring task.
 */

import { parse, stringify, type INode } from "svgson";
import { flattenPath, perimeter } from "../path";

export interface Wash {
  d: string;
  fill: string;
  isShade: boolean;
}

export interface Part {
  id: string;
  washes: Wash[];
}

export interface InkPath {
  d: string;
  attributes: Record<string, string>;
}

export interface Figure {
  viewBox: string;
  rootAttributes: Record<string, string>;
  parts: Part[];
  /** attributes of the source .ink group (conventions path), e.g. shared stroke */
  inkGroupAttributes: Record<string, string>;
  ink: InkPath[];
  /** serialized markup of the labels group children, passed through */
  labelsMarkup: string;
  warnings: string[];
}

const SHAPE_TO_PATH: Record<string, (a: Record<string, string>) => string | null> = {
  path: (a) => a.d ?? null,
  polygon: (a) =>
    a.points ? `M${a.points.trim().replace(/[\s,]+/g, " ").split(" ").join(" ")}Z`.replace(/^M(\S+) (\S+)/, "M$1 $2L") : null,
  rect: (a) => {
    const x = parseFloat(a.x ?? "0");
    const y = parseFloat(a.y ?? "0");
    const w = parseFloat(a.width ?? "0");
    const h = parseFloat(a.height ?? "0");
    return w > 0 && h > 0 ? `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z` : null;
  },
};

function hasClass(node: INode, cls: string): boolean {
  return (node.attributes.class ?? "").split(/\s+/).includes(cls);
}

function findByClass(node: INode, cls: string): INode | undefined {
  if (node.type === "element" && hasClass(node, cls)) return node;
  for (const child of node.children ?? []) {
    const hit = findByClass(child, cls);
    if (hit) return hit;
  }
  return undefined;
}

export async function normalize(svgSource: string, figureName: string): Promise<Figure> {
  const root = await parse(svgSource);
  if (root.name !== "svg") throw new Error(`${figureName}: input is not an SVG document`);
  const viewBox = root.attributes.viewBox;
  if (!viewBox) throw new Error(`${figureName}: input SVG must have a viewBox`);

  const warnings: string[] = [];
  const { width: _w, height: _h, ...rootAttributes } = root.attributes;

  const washesGroup = findByClass(root, "washes");
  const figure: Figure = {
    viewBox,
    rootAttributes,
    parts: [],
    inkGroupAttributes: {},
    ink: [],
    labelsMarkup: "",
    warnings,
  };

  if (washesGroup) {
    normalizeConventions(root, washesGroup, figure);
  } else {
    normalizeHeuristic(root, figure);
  }

  warnAdjacentWithoutOverlap(figure);
  return figure;
}

function normalizeConventions(root: INode, washesGroup: INode, figure: Figure): void {
  for (const partNode of washesGroup.children ?? []) {
    if (partNode.name !== "g" || !partNode.attributes.id) {
      figure.warnings.push(`.washes contains a non-part child <${partNode.name}> — skipped`);
      continue;
    }
    const part: Part = { id: partNode.attributes.id, washes: [] };
    for (const shape of partNode.children ?? []) {
      const d = SHAPE_TO_PATH[shape.name]?.(shape.attributes) ?? null;
      if (!d) {
        figure.warnings.push(`part "${part.id}": unsupported element <${shape.name}> — skipped`);
        continue;
      }
      part.washes.push({
        d,
        fill: shape.attributes.fill ?? "#888888",
        isShade: hasClass(shape, "shade"),
      });
    }
    figure.parts.push(part);
  }

  const inkGroup = findByClass(root, "ink");
  if (inkGroup) {
    const { class: _c, ...groupAttrs } = inkGroup.attributes;
    figure.inkGroupAttributes = groupAttrs;
    for (const shape of inkGroup.children ?? []) {
      const d = SHAPE_TO_PATH[shape.name]?.(shape.attributes) ?? null;
      if (!d) continue;
      const { d: _d, ...attributes } = shape.attributes;
      figure.ink.push({ d, attributes });
    }
  }

  const labelsGroup = findByClass(root, "labels");
  if (labelsGroup) figure.labelsMarkup = stringify(labelsGroup);
}

function normalizeHeuristic(root: INode, figure: Figure): void {
  let partCounter = 0;
  const labelNodes: INode[] = [];

  const walk = (node: INode, groupId: string | null) => {
    for (const child of node.children ?? []) {
      if (child.type !== "element") continue;
      if (child.name === "g") {
        walk(child, child.attributes.id ?? groupId);
        continue;
      }
      if (child.name === "text") {
        labelNodes.push(child);
        continue;
      }
      const toPath = SHAPE_TO_PATH[child.name];
      if (!toPath) {
        if (!["defs", "title", "desc", "metadata"].includes(child.name)) {
          figure.warnings.push(`unsupported element <${child.name}> — skipped`);
        }
        continue;
      }
      const d = toPath(child.attributes);
      if (!d) continue;
      if (child.attributes.style) {
        figure.warnings.push(`style attribute on <${child.name}> ignored (v1 reads presentation attributes only)`);
      }

      const fill = child.attributes.fill ?? "#000000"; // SVG default fill is black
      const stroke = child.attributes.stroke ?? "none";
      const hasFill = fill !== "none" && fill !== "transparent";
      const hasStroke = stroke !== "none" && stroke !== "transparent";

      if (hasFill) {
        const id = groupId ?? child.attributes.id ?? `part-${++partCounter}`;
        let part = figure.parts.find((p) => p.id === id);
        if (!part) {
          part = { id, washes: [] };
          figure.parts.push(part);
        }
        part.washes.push({ d, fill, isShade: hasClass(child, "shade") });
      }
      if (hasStroke) {
        // split: stroke copy joins the ink plate
        const attributes: Record<string, string> = { fill: "none", stroke };
        if (child.attributes["stroke-width"]) attributes["stroke-width"] = child.attributes["stroke-width"];
        figure.ink.push({ d, attributes });
      }
    }
  };
  walk(root, null);

  if (labelNodes.length > 0) {
    figure.labelsMarkup = `<g class="labels">${labelNodes.map((n) => stringify(n)).join("")}</g>`;
    figure.warnings.push(
      "text moved to labels group; leader lines cannot be auto-detected and stay in ink",
    );
  }
}

/**
 * Trapping heuristic (cheap, bbox-based): warn when two parts' bounding
 * boxes nearly touch but do not overlap — likely a shared boundary that
 * will show paper gaps after deformation. See authoring conventions.
 */
function warnAdjacentWithoutOverlap(figure: Figure): void {
  const boxes = figure.parts.map((part) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const wash of part.washes) {
      for (const sub of flattenPath(wash.d, 4)) {
        if (perimeter(sub.points, sub.closed) === 0) continue;
        for (const p of sub.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      }
    }
    return { id: part.id, minX, minY, maxX, maxY };
  });
  const GAP = 1;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlaps = a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
      const nearby =
        a.minX < b.maxX + GAP && b.minX < a.maxX + GAP && a.minY < b.maxY + GAP && b.minY < a.maxY + GAP;
      if (!overlaps && nearby) {
        figure.warnings.push(
          `parts "${a.id}" and "${b.id}" appear adjacent without overlap (bbox heuristic) — ` +
            `shared boundaries need trapping overlap or paper gaps will show`,
        );
      }
    }
  }
}
