import type { StudioItem, StudioSnapshot } from "../shared.js";
import { frameResizeHandles, resolveFrameEditModel } from "../frame-edit.js";
import type { FrameResizeHandle, GapMeasurement, SnapGuide, SpatialBox } from "../frame-edit.js";
import { intentTones } from "./markers.js";
import type { Store } from "./selection.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** A box on the canvas, in canvas pixels. */
export type Box = SpatialBox;

export type Measure = (renderId: string) => (Box & { readonly stackOrder: number }) | undefined;

export type OverlayPreview = {
  readonly itemId: string;
  readonly box: Box;
  readonly guides: readonly SnapGuide[];
  readonly gap?: GapMeasurement;
  readonly hud?: string;
};

export type Overlay = {
  readonly element: SVGSVGElement;
  /** The topmost Item drawn at a point, in client coordinates. */
  hitTest(clientX: number, clientY: number): StudioItem | undefined;
  hitsAt(clientX: number, clientY: number): readonly StudioItem[];
  /** Resize handle on the selected Item at a client coordinate, if enabled. */
  handleAt(clientX: number, clientY: number): FrameResizeHandle | undefined;
  /** Measured box of one Item on the current picture. */
  itemBox(item: StudioItem): Box | undefined;
  /** Measured boxes of other visible Items on the current picture. */
  siblingBoxes(excludeItemId: string): readonly Box[];
  /** Convert client pointer coordinates into canvas pixels. */
  canvasPoint(clientX: number, clientY: number): { readonly xPx: number; readonly yPx: number; readonly unitPx: number } | undefined;
  /** Show live drag/resize preview box and guides while a gesture is active. */
  setPreview(preview: OverlayPreview | undefined): void;
  /** Redraw against the picture, once it has mounted or moved. */
  refresh(): void;
};

function rect(box: Box, className: string, radius = 6): SVGRectElement {
  const node = document.createElementNS(SVG_NS, "rect");
  node.setAttribute("x", String(box.xPx));
  node.setAttribute("y", String(box.yPx));
  node.setAttribute("width", String(box.widthPx));
  node.setAttribute("height", String(box.heightPx));
  node.setAttribute("rx", String(radius));
  node.setAttribute("vector-effect", "non-scaling-stroke");
  node.setAttribute("class", className);
  return node;
}

function line(x1: number, y1: number, x2: number, y2: number, className: string): SVGLineElement {
  const node = document.createElementNS(SVG_NS, "line");
  node.setAttribute("x1", String(x1));
  node.setAttribute("y1", String(y1));
  node.setAttribute("x2", String(x2));
  node.setAttribute("y2", String(y2));
  node.setAttribute("vector-effect", "non-scaling-stroke");
  node.setAttribute("class", className);
  return node;
}

function inside(box: Box, x: number, y: number): boolean {
  return x >= box.xPx && x <= box.xPx + box.widthPx
    && y >= box.yPx && y <= box.yPx + box.heightPx;
}

function handleCenter(box: Box, handle: FrameResizeHandle): { readonly x: number; readonly y: number } {
  const cx = box.xPx + box.widthPx / 2;
  const cy = box.yPx + box.heightPx / 2;
  const right = box.xPx + box.widthPx;
  const bottom = box.yPx + box.heightPx;
  switch (handle) {
    case "nw": return { x: box.xPx, y: box.yPx };
    case "n": return { x: cx, y: box.yPx };
    case "ne": return { x: right, y: box.yPx };
    case "e": return { x: right, y: cy };
    case "se": return { x: right, y: bottom };
    case "s": return { x: cx, y: bottom };
    case "sw": return { x: box.xPx, y: bottom };
    case "w": return { x: box.xPx, y: cy };
  }
}

export function createOverlay(store: Store, measure: Measure): Overlay {
  const element = document.createElementNS(SVG_NS, "svg");
  element.setAttribute("class", "stage-overlay");
  element.setAttribute("preserveAspectRatio", "none");

  let items: readonly StudioItem[] = [];
  let canvas = { width: 1, height: 1 };
  let last: { snapshot: StudioSnapshot; selected: StudioItem | undefined } | undefined;
  let activePreview: OverlayPreview | undefined;
  let renderedHandles: readonly { readonly handle: FrameResizeHandle; readonly x: number; readonly y: number }[] = [];

  const unitPx = (): number => {
    const rectBox = element.getBoundingClientRect();
    return rectBox.width > 0 ? canvas.width / rectBox.width : 1;
  };

  const drawnParts = (item: StudioItem) => {
    const ids = item.renderIds.length > 0 ? item.renderIds : item.presentId === undefined ? [] : [item.presentId];
    return ids.flatMap((id) => {
      const found = measure(id);
      return found === undefined ? [] : [found];
    });
  };

  const drawnBox = (item: StudioItem): Box | undefined => {
    const boxes = drawnParts(item);
    if (boxes.length === 0) return undefined;
    const left = Math.min(...boxes.map((box) => box.xPx));
    const top = Math.min(...boxes.map((box) => box.yPx));
    const right = Math.max(...boxes.map((box) => box.xPx + box.widthPx));
    const bottom = Math.max(...boxes.map((box) => box.yPx + box.heightPx));
    return { xPx: left, yPx: top, widthPx: right - left, heightPx: bottom - top };
  };

  const draw = (): void => {
    renderedHandles = [];
    if (last === undefined) return;
    const { snapshot, selected } = last;
    canvas = { width: snapshot.canvas.width, height: snapshot.canvas.height };
    element.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
    element.replaceChildren();
    items = snapshot.tracks.flatMap((track) => track.items);

    if (selected === undefined) return;
    const measured = drawnBox(selected);
    const box = activePreview?.itemId === selected.id ? activePreview.box : measured;
    if (box === undefined) return;

    const unit = unitPx();
    const tones = intentTones(snapshot);
    const tone = tones.get(selected.authoredId);

    if (activePreview?.itemId === selected.id) {
      for (const guide of activePreview.guides) {
        if (guide.axis === "x") {
          element.append(line(guide.positionPx, guide.fromPx, guide.positionPx, guide.toPx, "stage-snap-guide"));
        } else {
          element.append(line(guide.fromPx, guide.positionPx, guide.toPx, guide.positionPx, "stage-snap-guide"));
        }
      }
      if (activePreview.gap !== undefined) {
        const gap = activePreview.gap;
        if (gap.axis === "x") {
          element.append(line(gap.fromPx, gap.crossPx, gap.toPx, gap.crossPx, "stage-gap-guide"));
        } else {
          element.append(line(gap.crossPx, gap.fromPx, gap.crossPx, gap.toPx, "stage-gap-guide"));
        }
        const gapLabel = document.createElementNS(SVG_NS, "text");
        const gx = gap.axis === "x" ? (gap.fromPx + gap.toPx) / 2 : gap.crossPx + 8 * unit;
        const gy = gap.axis === "y" ? (gap.fromPx + gap.toPx) / 2 : gap.crossPx - 6 * unit;
        gapLabel.setAttribute("x", String(gx));
        gapLabel.setAttribute("y", String(gy));
        gapLabel.setAttribute("text-anchor", gap.axis === "x" ? "middle" : "start");
        gapLabel.setAttribute("dominant-baseline", "central");
        gapLabel.setAttribute("class", "stage-gap-label");
        gapLabel.style.fontSize = `${10.5 * unit}px`;
        gapLabel.style.strokeWidth = `${3.5 * unit}px`;
        gapLabel.textContent = `${gap.distancePx}px`;
        element.append(gapLabel);
      }
    }

    const model = resolveFrameEditModel({
      inspector: selected.inspector,
      canvas,
      sourceFiles: snapshot.source.files,
      drawnBox: measured ?? box,
    });

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", `box${tone === undefined ? "" : ` tone-${tone}`}`);

    const border = rect(box, `box-content${model && (model.canMoveX || model.canMoveY) ? " stage-box-movable" : ""}`, 4 * unit);
    group.append(border);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(box.xPx + 6 * unit));
    label.setAttribute("y", String(Math.max(16 * unit, box.yPx - 7 * unit)));
    label.setAttribute("class", "box-label");
    label.style.fontSize = `${11 * unit}px`;
    label.style.strokeWidth = `${3.5 * unit}px`;
    label.textContent = activePreview?.itemId === selected.id && activePreview.hud !== undefined
      ? `${selected.display.title} · ${activePreview.hud}`
      : selected.display.title;
    group.append(label);

    if (model !== undefined) {
      const handleSize = 7.5 * unit;
      const hitSize = 15 * unit;
      const handleRadius = 1.5 * unit;
      const nextHandles: { readonly handle: FrameResizeHandle; readonly x: number; readonly y: number }[] = [];
      for (const handle of frameResizeHandles) {
        if (!model.handles.has(handle)) continue;
        const center = handleCenter(box, handle);
        nextHandles.push({ handle, x: center.x, y: center.y });

        const hit = document.createElementNS(SVG_NS, "rect");
        hit.setAttribute("x", String(center.x - hitSize / 2));
        hit.setAttribute("y", String(center.y - hitSize / 2));
        hit.setAttribute("width", String(hitSize));
        hit.setAttribute("height", String(hitSize));
        hit.setAttribute("class", `stage-handle-hit stage-handle-${handle}`);
        hit.setAttribute("data-stage-handle", handle);
        group.append(hit);

        const knob = document.createElementNS(SVG_NS, "rect");
        knob.setAttribute("x", String(center.x - handleSize / 2));
        knob.setAttribute("y", String(center.y - handleSize / 2));
        knob.setAttribute("width", String(handleSize));
        knob.setAttribute("height", String(handleSize));
        knob.setAttribute("rx", String(handleRadius));
        knob.setAttribute("vector-effect", "non-scaling-stroke");
        knob.setAttribute("class", `stage-handle stage-handle-${handle}`);
        knob.setAttribute("data-stage-handle", handle);
        group.append(knob);
      }
      renderedHandles = nextHandles;
    }

    element.append(group);
  };

  store.subscribe(({ snapshot, selection }) => {
    last = {
      snapshot,
      selected: selection.kind === "item" ? store.item(selection.itemId) : undefined,
    };
    draw();
  });

  const canvasPoint = (clientX: number, clientY: number) => {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return undefined;
    return {
      xPx: (clientX - box.left) / box.width * canvas.width,
      yPx: (clientY - box.top) / box.height * canvas.height,
      unitPx: canvas.width / box.width,
    };
  };

  const handleAt = (clientX: number, clientY: number): FrameResizeHandle | undefined => {
    const point = canvasPoint(clientX, clientY);
    if (point === undefined || renderedHandles.length === 0) return undefined;
    const hitRadius = 8.5 * point.unitPx;
    let best: { handle: FrameResizeHandle; dist: number } | undefined;
    for (const candidate of renderedHandles) {
      const dx = Math.abs(point.xPx - candidate.x);
      const dy = Math.abs(point.yPx - candidate.y);
      if (dx <= hitRadius && dy <= hitRadius) {
        const dist = Math.hypot(dx, dy);
        if (best === undefined || dist < best.dist) best = { handle: candidate.handle, dist };
      }
    }
    return best?.handle;
  };

  const hitsAt = (clientX: number, clientY: number): readonly StudioItem[] => {
    const point = canvasPoint(clientX, clientY);
    if (point === undefined) return [];
    const hits = items.flatMap((item) => drawnParts(item)
      .filter((part) => inside(part, point.xPx, point.yPx))
      .map((part) => ({ item, order: part.stackOrder })))
      .sort((left, right) => right.order - left.order);
    return [...new Map(hits.map(({ item }) => [item.id, item])).values()];
  };

  return {
    element,
    refresh: draw,
    hitsAt,
    hitTest: (x, y) => hitsAt(x, y)[0],
    handleAt,
    itemBox: drawnBox,
    siblingBoxes(excludeItemId: string): readonly Box[] {
      return items
        .filter((item) => item.id !== excludeItemId)
        .flatMap((item) => {
          const box = drawnBox(item);
          return box === undefined ? [] : [box];
        });
    },
    canvasPoint,
    setPreview(preview) {
      activePreview = preview;
      draw();
    },
  };
}
