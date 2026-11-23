import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

type Point = { readonly x: number; readonly y: number };
type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
  & Pick<CSSProperties, "borderTopColor" | "borderRightColor" | "borderBottomColor" | "borderLeftColor">;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function scrollStep(position: number, start: number, end: number, maximum: number): number {
  const zone = 24;
  const before = clamp((start + zone - position) / zone, 0, 1);
  const after = clamp((position - end + zone) / zone, 0, 1);
  return Math.round(maximum * (after - before));
}

export function useMarqueeSelection({
  selection, onSelect, targetAttribute, exclude, disabled, insetLeft = 0, insetTop = 0,
  filterSelection, onBlankClick,
}: {
  readonly selection: readonly string[];
  readonly onSelect: (ids: readonly string[]) => void;
  readonly targetAttribute: `data-${string}`;
  readonly exclude?: string;
  readonly disabled: boolean;
  readonly insetLeft?: number;
  readonly insetTop?: number;
  readonly filterSelection?: (ids: readonly string[]) => readonly string[];
  readonly onBlankClick?: (origin: Point) => void;
}) {
  const [box, setBox] = useState<Box>();
  const cleanupGesture = useRef<(() => void) | undefined>(undefined);
  const cancel = useCallback(() => cleanupGesture.current?.(), []);
  useEffect(() => cancel, [cancel, disabled]);

  const start = (event: PointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const target = event.target;
    const candidates = `[${targetAttribute}]`;
    if (disabled || event.defaultPrevented || !event.isPrimary || event.button !== 0
      || !(target instanceof Element) || !element.contains(target)
      || target.closest(candidates) || (exclude !== undefined && target.closest(exclude))) return;

    const viewport = () => {
      const bounds = element.getBoundingClientRect();
      const x = bounds.left + element.clientLeft;
      const y = bounds.top + element.clientTop;
      return { x, y, left: x + insetLeft, top: y + insetTop, right: x + element.clientWidth, bottom: y + element.clientHeight };
    };
    const initial = viewport();
    if (event.clientX < initial.left || event.clientX >= initial.right
      || event.clientY < initial.top || event.clientY >= initial.bottom) return;

    cancel();
    event.preventDefault();
    const { pointerId } = event;
    const additive = event.metaKey || event.ctrlKey;
    const origin = { x: event.clientX - initial.x + element.scrollLeft, y: event.clientY - initial.y + element.scrollTop };
    const startPointer = { x: event.clientX, y: event.clientY };
    let pointer = startPointer;
    let active = false;
    let animation = 0;
    let hitIds: string[] | undefined;
    element.setPointerCapture(pointerId);
    if (!additive) onSelect([]);

    const locate = () => {
      active ||= Math.abs(pointer.x - startPointer.x) > 3 || Math.abs(pointer.y - startPointer.y) > 3;
      if (!active) return;

      const view = viewport();
      const originX = view.x - element.scrollLeft;
      const originY = view.y - element.scrollTop;
      const viewLeft = view.left - originX, viewRight = view.right - originX;
      const viewTop = view.top - originY, viewBottom = view.bottom - originY;
      const pointerX = pointer.x - originX, pointerY = pointer.y - originY;
      const x = clamp(pointerX, viewLeft, viewRight), y = clamp(pointerY, viewTop, viewBottom);

      const left = Math.min(origin.x, x), right = Math.max(origin.x, x);
      const top = Math.min(origin.y, y), bottom = Math.max(origin.y, y);
      const visibleLeft = Math.max(left, viewLeft), visibleTop = Math.max(top, viewTop);
      const width = Math.min(right, viewRight) - visibleLeft;
      const height = Math.min(bottom, viewBottom) - visibleTop;
      // Paint only the real edges of the rectangle where they intersect the viewport.
      setBox(width > 0 && height > 0 ? {
        left: visibleLeft, top: visibleTop, width, height,
        borderTopColor: Math.min(origin.y, pointerY) < viewTop ? "transparent" : undefined,
        borderRightColor: Math.max(origin.x, pointerX) > viewRight ? "transparent" : undefined,
        borderBottomColor: Math.max(origin.y, pointerY) > viewBottom ? "transparent" : undefined,
        borderLeftColor: Math.min(origin.x, pointerX) < viewLeft ? "transparent" : undefined,
      } : undefined);

      const hits = Array.from(element.querySelectorAll(candidates)).filter(candidate => {
        const bounds = candidate.getBoundingClientRect();
        return bounds.left - originX < right && bounds.right - originX > left
          && bounds.top - originY < bottom && bounds.bottom - originY > top;
      }).map(candidate => candidate.getAttribute(targetAttribute)!);
      if (hitIds !== undefined && hits.length === hitIds.length && hits.every((id, index) => id === hitIds?.[index])) return;
      hitIds = hits;
      const selected = additive ? [...new Set([...selection, ...hits])] : hits;
      onSelect(filterSelection?.(selected) ?? selected);
    };
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      pointer = { x: next.clientX, y: next.clientY };
      locate();
    };
    const cleanup = () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancelPointer);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", abort);
      element.removeEventListener("lostpointercapture", cancelPointer);
      element.removeEventListener("scroll", locate);
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      setBox(undefined);
      cleanupGesture.current = undefined;
    };
    const abort = () => { cleanup(); onSelect(selection); };
    const cancelPointer = (next: globalThis.PointerEvent) => { if (next.pointerId === pointerId) abort(); };
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      move(next);
      cleanup();
      if (!active && !additive) onBlankClick?.(origin);
    };
    const key = (next: KeyboardEvent) => {
      if (next.key === "Escape") { next.preventDefault(); abort(); }
    };
    const scroll = () => {
      if (active) {
        const view = viewport();
        const { scrollLeft, scrollTop } = element;
        const nextLeft = clamp(scrollLeft + scrollStep(pointer.x, view.left, view.right, 10), 0, element.scrollWidth - element.clientWidth);
        const nextTop = clamp(scrollTop + scrollStep(pointer.y, view.top, view.bottom, 8), 0, element.scrollHeight - element.clientHeight);
        if (nextLeft !== scrollLeft || nextTop !== scrollTop) element.scrollTo(nextLeft, nextTop);
      }
      animation = requestAnimationFrame(scroll);
    };
    cleanupGesture.current = cleanup;
    animation = requestAnimationFrame(scroll);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancelPointer);
    // Let the active gesture consume Escape before the editor and Source Preview shortcuts.
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", abort);
    element.addEventListener("lostpointercapture", cancelPointer);
    element.addEventListener("scroll", locate, { passive: true });
    return true;
  };
  return { box, start, cancel };
}
