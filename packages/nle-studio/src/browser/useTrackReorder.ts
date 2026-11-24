import type { NleTimelineSceneTrack } from "@hypit/nle/surface";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { useGestureOrder } from "./useGestureOrder.js";
import { labelWidth, rulerHeight, timelineStartPadding } from "./timelineGeometry.js";

type DropPosition = { readonly trackId: string; readonly top?: number };

function makeTrackGhost(source: HTMLElement, host: HTMLElement) {
  const clip = document.createElement("div");
  clip.className = "nle-track-ghost-viewport";
  clip.setAttribute("aria-hidden", "true");
  clip.inert = true;
  clip.style.setProperty("--nle-timeline-label-width", `${labelWidth}px`);
  clip.style.setProperty("--nle-timeline-start-padding", `${timelineStartPadding}px`);

  const row = source.cloneNode(true) as HTMLElement;
  row.classList.add("nle-track-ghost");
  row.removeAttribute("data-track-id");
  row.style.width = `${source.offsetWidth}px`;
  row.style.transform = "none";
  row.style.removeProperty("opacity");
  row.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
  // Cloning copies canvas dimensions, but the filmstrip and waveform pixels need to be copied too.
  const canvases = source.querySelectorAll("canvas");
  row.querySelectorAll("canvas").forEach((canvas, index) => {
    const original = canvases[index]!;
    if (original.width > 0 && original.height > 0) canvas.getContext("2d")?.drawImage(original, 0, 0);
  });
  clip.append(row);
  host.append(clip);
  return {
    remove: () => clip.remove(),
    place(viewport: HTMLDivElement, top: number) {
      const bounds = viewport.getBoundingClientRect();
      const clipTop = bounds.top + rulerHeight;
      clip.style.left = `${bounds.left}px`;
      clip.style.top = `${clipTop}px`;
      clip.style.width = `${viewport.clientWidth}px`;
      clip.style.height = `${Math.max(0, viewport.clientHeight - rulerHeight)}px`;
      clip.style.setProperty("--nle-track-ghost-scroll", `${viewport.scrollLeft}px`);
      row.style.top = `${top - clipTop}px`;
    },
  };
}

export function useTrackReorder(
  scroller: RefObject<HTMLDivElement | null>,
  displayRows: readonly NleTimelineSceneTrack[],
  busy: boolean,
  onMove: (track: string, before: string | undefined) => Promise<void>,
) {
  const [position, setPosition] = useState<DropPosition>();
  const cancel = useRef<() => void>(() => {});
  const { ordered, order, pending, submit } = useGestureOrder(displayRows, onMove);
  useEffect(() => () => cancel.current(), [busy, order]);

  const start = (event: PointerEvent<HTMLDivElement>, track: NleTimelineSceneTrack) => {
    const viewport = scroller.current;
    const host = viewport?.parentElement;
    const handle = event.currentTarget;
    const source = handle.closest<HTMLElement>(".nle-track");
    if (!viewport || !host || !source || ordered.length < 2 || event.button !== 0 || track.locked
      || busy || (event.target as Element).closest("button")) return;
    const rows = new Map(Array.from(viewport.querySelectorAll<HTMLElement>(".nle-track[data-track-id]"),
      row => [row.dataset.trackId, row]));
    const originalIndex = ordered.findIndex(row => row.id === track.id);
    const remaining = ordered.filter(row => row.id !== track.id).map(row => rows.get(row.id));
    if (originalIndex < 0 || remaining.some(row => row === undefined)) return;

    cancel.current();
    event.preventDefault();
    event.stopPropagation();
    const { pointerId, clientY: startY } = event;
    const bounds = source.getBoundingClientRect();
    const grabOffset = startY - bounds.top;
    let pointerY = startY, destination = originalIndex, animation = 0;
    let ghost: ReturnType<typeof makeTrackGhost> | undefined;
    handle.setPointerCapture(pointerId);
    const insideDrop = () => {
      const rect = viewport.getBoundingClientRect();
      return pointerY >= rect.top + rulerHeight && pointerY < rect.top + viewport.clientHeight;
    };

    const locate = () => {
      if (ghost === undefined) return;
      const top = pointerY - grabOffset;
      ghost.place(viewport, top);
      const center = top + bounds.height / 2;
      const centerOf = (row: HTMLElement) => {
        const rect = row.getBoundingClientRect();
        return rect.top + rect.height / 2;
      };
      const deadband = 4;
      while (destination > 0 && center < centerOf(remaining[destination - 1]!) - deadband) destination--;
      while (destination < remaining.length && center > centerOf(remaining[destination]!) + deadband) destination++;
      const target = remaining[destination];
      const last = remaining.at(-1)!;
      const insertion = destination === originalIndex || !insideDrop() ? undefined : target?.offsetTop ?? last.offsetTop + last.offsetHeight;
      setPosition(old => old?.trackId === track.id && old.top === insertion ? old : {
        trackId: track.id, ...(insertion === undefined ? {} : { top: insertion }),
      });
    };
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      pointerY = next.clientY;
      if (ghost === undefined && Math.abs(pointerY - startY) > 4) ghost = makeTrackGhost(source, host);
      locate();
    };
    const scroll = () => {
      if (ghost !== undefined) {
        const rect = viewport.getBoundingClientRect();
        const upper = rect.top + rulerHeight + 24;
        const lower = rect.top + viewport.clientHeight - 24;
        const delta = pointerY < upper ? -Math.min(12, (upper - pointerY) / 4)
          : pointerY > lower ? Math.min(12, (pointerY - lower) / 4) : 0;
        if (delta !== 0) viewport.scrollTop += delta;
      }
      animation = requestAnimationFrame(scroll);
    };
    const cleanup = () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", abort);
      window.removeEventListener("blur", cleanup);
      window.removeEventListener("keydown", key, true);
      viewport.removeEventListener("scroll", locate);
      handle.removeEventListener("lostpointercapture", abort);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      ghost?.remove();
      setPosition(undefined);
      cancel.current = () => {};
    };
    const abort = (next: globalThis.PointerEvent) => { if (next.pointerId === pointerId) cleanup(); };
    const key = (next: KeyboardEvent) => {
      if (next.key !== "Escape") return;
      next.preventDefault();
      next.stopPropagation();
      cleanup();
    };
    const finish = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      move(next);
      const moveTrack = ghost !== undefined && destination !== originalIndex && insideDrop();
      const before = remaining[destination]?.dataset.trackId;
      cleanup();
      if (moveTrack) submit(track.id, before);
    };
    cancel.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", abort);
    window.addEventListener("blur", cleanup);
    window.addEventListener("keydown", key, true);
    viewport.addEventListener("scroll", locate);
    handle.addEventListener("lostpointercapture", abort);
    animation = requestAnimationFrame(scroll);
  };
  return { position, ordered, pending, start };
}
