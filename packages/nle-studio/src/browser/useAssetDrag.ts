import type { NleTimelineScene } from "@hypit/nle/view";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { NleStudioMediaEntry } from "../protocol.js";
import type { MediaDrop } from "./mediaDrag.js";
import { labelWidth, rulerHeight } from "./timelineGeometry.js";

export function useAssetDrag(scene: NleTimelineScene | undefined, root: RefObject<HTMLElement | null>, frame: number, busy: boolean,
  place: (drop: MediaDrop) => void, select: (entry: NleStudioMediaEntry) => void) {
  const [drag, setDrag] = useState<{ entry: NleStudioMediaEntry; x: number; y: number; drop?: MediaDrop }>();
  const cancel = useRef<() => void>(() => undefined);
  useEffect(() => () => cancel.current(), [scene, busy]);
  const start = (event: ReactPointerEvent, entry: NleStudioMediaEntry) => {
    if (event.button !== 0 || !scene || busy || entry.state !== "available") return;
    cancel.current(); event.preventDefault();
    const handle = event.currentTarget, pointerId = event.pointerId, x = event.clientX, y = event.clientY;
    handle.setPointerCapture(pointerId);
    let moved = false, drop: MediaDrop | undefined, animation = 0;
    let pointer = { x, y, alt: event.altKey }, viewport: HTMLElement | undefined;
    const locate = () => {
      if (!moved) return;
      const target = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>("[data-nle-drop]");
      viewport = target && root.current?.contains(target) ? target.closest<HTMLElement>(".nle-timeline-scroll") ?? undefined : undefined;
      drop = undefined;
      if (viewport && target) {
        const pixels = Number(viewport.dataset.framePixels), bounds = viewport.getBoundingClientRect();
        const track = scene.tracks.find(track => track.id === target.dataset.nleDrop);
        const compatible = !track || !track.locked && track.kind === (entry.kind === "audio" ? "audio" : "picture");
        if (pixels > 0 && compatible && pointer.x >= bounds.left + labelWidth && pointer.y >= bounds.top + rulerHeight) {
          let at = Math.max(0, Math.round((pointer.x - bounds.left - labelWidth + viewport.scrollLeft) / pixels));
          if (viewport.dataset.snap === "true" && !pointer.alt) {
            const boundary = [0, frame, ...scene.tracks.flatMap(track => track.items.flatMap(item => [item.startFrame, item.startFrame + item.durationFrames]))]
              .filter(value => Math.abs(value - at) * pixels <= 7).sort((a, b) => Math.abs(a - at) - Math.abs(b - at))[0];
            at = boundary ?? at;
          }
          drop = { id: entry.id, frame: at, ...(track ? { track: track.id } : {}) };
        }
      }
      setDrag({ entry, x: pointer.x, y: pointer.y, ...(drop ? { drop } : {}) });
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      pointer = { x: next.clientX, y: next.clientY, alt: next.altKey };
      moved ||= Math.hypot(pointer.x - x, pointer.y - y) > 4; locate();
    };
    const scroll = () => {
      if (viewport) {
        const bounds = viewport.getBoundingClientRect();
        const dx = pointer.x < bounds.left + labelWidth + 24 ? -10 : pointer.x > bounds.right - 24 ? 10 : 0;
        const dy = pointer.y < bounds.top + rulerHeight + 24 ? -8 : pointer.y > bounds.bottom - 24 ? 8 : 0;
        if (dx || dy) { viewport.scrollLeft += dx; viewport.scrollTop += dy; locate(); }
      }
      animation = requestAnimationFrame(scroll);
    };
    const clean = () => {
      cancelAnimationFrame(animation); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", abort); window.removeEventListener("keydown", key); window.removeEventListener("blur", clean);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      cancel.current = () => undefined; setDrag(undefined);
    };
    const abort = (next: PointerEvent) => { if (next.pointerId === pointerId) clean(); };
    const key = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); clean(); } };
    const up = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      move(next); const accepted = drop; clean();
      if (!moved) select(entry); else if (accepted) place(accepted);
    };
    cancel.current = clean;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", abort); window.addEventListener("keydown", key); window.addEventListener("blur", clean);
    animation = requestAnimationFrame(scroll);
  };
  return { drag, start };
}
