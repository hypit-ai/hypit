import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { labelWidth, snapTimelineEdges, timelineOrigin, type TimelineSnap } from './timelineGeometry.js';

export function useTimelineSeek(scroller: RefObject<HTMLDivElement | null>, pixels: number, endFrame: number,
  snapBoundaries: readonly number[] | undefined, onSeek: (frame: number) => void) {
  const cancel = useRef<() => void>(() => {});
  const [active, setActive] = useState(false);
  const [snapped, setSnapped] = useState(false);
  const seek = useRef(onSeek); seek.current = onSeek;
  useEffect(() => () => cancel.current(), [pixels, endFrame]);

  const start = (event: ReactPointerEvent<HTMLElement>, anchorFrame?: number) => {
    const viewport = scroller.current;
    if (!viewport || event.button !== 0) return;
    cancel.current(); event.preventDefault(); event.stopPropagation();
    const handle = event.currentTarget, pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);
    setActive(true);
    // The arrow cursor stays while scrubbing, whatever the pointer passes over.
    document.documentElement.classList.add('nle-seeking');
    let x = event.clientX, animation = 0, last = -1;
    const grabOffset = anchorFrame === undefined ? 0
      : anchorFrame * pixels - (x - viewport.getBoundingClientRect().left - timelineOrigin + viewport.scrollLeft);
    let dragged = false, alt = event.altKey;
    let heldSnap: TimelineSnap | undefined;
    const locate = () => {
      const bounds = viewport.getBoundingClientRect();
      const pointer = Math.max(bounds.left + labelWidth, Math.min(bounds.left + viewport.clientWidth, x));
      const raw = Math.max(0, Math.min(endFrame, (pointer - bounds.left - timelineOrigin + viewport.scrollLeft + grabOffset) / pixels));
      heldSnap = dragged && !alt && snapBoundaries
        ? snapTimelineEdges([raw], undefined, snapBoundaries, pixels, { held: heldSnap, allows: value => value.frame <= endFrame })
        : undefined;
      const at = Math.round(heldSnap?.frame ?? raw);
      setSnapped(heldSnap !== undefined);
      if (at !== last) { last = at; seek.current(at); }
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      dragged ||= x !== next.clientX;
      x = next.clientX;
      alt = next.altKey;
      locate();
    };
    const cleanup = () => {
      cancelAnimationFrame(animation);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', abort);
      window.removeEventListener('keydown', key, true); window.removeEventListener('blur', cleanup);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      document.documentElement.classList.remove('nle-seeking');
      setActive(false); setSnapped(false); cancel.current = () => {};
    };
    const abort = (next: PointerEvent) => { if (next.pointerId === pointerId) cleanup(); };
    const up = (next: PointerEvent) => { if (next.pointerId === pointerId) { move(next); cleanup(); } };
    const key = (next: KeyboardEvent) => { if (next.key === 'Escape') { next.preventDefault(); cleanup(); } };
    const scroll = () => {
      const bounds = viewport.getBoundingClientRect(), right = bounds.left + viewport.clientWidth;
      const delta = x < bounds.left + labelWidth + 16 ? -Math.min(12, (bounds.left + labelWidth + 16 - x) / 3)
        : x > right - 16 ? Math.min(12, (x - right + 16) / 3) : 0;
      if (dragged && delta) { viewport.scrollLeft += delta; locate(); }
      animation = requestAnimationFrame(scroll);
    };
    cancel.current = cleanup;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', abort);
    window.addEventListener('keydown', key, true); window.addEventListener('blur', cleanup);
    locate(); animation = requestAnimationFrame(scroll);
  };
  return { start, active, snapped };
}
