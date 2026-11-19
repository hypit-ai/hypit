/**
 * Viewport placement. Every programmatic move keeps its target inside a safe area (80px top and bottom, 100px at the sides)
 * and eases with cubic-bezier(.4,0,.2,1): 300ms by default, 600ms when new content extends the view.
 */
import type { Viewport } from '@xyflow/react';

export type Rect = { x: number; y: number; width: number; height: number };
export const minZoom = .08, maxZoom = 8, zoomStep = 1.2;
export const clampZoom = (zoom: number) => Math.min(maxZoom, Math.max(minZoom, zoom));

/** The soft curve: x = 1.6t³ − 1.8t² + 1.2t solved for t, then y = smoothstep(t). It equals cubic-bezier(.4,0,.2,1). */
export function softEase(progress: number) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let t = progress;
  for (let index = 0; index < 4; index++) t -= (((1.6 * t - 1.8) * t + 1.2) * t - progress) / ((4.8 * t - 3.6) * t + 1.2);
  return t * t * (3 - 2 * t);
}
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const moveOptions = (incremental = false) => ({ duration: reducedMotion() ? 0 : incremental ? 600 : 300, ease: softEase, interpolate: 'linear' as const });

/** The content insets narrow together when the canvas is too slim to keep 100px on both sides and 100px of content. */
export function safeArea(width: number, height: number): Rect {
  const available = width, content = Math.min(100, available), spare = Math.max(0, available - content), scale = Math.min(1, spare / 200);
  const left = 100 * scale, right = 100 * scale, top = 80, bottom = 80;
  return { x: left, y: top, width: Math.max(1, width - left - right), height: Math.max(1, height - top - bottom) };
}

const screenRect = (rect: Rect, viewport: Viewport) => ({ left: rect.x * viewport.zoom + viewport.x, right: (rect.x + rect.width) * viewport.zoom + viewport.x, top: rect.y * viewport.zoom + viewport.y, bottom: (rect.y + rect.height) * viewport.zoom + viewport.y });
const fitZoom = (area: Rect, target: Rect, limit = Infinity) => clampZoom(Math.min(area.width / target.width, area.height / target.height, limit));
const same = (a: Viewport, b: Viewport) => Math.abs(a.x - b.x) <= .5 && Math.abs(a.y - b.y) <= .5 && Math.abs(a.zoom - b.zoom) <= 1e-6;
export const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};

function inside(target: Rect, area: Rect, viewport: Viewport) {
  const box = screenRect(target, viewport);
  return box.left >= area.x - .5 && box.right <= area.x + area.width + .5 && box.top >= area.y - .5 && box.bottom <= area.y + area.height + .5;
}
function centre(target: Rect, area: Rect, zoom: number): Viewport {
  return { x: area.x + area.width / 2 - (target.x + target.width / 2) * zoom, y: area.y + area.height / 2 - (target.y + target.height / 2) * zoom, zoom };
}
/** Moves just far enough that `target` fits inside `area` at `zoom`. */
function nudge(target: Rect, area: Rect, viewport: Viewport, zoom: number): Viewport {
  const box = screenRect(target, { ...viewport, zoom });
  let { x, y } = viewport;
  if (box.left < area.x) x += area.x - box.left;
  if (box.right > area.x + area.width) x -= box.right - (area.x + area.width);
  if (box.top < area.y) y += area.y - box.top;
  if (box.bottom > area.y + area.height) y -= box.bottom - (area.y + area.height);
  return { x, y, zoom };
}
/** Moves only the axes on which `target` sticks out of `area` while not spanning it (0.5px tolerance). */
function contain(target: Rect, area: Rect, viewport: Viewport): Viewport {
  const box = screenRect(target, viewport);
  const axis = (start: number, end: number, from: number, to: number) => start <= from + .5 && end >= to - .5 ? 0 : start < from - .5 ? from - start : end > to + .5 ? to - end : 0;
  return { x: viewport.x + axis(box.left, box.right, area.x, area.x + area.width), y: viewport.y + axis(box.top, box.bottom, area.y, area.y + area.height), zoom: viewport.zoom };
}
/** Like `nudge`, but a target larger than `area` is centred on that axis instead. */
function nudgeOrCentre(target: Rect, area: Rect, viewport: Viewport): Viewport {
  const box = screenRect(target, viewport);
  const axis = (start: number, end: number, from: number, to: number) => {
    if (end - start > to - from) return from + (to - from) / 2 - (start + (end - start) / 2);
    return start < from ? from - start : end > to ? to - end : 0;
  };
  return { x: viewport.x + axis(box.left, box.right, area.x, area.x + area.width), y: viewport.y + axis(box.top, box.bottom, area.y, area.y + area.height), zoom: viewport.zoom };
}
const within = (outer: Rect, inner: Rect, zoom: number) => {
  const slack = .5 / zoom;
  return inner.x >= outer.x - slack && inner.x + inner.width <= outer.x + outer.width + slack && inner.y >= outer.y - slack && inner.y + inner.height <= outer.y + outer.height + slack;
};
const result = (next: Viewport, current: Viewport) => same(next, current) ? undefined : next;

/** The canvas rectangle that the safe area shows now. */
export function visibleCanvas(viewport: Viewport, area: Rect): Rect {
  return { x: (area.x - viewport.x) / viewport.zoom, y: (area.y - viewport.y) / viewport.zoom, width: area.width / viewport.zoom, height: area.height / viewport.zoom };
}

/** New content: keep what was in view and add the target, zooming out only as far as both need. */
export function incrementalFit(target: Rect, origin: Rect, area: Rect, viewport: Viewport) {
  if (within(origin, target, viewport.zoom) && inside(target, area, viewport)) return undefined;
  const both = union(origin, target), fit = Math.min(area.width / both.width, area.height / both.height);
  const zoom = Math.min(viewport.zoom, clampZoom(fit));
  const next = fit < minZoom ? nudgeOrCentre(target, area, { ...viewport, zoom }) : nudge(both, area, { ...viewport, zoom }, zoom);
  return result(next, viewport);
}

/** The first node on an empty canvas sits 100px above the middle of the inner 90% of the safe area, with
 *  `guard` (the node with its toolbar) kept inside the safe area. */
export function firstContent(target: Rect, guard: Rect, area: Rect, viewport: Viewport) {
  const inner = { x: area.x + area.width * .05, y: area.y + area.height * .05, width: area.width * .9, height: area.height * .9 };
  const zoom = Math.min(viewport.zoom, clampZoom(Math.min(area.width / guard.width, area.height / guard.height)));
  const placed = centre(target, inner, zoom);
  return result(nudge(guard, area, { ...placed, y: placed.y - 100 }, zoom), viewport);
}

/** Locating content: centre it at the current zoom, raised to 50% at least, unless it needs less to fit. */
export function locateContent(target: Rect, area: Rect, viewport: Viewport) {
  const zoom = Math.min(clampZoom(Math.max(viewport.zoom, .5)), fitZoom(area, target));
  return result(centre(target, area, zoom), viewport);
}

/** Activating a node: pan the least distance that shows it, shrinking to 40% at most when it cannot fit. */
export function minimalContain(target: Rect, area: Rect, viewport: Viewport) {
  if (inside(target, area, viewport)) return undefined;
  if (target.width * viewport.zoom <= area.width + .5 && target.height * viewport.zoom <= area.height + .5) return result(contain(target, area, viewport), viewport);
  const zoom = Math.min(viewport.zoom, Math.max(.4, fitZoom(area, target, viewport.zoom)));
  const point = { x: (target.x + target.width / 2) * viewport.zoom + viewport.x, y: (target.y + target.height / 2) * viewport.zoom + viewport.y };
  return result(contain(target, area, zoomAround(viewport, point, zoom)), viewport);
}

/** Zooms so that the canvas point under `point` (screen coordinates in the canvas) stays put. */
export function zoomAround(viewport: Viewport, point: { x: number; y: number }, zoom: number): Viewport {
  const next = clampZoom(zoom);
  if (next === viewport.zoom) return viewport;
  const ratio = next / viewport.zoom;
  return { x: point.x - (point.x - viewport.x) * ratio, y: point.y - (point.y - viewport.y) * ratio, zoom: next };
}

type Flow = {
  getViewport(): Viewport;
  setViewport(viewport: Viewport, options?: { duration?: number; ease?: (t: number) => number; interpolate?: 'smooth' | 'linear' }): Promise<boolean>;
  getInternalNode(id: string): { internals: { positionAbsolute: { x: number; y: number } }; measured: { width?: number; height?: number }; hidden?: boolean } | undefined;
  getNodes(): { id: string; selected?: boolean; hidden?: boolean }[];
};

/** Viewport commands for one canvas. `element` is the React Flow container; points are relative to it. */
export function viewportCommands(flow: () => Flow | null, element: () => HTMLElement | null) {
  const area = () => {
    const box = element()?.getBoundingClientRect();
    return box && box.width > 0 && box.height > 0 ? safeArea(box.width, box.height) : undefined;
  };
  const centre = () => {
    const box = element()?.getBoundingClientRect();
    return { x: (box?.width ?? 0) / 2, y: (box?.height ?? 0) / 2 };
  };
  const rect = (ids: readonly string[]) => {
    const instance = flow();
    const boxes = ids.flatMap(id => {
      const node = instance?.getInternalNode(id);
      const width = node?.measured.width, height = node?.measured.height;
      return node && !node.hidden && width && height ? [{ ...node.internals.positionAbsolute, width, height }] : [];
    });
    return boxes.length ? boxes.reduce(union) : undefined;
  };
  const move = (next: Viewport | undefined, incremental = false) => {
    if (next) void flow()?.setViewport(next, moveOptions(incremental));
    return Boolean(next);
  };
  const view = () => flow()?.getViewport();
  return {
    zoomTo(zoom: number, point = centre()) {
      const current = view();
      return current ? move(zoomAround(current, point, zoom)) : false;
    },
    zoomBy(factor: number) {
      const current = view();
      return current ? move(zoomAround(current, centre(), current.zoom * factor)) : false;
    },
    fit(ids: readonly string[]) {
      const current = view(), safe = area(), target = rect(ids);
      return current && safe && target ? move(locateContent(target, safe, current)) : false;
    },
    /** New content: widen the view from `origin` just enough to include it. */
    /** `firstOnCanvas` when nothing else was on the canvas; `above` is the toolbar's height in screen pixels. */
    reveal(ids: readonly string[], origin?: Rect, firstOnCanvas = false, above = 0) {
      const current = view(), safe = area(), target = rect(ids);
      if (!current || !safe || !target) return false;
      if (firstOnCanvas) {
        const lift = above / current.zoom;
        return move(firstContent(target, { ...target, y: target.y - lift, height: target.height + lift }, safe, current), true);
      }
      return move(incrementalFit(target, origin ?? visibleCanvas(current, safe), safe, current), true);
    },
    /** An activated node keeps its toolbar, `above` screen pixels over its card, in view. */
    activate(id: string, above = 0) {
      const current = view(), safe = area(), target = rect([id]);
      if (!current || !safe || !target) return false;
      // Activation keeps the target within the middle 90% of the safe area.
      const lift = above / current.zoom, inner = { x: safe.x + safe.width * .05, y: safe.y + safe.height * .05, width: safe.width * .9, height: safe.height * .9 };
      return move(minimalContain({ ...target, y: target.y - lift, height: target.height + lift }, inner, current));
    },
  };
}
