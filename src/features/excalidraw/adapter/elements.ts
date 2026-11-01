import type { ExBinding, ExElement, ExPoint } from "./types";

/** Deterministic 31-bit hash so repeated conversions produce identical seeds. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 2147483647 || 1;
}

let clock: () => number = () => Date.now();
/** Test hook: freeze the timestamp used for `updated`. */
export function setAdapterClock(fn: () => number) {
  clock = fn;
}

function base(id: string, type: ExElement["type"], props: Partial<ExElement>): ExElement {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: hashString(id),
    version: 1,
    versionNonce: hashString(`${id}:1`),
    isDeleted: false,
    boundElements: null,
    updated: clock(),
    link: null,
    locked: false,
    ...props,
  };
}

export function createShape(
  id: string,
  shape: "rectangle" | "ellipse" | "diamond",
  props: Partial<ExElement>,
): ExElement {
  return base(id, shape, {
    roundness: shape === "rectangle" ? { type: 3 } : { type: 2 },
    ...props,
  });
}

export function createText(
  id: string,
  text: string,
  props: Partial<ExElement> & { fontSize: number; fontFamily: number },
): ExElement {
  const lines = text.split("\n");
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const width = props.width ?? Math.ceil(longest * props.fontSize * 0.6);
  const height = props.height ?? Math.ceil(lines.length * props.fontSize * 1.25);
  return base(id, "text", {
    text,
    originalText: text,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: null,
    autoResize: true,
    lineHeight: 1.25,
    strokeWidth: 1,
    ...props,
    width,
    height,
  });
}

export function createArrow(
  id: string,
  start: ExPoint,
  points: ExPoint[],
  props: Partial<ExElement> & { startBinding: ExBinding | null; endBinding: ExBinding | null },
): ExElement {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return base(id, "arrow", {
    x: start[0],
    y: start[1],
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points,
    lastCommittedPoint: null,
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
    roundness: points.length > 2 ? { type: 2 } : null,
    ...props,
  });
}

export function createLine(id: string, start: ExPoint, points: ExPoint[], props: Partial<ExElement>): ExElement {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return base(id, "line", {
    x: start[0],
    y: start[1],
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
    ...props,
  });
}

/** Return a copy with a bumped version if anything differs from `prev`. */
export function withVersion(prev: ExElement | undefined, next: ExElement): ExElement {
  if (!prev) return next;
  const strip = (e: ExElement) => {
    const { version: _v, versionNonce: _n, updated: _u, seed: _s, ...rest } = e;
    return JSON.stringify(rest);
  };
  if (strip(prev) === strip(next)) {
    return { ...next, version: prev.version, versionNonce: prev.versionNonce, updated: prev.updated, seed: prev.seed };
  }
  const version = prev.version + 1;
  return { ...next, seed: prev.seed, version, versionNonce: hashString(`${next.id}:${version}`), updated: clock() };
}

/** Convert absolute polyline points to Excalidraw's (origin, relative points) form. */
export function toRelative(points: ExPoint[]): { origin: ExPoint; rel: ExPoint[] } {
  const origin = points[0];
  return { origin, rel: points.map(([x, y]) => [Math.round(x - origin[0]), Math.round(y - origin[1])] as ExPoint) };
}

export function absolutePoints(el: ExElement): ExPoint[] {
  return (el.points ?? []).map(([x, y]) => [el.x + x, el.y + y] as ExPoint);
}

export function polylineMidpoint(points: ExPoint[]): ExPoint {
  if (points.length === 1) return points[0];
  const segs = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= total / 2) {
      const t = segs[i] === 0 ? 0 : (total / 2 - acc) / segs[i];
      const a = points[i];
      const b = points[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    acc += segs[i];
  }
  return points[points.length - 1];
}
