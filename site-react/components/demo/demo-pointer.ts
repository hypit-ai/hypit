let pointerX: number | null = null;
let pointerY: number | null = null;

export function updateDemoPointer(event: PointerEvent) {
  pointerX = event.clientX;
  pointerY = event.clientY;
}

export function clearDemoPointer() {
  pointerX = null;
  pointerY = null;
}

export function demoPointerIsInside(element: HTMLElement | null) {
  if (!element) return false;
  if (pointerX !== null && pointerY !== null) {
    return element.contains(document.elementFromPoint(pointerX, pointerY));
  }
  return element.matches(":hover");
}
