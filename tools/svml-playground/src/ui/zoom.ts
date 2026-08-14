/**
 * How much of the programme the timeline shows.
 *
 * A sixteen-second Source fits; a three-minute one does not, and reading a
 * cutaway that lasts twelve frames out of five thousand is not possible at one
 * pixel per forty frames. So the whole programme is drawn as a bar, and the
 * part currently on the timeline is a window inside it - dragged to move, or
 * taken by either edge to widen and narrow.
 */

export type Window = { readonly start: number; readonly end: number };

export type Zoom = {
  readonly element: HTMLElement;
  /** The visible fraction of the programme, from 0 to 1. */
  window(): Window;
  subscribe(listen: (window: Window) => void): void;
  /** Zoom about a point, given as a fraction across the visible window. */
  pinch(at: number, factor: number): void;
  /** Slide the window by a fraction of its own width. */
  slide(by: number): void;
};

/** Nothing smaller than this is readable, and nothing larger than all of it exists. */
const NARROWEST = 0.01;

export function createZoom(): Zoom {
  const element = document.createElement("div");
  element.className = "zoom";
  element.innerHTML = `
    <div class="zoom-window" data-window>
      <span class="zoom-grip zoom-grip-start" data-start></span>
      <span class="zoom-grip zoom-grip-end" data-end></span>
    </div>`;
  const held = element.querySelector<HTMLElement>("[data-window]")!;
  const startGrip = element.querySelector<HTMLElement>("[data-start]")!;
  const endGrip = element.querySelector<HTMLElement>("[data-end]")!;

  let window_: Window = { start: 0, end: 1 };
  const listeners: ((window: Window) => void)[] = [];

  const paint = (): void => {
    held.style.left = `${window_.start * 100}%`;
    held.style.width = `${(window_.end - window_.start) * 100}%`;
    for (const listen of listeners) listen(window_);
  };

  const settle = (start: number, end: number): void => {
    const width = Math.max(NARROWEST, Math.min(1, end - start));
    const from = Math.max(0, Math.min(1 - width, start));
    window_ = { start: from, end: from + width };
    paint();
  };

  /** Where a pointer is along the whole bar, as a fraction. */
  const fraction = (event: PointerEvent): number => {
    const box = element.getBoundingClientRect();
    return box.width === 0 ? 0 : Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
  };

  const drag = (
    node: HTMLElement,
    onMove: (at: number, began: Window, from: number) => void,
  ): void => {
    node.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      node.setPointerCapture(event.pointerId);
      const began = window_;
      const from = fraction(event);
      const move = (moved: PointerEvent): void => onMove(fraction(moved), began, from);
      const done = (): void => {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", done);
        node.releasePointerCapture(event.pointerId);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", done);
    });
  };

  drag(held, (at, began, from) => {
    const shift = at - from;
    settle(began.start + shift, began.end + shift);
  });
  drag(startGrip, (at, began) => settle(Math.min(at, began.end - NARROWEST), began.end));
  drag(endGrip, (at, began) => settle(began.start, Math.max(at, began.start + NARROWEST)));

  // Clicking the bar outside the window centres the window there, which is the
  // fastest way across a long programme.
  element.addEventListener("pointerdown", (event) => {
    const width = window_.end - window_.start;
    const at = fraction(event);
    settle(at - width / 2, at + width / 2);
  });

  paint();
  return {
    element,
    window: () => window_,
    subscribe(listen) { listeners.push(listen); listen(window_); },
    /**
     * Pinching over the strip zooms about the point under the fingers, which is
     * how every other timeline behaves and the only gesture that keeps the clip
     * being read where it was.
     */
    pinch(at: number, factor: number) {
      const width = window_.end - window_.start;
      const wanted = Math.max(NARROWEST, Math.min(1, width * factor));
      const held = window_.start + width * Math.max(0, Math.min(1, at));
      settle(held - wanted * at, held + wanted * (1 - at));
    },
    /** Two fingers moved sideways slide the window without resizing it. */
    slide(by: number) {
      const width = window_.end - window_.start;
      settle(window_.start + by * width, window_.end + by * width);
    },
  };
}
