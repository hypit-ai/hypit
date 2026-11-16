import type { NleTimelineSceneTrack } from "@hypit/nle/view";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { tracksTop } from "./timelineGeometry.js";

type DropPosition = { readonly trackId: string; readonly top: number };

export function useTrackReorder(
  scroller: RefObject<HTMLDivElement | null>,
  tracks: readonly NleTimelineSceneTrack[],
  revision: number,
  busy: boolean,
  onMove: (track: string, before?: string) => void,
) {
  const [position, setPosition] = useState<DropPosition>();
  const cancel = useRef<() => void>(() => {});
  useEffect(() => () => cancel.current(), [revision, busy]);

  const start = (event: PointerEvent<HTMLDivElement>, track: NleTimelineSceneTrack) => {
    const viewport = scroller.current;
    if (!viewport || event.button !== 0 || track.locked || busy || (event.target as Element).closest("button")) return;
    cancel.current();
    event.preventDefault();
    const handle = event.currentTarget, pointerId = event.pointerId, startY = event.clientY;
    handle.setPointerCapture(pointerId);
    const siblings = tracks.filter(item => item.kind === track.kind);
    const remaining = siblings.filter(item => item.id !== track.id);
    const originalIndex = siblings.findIndex(item => item.id === track.id);
    let pointerY = startY, destination = originalIndex, active = false, animation = 0;
    const locate = () => {
      if (!active) return;
      const rows = Array.from(viewport.querySelectorAll<HTMLElement>(".nle-track[data-track-id]"));
      const candidates = remaining.map(item => rows.find(row => row.dataset.trackId === item.id)!);
      const next = candidates.findIndex(row => pointerY < row.getBoundingClientRect().top + row.offsetHeight / 2);
      destination = next === -1 ? remaining.length : next;
      const target = candidates[destination];
      const last = candidates.at(-1);
      const top = target ? target.offsetTop : (last?.offsetTop ?? tracksTop) + (last?.offsetHeight ?? 0);
      setPosition({ trackId: track.id, top });
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
      const orderedSiblings = [...remaining]; orderedSiblings.splice(destination, 0, track);
      const orderedDisplay = tracks.map(item => item.kind === track.kind ? orderedSiblings.shift()! : item);
      const sourceOrder = [
        ...orderedDisplay.filter(item => item.kind === "picture").reverse(),
        ...orderedDisplay.filter(item => item.kind === "audio"),
      ];
      const index = sourceOrder.findIndex(item => item.id === track.id);
      onMove(track.id, sourceOrder[index + 1]?.id);
    };
    cancel.current = cleanup;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", abort); window.addEventListener("keydown", key);
    viewport.addEventListener("scroll", locate); animation = requestAnimationFrame(scroll);
  };
  return { position, start };
}
