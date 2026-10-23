import type { StudioItem, StudioSnapshot } from "../shared.js";
import type { StudioTerminalTarget } from "../shared.js";
import { intentTones } from "./markers.js";
import type { Store } from "./selection.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Where an Item is actually drawn, in canvas pixels, or undefined when the
 * picture has not mounted yet.
 */
/** A box on the canvas, in canvas pixels. */
export type Box = {
  readonly xPx: number; readonly yPx: number;
  readonly widthPx: number; readonly heightPx: number;
};

type PresentTarget = Extract<StudioTerminalTarget, { readonly kind: "visual-present" }>;
export type Measure = (target: PresentTarget) => (Box & { readonly paintPath: readonly number[] }) | undefined;

export type Overlay = {
  readonly element: SVGSVGElement;
  /** The topmost Item drawn at a point, in client coordinates. */
  hitTest(clientX: number, clientY: number): StudioItem | undefined;
  hitsAt(clientX: number, clientY: number): readonly StudioItem[];
  /** Redraw against the picture, once it has mounted or moved. */
  refresh(): void;
};

function rect(box: Box, className: string): SVGRectElement {
  const node = document.createElementNS(SVG_NS, "rect");
  node.setAttribute("x", String(box.xPx));
  node.setAttribute("y", String(box.yPx));
  node.setAttribute("width", String(box.widthPx));
  node.setAttribute("height", String(box.heightPx));
  node.setAttribute("rx", "6");
  // preserveAspectRatio is none, so a scaled stroke would be drawn unevenly.
  node.setAttribute("vector-effect", "non-scaling-stroke");
  node.setAttribute("class", className);
  return node;
}

function inside(box: Box, x: number, y: number): boolean {
  return x >= box.xPx && x <= box.xPx + box.widthPx
    && y >= box.yPx && y <= box.yPx + box.heightPx;
}

/**
 * The box drawn over the picture for the selected Item.
 *
 * The overlay shares the composition's own coordinate system through its
 * viewBox, so a box is written in canvas pixels with no transform to keep in
 * step with the iframe's scale.
 *
 * The box itself is measured from the rendered picture rather than recomputed
 * from the Placement Frame. Two things move an Item away from that Frame:
 * lifecycle motion displaces it for the length of its enter and exit, and the
 * frame paint fills the Frame while padded material does not. Measuring what
 * was drawn is exact for both, and stays exact for whatever the renderer does
 * next. The interpreted Frame is only the fallback for the moment before the
 * picture has mounted.
 */
export function createOverlay(store: Store, measure: Measure): Overlay {
  const element = document.createElementNS(SVG_NS, "svg");
  element.setAttribute("class", "stage-overlay");
  element.setAttribute("preserveAspectRatio", "none");

  let items: readonly StudioItem[] = [];
  let canvas = { width: 1, height: 1 };
  let last: { snapshot: StudioSnapshot; selected: StudioItem | undefined } | undefined;

  /**
   * The box is measured off the picture rather than restated from the Source:
   * motion moves an element across its span, so only what was drawn knows where
   * it ended up. A Present that has not mounted has no box to draw.
   */
  const drawnParts = (item: StudioItem) => {
    return item.terminalTargets.flatMap((ref) => {
      if (ref.kind !== "visual-present") return [];
      const found = measure(ref);
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
    if (last === undefined) return;
    const { snapshot, selected } = last;
        canvas = { width: snapshot.canvas.width, height: snapshot.canvas.height };
    element.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
    element.replaceChildren();
    // An editing interval can end before its visual representation disappears.
    // The renderer decides which associated parts are visible at this frame.
    items = snapshot.tracks.flatMap((track) => track.items);

    if (selected === undefined) return;
    const tones = intentTones(snapshot);
    const tone = tones.get(selected.authoredId);
    const box = drawnBox(selected);
    // A Present that is not on screen at this frame was never drawn, so there
    // is nothing to put a box around.
    if (box === undefined) return;
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", `box${tone === undefined ? "" : ` tone-${tone}`}`);

    group.append(rect(box, "box-content"));

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(box.xPx + 10));
    label.setAttribute("y", String(Math.max(28, box.yPx - 12)));
    label.setAttribute("class", "box-label");
    label.textContent = selected.display.title;
    group.append(label);
    element.append(group);
  };

  store.subscribe(({ snapshot, selection }) => {
    last = {
      snapshot,
      selected: selection.kind === "item" ? store.item(selection.itemId) : undefined,
    };
    draw();
  });

  const hitsAt = (clientX: number, clientY: number): readonly StudioItem[] => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return [];
      const x = (clientX - box.left) / box.width * canvas.width;
      const y = (clientY - box.top) / box.height * canvas.height;
      // Hit individual parts, not the empty space inside a group's union box.
      const hits = items.flatMap((item) => drawnParts(item)
        .filter((part) => inside(part, x, y))
        .map((part) => ({ item, path: part.paintPath })))
        .sort((left, right) => {
          const length = Math.max(left.path.length, right.path.length);
          for (let index = 0; index < length; index += 1) {
            const difference = (right.path[index] ?? -1) - (left.path[index] ?? -1);
            if (difference !== 0) return difference;
          }
          return 0;
        });
      return [...new Map(hits.map(({ item }) => [item.id, item])).values()];
  };
  return {
    element,
    refresh: draw,
    hitsAt,
    hitTest: (x, y) => hitsAt(x, y)[0],
  };
}
