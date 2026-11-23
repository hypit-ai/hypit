import type { NleTimelineSceneTrack } from "@hypit/nle/surface";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { rulerHeight } from "./timelineGeometry.js";

type DropPosition = { readonly trackId: string; readonly top: number };

export function useTrackReorder(
  scroller: RefObject<HTMLDivElement | null>,
  displayRows: readonly NleTimelineSceneTrack[],
  revision: number,
  busy: boolean,
  onMove: (track: string, before: string | undefined) => void,
) {
  const [position, setPosition] = useState<DropPosition>();
  const cancel = useRef<() => void>(() => {});
  useEffect(() => () => cancel.current(), [revision, busy, displayRows]);

  const start = (event: PointerEvent<HTMLDivElement>, track: NleTimelineSceneTrack) => {
    const viewport = scroller.current;
    if (!viewport || displayRows.length < 2 || event.button !== 0 || track.locked || busy || (event.target as Element).closest("button")) return;
    cancel.current();
    event.preventDefault();
    const handle = event.currentTarget, pointerId = event.pointerId, startY = event.clientY;
    handle.setPointerCapture(pointerId);
    const remaining = displayRows.filter(item => item.id !== track.id);
    const originalIndex = displayRows.findIndex(item => item.id === track.id);
    let pointerY = startY, destination = originalIndex, active = false, animation = 0;
    const locate = () => {
      if (!active) return;
      const rows = Array.from(viewport.querySelectorAll<HTMLElement>(".nle-track[data-track-id]"));
      const candidates = remaining.flatMap(item => { const row = rows.find(row => row.dataset.trackId === item.id); return row ? [row] : []; });
      const next = candidates.findIndex(row => pointerY < row.getBoundingClientRect().top + row.offsetHeight / 2);
      destination = next === -1 ? remaining.length : next;
      const target = candidates[destination];
      const last = candidates.at(-1);
      const top = target ? target.offsetTop : (last?.offsetTop ?? handle.closest<HTMLElement>(".nle-track")?.offsetTop ?? rulerHeight) + (last?.offsetHeight ?? 0);
      setPosition(destination === originalIndex ? undefined : { trackId: track.id, top });
    };
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      pointerY = next.clientY; active ||= Math.abs(pointerY - startY) > 4; locate();
    };
    const scroll = () => {
      if (active) {
        const bounds = viewport.getBoundingClientRect();
        const delta = pointerY < bounds.top + 60 ? -Math.min(12, (bounds.top + 60 - pointerY) / 4)
          : pointerY > bounds.bottom - 32 ? Math.min(12, (pointerY - bounds.bottom + 32) / 4) : 0;
        if (delta) { viewport.scrollTop += delta; locate(); }
      }
      animation = requestAnimationFrame(scroll);
    };
    const cleanup = () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", abort); window.removeEventListener("keydown", key);
      viewport.removeEventListener("scroll", locate);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      setPosition(undefined); cancel.current = () => {};
    };
    const abort = (next: globalThis.PointerEvent) => { if (next.pointerId === pointerId) cleanup(); };
    const key = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); cleanup(); } };
    const finish = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      move(next); cleanup();
      if (!active || destination === originalIndex) return;
      onMove(track.id, remaining[destination]?.id);
    };
    cancel.current = cleanup;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", abort); window.addEventListener("keydown", key);
    viewport.addEventListener("scroll", locate); animation = requestAnimationFrame(scroll);
  };
  return { position, start };
}
