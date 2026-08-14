/**
 * Panels the reader can size.
 *
 * How much room the Source needs against how much the picture needs is not a
 * decision this tool can make: it depends on the Source, and on which of the
 * two the reader is working on right now. So both edges are draggable, and
 * where they were put is remembered.
 */

type Axis = "column" | "row";

/**
 * A grab handle on the edge between two panels.
 *
 * `apply` receives the size in pixels of the panel being sized; clamping is the
 * caller's, because only it knows what its own panel needs to stay usable.
 */
export function createHandle(input: {
  readonly axis: Axis;
  readonly initial: number;
  readonly minimum: number;
  readonly maximum: () => number;
  /** Which way the pointer moves to make the panel larger. */
  readonly invert?: boolean;
  readonly apply: (size: number) => void;
  /** Where to remember it, so a reload keeps the layout. */
  readonly remember: string;
}): HTMLElement {
  const element = document.createElement("div");
  element.className = `handle handle-${input.axis}`;
  element.setAttribute("role", "separator");
  element.setAttribute("aria-orientation", input.axis === "column" ? "vertical" : "horizontal");
  element.tabIndex = 0;

  const held = Number(localStorage.getItem(input.remember));
  let size = Number.isFinite(held) && held > 0 ? held : input.initial;
  const settle = (value: number): void => {
    size = Math.max(input.minimum, Math.min(input.maximum(), value));
    input.apply(size);
    localStorage.setItem(input.remember, String(size));
  };
  settle(size);

  element.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    const from = input.axis === "column" ? event.clientX : event.clientY;
    const began = size;
    const move = (moved: PointerEvent): void => {
      const at = input.axis === "column" ? moved.clientX : moved.clientY;
      const delta = (at - from) * (input.invert === true ? -1 : 1);
      settle(began + delta);
    };
    const done = (): void => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", done);
      element.releasePointerCapture(event.pointerId);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", done);
  });

  // A handle nobody can reach with a keyboard is a handle half the readers do
  // not have.
  element.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 48 : 12;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") settle(size - step);
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") settle(size + step);
    else return;
    event.preventDefault();
  });

  return element;
}
