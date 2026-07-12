export interface Pt {
  x: number;
  y: number;
}

export interface Subpath {
  points: Pt[];
  closed: boolean;
}

/**
 * Parses an SVG path `d` string (M/L/H/V/C and relatives, Z) and flattens
 * curves to polylines. `curveSegments` controls cubic sampling density.
 */
export function flattenPath(d: string, curveSegments = 16): Subpath[] {
  const tokens = d.match(/[MmLlHhVvCcZz]|-?\d*\.?\d+(?:e-?\d+)?/g);
  if (!tokens) return [];
  const subpaths: Subpath[] = [];
  let current: Pt[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let i = 0;
  let cmd = "";

  const num = () => parseFloat(tokens[i++]);
  const finish = (closed: boolean) => {
    if (current.length > 1) subpaths.push({ points: current, closed });
    current = [];
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "Z" || cmd === "z") {
        finish(true);
        cx = startX;
        cy = startY;
        continue;
      }
    }
    // implicit repeat of previous command uses `cmd` as-is;
    // an implicit command after M/m is L/l per spec
    if (cmd === "M" || cmd === "m") {
      const rel = cmd === "m";
      finish(false);
      cx = rel ? cx + num() : num();
      cy = rel ? cy + num() : num();
      startX = cx;
      startY = cy;
      current = [{ x: cx, y: cy }];
      cmd = rel ? "l" : "L";
      continue;
    }
    if (cmd === "L" || cmd === "l") {
      const rel = cmd === "l";
      cx = rel ? cx + num() : num();
      cy = rel ? cy + num() : num();
      current.push({ x: cx, y: cy });
      continue;
    }
    if (cmd === "H" || cmd === "h") {
      cx = cmd === "h" ? cx + num() : num();
      current.push({ x: cx, y: cy });
      continue;
    }
    if (cmd === "V" || cmd === "v") {
      cy = cmd === "v" ? cy + num() : num();
      current.push({ x: cx, y: cy });
      continue;
    }
    if (cmd === "C" || cmd === "c") {
      const rel = cmd === "c";
      const x1 = rel ? cx + num() : num();
      const y1 = rel ? cy + num() : num();
      const x2 = rel ? cx + num() : num();
      const y2 = rel ? cy + num() : num();
      const x3 = rel ? cx + num() : num();
      const y3 = rel ? cy + num() : num();
      for (let s = 1; s <= curveSegments; s++) {
        const u = s / curveSegments;
        const w = 1 - u;
        current.push({
          x: w * w * w * cx + 3 * w * w * u * x1 + 3 * w * u * u * x2 + u * u * u * x3,
          y: w * w * w * cy + 3 * w * w * u * y1 + 3 * w * u * u * y2 + u * u * u * y3,
        });
      }
      cx = x3;
      cy = y3;
      continue;
    }
    throw new Error(`Unsupported path command "${cmd}" in: ${d.slice(0, 40)}…`);
  }
  finish(false);
  return subpaths;
}

export function perimeter(points: Pt[], closed: boolean): number {
  let total = 0;
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i++) {
    const q = points[(i + 1) % points.length];
    total += Math.hypot(q.x - points[i].x, q.y - points[i].y);
  }
  return total;
}

/** Resamples a polyline/polygon to `n` points, evenly spaced by arc length. */
export function resample(points: Pt[], n: number, closed: boolean): Pt[] {
  const pts = closed ? [...points, points[0]] : points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cum[cum.length - 1];
  const count = closed ? n : n - 1;
  const out: Pt[] = [];
  let seg = 0;
  for (let k = 0; k < (closed ? n : n); k++) {
    const target = (total * k) / count;
    while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
    const span = cum[seg + 1] - cum[seg] || 1;
    const u = (target - cum[seg]) / span;
    out.push({
      x: pts[seg].x + (pts[seg + 1].x - pts[seg].x) * u,
      y: pts[seg].y + (pts[seg + 1].y - pts[seg].y) * u,
    });
  }
  return out;
}

/**
 * Serializes a closed polygon as a smooth Catmull-Rom spline (as cubic
 * beziers), removing the angular kinks of raw midpoint-displacement output.
 */
export function toSmoothClosedPathD(points: Pt[], precision = 1): string {
  const fmt = (v: number) => v.toFixed(precision).replace(/\.0+$/, "");
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n];
  let d = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d + "Z";
}

export function toPathD(subpaths: Subpath[], precision = 1): string {
  const fmt = (v: number) => v.toFixed(precision).replace(/\.0+$/, "");
  return subpaths
    .map(({ points, closed }) => {
      const cmds = points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`);
      return cmds.join("") + (closed ? "Z" : "");
    })
    .join("");
}
