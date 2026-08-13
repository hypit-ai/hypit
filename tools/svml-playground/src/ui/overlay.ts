import type { Clip, PlaygroundSnapshot } from "../shared.js";
import { markerTones } from "./markers.js";
import type { Store } from "./selection.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Where a clip is actually drawn, in canvas pixels, or undefined when the
 * picture has not mounted yet.
 */
export type Measure = (clipId: string) => Clip["frame"] | undefined;

export type Overlay = {
  readonly element: SVGSVGElement;
  /** The topmost clip drawn at a point, in client coordinates. */
  hitTest(clientX: number, clientY: number): Clip | undefined;
  /** Redraw against the picture, once it has mounted or moved. */
  refresh(): void;
};

function rect(box: Clip["frame"], className: string): SVGRectElement {
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

function inside(box: Clip["frame"], x: number, y: number): boolean {
  return x >= box.xPx && x <= box.xPx + box.widthPx
    && y >= box.yPx && y <= box.yPx + box.heightPx;
}

/**
 * The box drawn over the picture for the selected clip.
 *
 * The overlay shares the composition's own coordinate system through its
 * viewBox, so a box is written in canvas pixels with no transform to keep in
 * step with the iframe's scale.
 *
 * The box itself is measured from the rendered picture rather than recomputed
 * from the Placement Frame. Two things move a clip away from that Frame:
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

  let live: readonly Clip[] = [];
  let canvas = { width: 1, height: 1 };
  let real = false;
  let last: { snapshot: PlaygroundSnapshot; selected: Clip | undefined; frame: number } | undefined;

  /**
   * A rendered programme cannot be measured element by element, so its box falls
   * back to the interpreted geometry. Which rectangle is right depends on what
   * is on screen: the placeholder paint fills the whole Placement Frame, while
   * real material lands inside the padding a Recipe declared.
   */
  const drawnBox = (clip: Clip): Clip["frame"] =>
    measure(clip.id) ?? (real ? clip.contentFrame : clip.frame);

  const draw = (): void => {
    if (last === undefined) return;
    const { snapshot, selected, frame } = last;
    real = snapshot.preview.kind === "video";
    canvas = { width: snapshot.space.canvasWidth, height: snapshot.space.canvasHeight };
    element.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
    element.replaceChildren();
    // Only clips actually on screen can be picked out of the picture.
    live = store.clipsAt(frame).filter((clip) => clip.kind === "media");

    if (selected === undefined) return;
    const tones = markerTones(snapshot);
    const tone = selected.binding.kind === "program" ? undefined : tones.get(selected.binding.id);
    const onScreen = frame >= selected.startFrame && frame < selected.endFrameExclusive;
    const box = drawnBox(selected);
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", `box${onScreen ? "" : " box-elsewhere"}${tone === undefined ? "" : ` tone-${tone}`}`);

    // Where padded material will land once a Provider has produced any. The
    // placeholder paint fills the whole Frame, so without this the padding a
    // Recipe declares would be invisible.
    const padding = {
      left: selected.contentFrame.xPx - selected.frame.xPx,
      top: selected.contentFrame.yPx - selected.frame.yPx,
      width: selected.contentFrame.widthPx - selected.frame.widthPx,
      height: selected.contentFrame.heightPx - selected.frame.heightPx,
    };
    if (padding.width !== 0 || padding.height !== 0) {
      group.append(rect({
        xPx: box.xPx + padding.left,
        yPx: box.yPx + padding.top,
        widthPx: box.widthPx + padding.width,
        heightPx: box.heightPx + padding.height,
      }, "box-content-guide"));
    }
    group.append(rect(box, "box-content"));

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(box.xPx + 10));
    label.setAttribute("y", String(Math.max(28, box.yPx - 12)));
    label.setAttribute("class", "box-label");
    label.textContent = onScreen ? selected.label : `${selected.label} (not at this frame)`;
    group.append(label);
    element.append(group);
  };

  store.subscribe(({ snapshot, selection, playhead }) => {
    last = {
      snapshot,
      selected: selection.kind === "clip" ? store.clip(selection.clipId) : undefined,
      frame: playhead.frame,
    };
    draw();
  });

  return {
    element,
    refresh: draw,
    hitTest(clientX, clientY) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return undefined;
      const x = (clientX - box.left) / box.width * canvas.width;
      const y = (clientY - box.top) / box.height * canvas.height;
      // clipsAt already returns topmost first, so the first hit is the one an
      // author would say they clicked on.
      return live.find((clip) => inside(drawnBox(clip), x, y));
    },
  };
}
