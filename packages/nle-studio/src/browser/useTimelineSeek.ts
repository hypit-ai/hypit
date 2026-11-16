import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export function useTimelineSeek(scroller: RefObject<HTMLDivElement | null>, pixels: number, labelWidth: number, frame: number, onSeek: (frame: number) => void) {
  const cancel = useRef<() => void>(() => {});
  const seeking = useRef(false), [active, setActive] = useState(false);
  const seek = useRef(onSeek); seek.current = onSeek;
  useEffect(() => () => cancel.current(), [pixels]);
  const previousFrame = useRef(frame);
  useEffect(() => {
    if (previousFrame.current === frame) return;
    previousFrame.current = frame;
    const viewport = scroller.current;
    if (!viewport || seeking.current) return;
    const x = frame * pixels, width = viewport.clientWidth - labelWidth;
    if (x < viewport.scrollLeft || x > viewport.scrollLeft + width - 12) viewport.scrollLeft = Math.max(0, x - width * .2);
  }, [frame, pixels, scroller, labelWidth]);

  const start = (event: ReactPointerEvent<HTMLElement>) => {
    const viewport = scroller.current;
    if (!viewport || event.button !== 0) return;
    cancel.current(); event.preventDefault(); event.stopPropagation();
    const handle = event.currentTarget, pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);
    seeking.current = true; setActive(true);
    // The arrow cursor stays while scrubbing, whatever the pointer passes over.
    document.documentElement.classList.add('nle-seeking');
    let x = event.clientX, animation = 0, last = -1;
    const locate = () => {
      const bounds = viewport.getBoundingClientRect();
      const at = Math.max(0, Math.round((Math.max(bounds.left + labelWidth, Math.min(bounds.left + viewport.clientWidth, x)) - bounds.left - labelWidth + viewport.scrollLeft) / pixels));
      if (at !== last) { last = at; seek.current(at); }
    };
    const move = (next: PointerEvent) => { if (next.pointerId === pointerId) { x = next.clientX; locate(); } };
    const cleanup = () => {
      cancelAnimationFrame(animation);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', abort);
      window.removeEventListener('keydown', key); window.removeEventListener('blur', cleanup);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      document.documentElement.classList.remove('nle-seeking');
      seeking.current = false; setActive(false); cancel.current = () => {};
    };
    const abort = (next: PointerEvent) => { if (next.pointerId === pointerId) cleanup(); };
    const up = (next: PointerEvent) => { if (next.pointerId === pointerId) { move(next); cleanup(); } };
    const key = (next: KeyboardEvent) => { if (next.key === 'Escape') { next.preventDefault(); cleanup(); } };
    const scroll = () => {
      const bounds = viewport.getBoundingClientRect(), right = bounds.left + viewport.clientWidth;
      const delta = x < bounds.left + labelWidth + 16 ? -Math.min(12, (bounds.left + labelWidth + 16 - x) / 3)
        : x > right - 16 ? Math.min(12, (x - right + 16) / 3) : 0;
      if (delta) { viewport.scrollLeft += delta; locate(); }
      animation = requestAnimationFrame(scroll);
    };
    cancel.current = cleanup;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', abort);
    window.addEventListener('keydown', key); window.addEventListener('blur', cleanup);
    locate(); animation = requestAnimationFrame(scroll);
  };
  return { start, active };
}
