import type { NleTimelineScene } from "@hypit/nle/view";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { editableSelection } from "./selection.js";
import { labelWidth, rulerHeight } from "./timelineGeometry.js";

export function useMarqueeSelection(scene: NleTimelineScene, viewport: RefObject<HTMLDivElement | null>, selection: readonly string[], onSelect: (ids: readonly string[]) => void, busy: boolean, pixels: number, onBlankClick: (frame: number) => void) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number; visible: boolean }>();
  const cancel = useRef<() => void>(() => undefined);
  useEffect(() => () => cancel.current(), [scene, busy, pixels]);
  const start = (event: PointerEvent<HTMLDivElement>) => {
    const element = viewport.current;
    if (!element || busy || event.button !== 0 || (event.target as Element).closest(".nle-clip,.nle-track-label,.nle-ruler,button")) return;
    const bounds = element.getBoundingClientRect();
    if (event.clientX < bounds.left + labelWidth || event.clientX >= bounds.right - (element.offsetWidth - element.clientWidth) || event.clientY >= bounds.bottom - (element.offsetHeight - element.clientHeight)) return;
    cancel.current(); event.preventDefault();
    const pointerId = event.pointerId, original = selection, additive = event.metaKey || event.ctrlKey;
    const inTrack = (event.target as Element).classList.contains("nle-track-content");
    const origin = { x: event.clientX - bounds.left + element.scrollLeft, y: event.clientY - bounds.top + element.scrollTop };
    let pointer = { x: event.clientX, y: event.clientY }, active = false, animation = 0;
    element.setPointerCapture(pointerId);
    if (!additive) onSelect([]);
    const locate = () => {
      const bounds = element.getBoundingClientRect();
      const x = Math.max(labelWidth, pointer.x - bounds.left + element.scrollLeft), y = Math.max(rulerHeight, pointer.y - bounds.top + element.scrollTop);
      active ||= Math.abs(x - origin.x) > 3 || Math.abs(y - origin.y) > 3;
      if (!active) return;
      const rect = { left: Math.min(origin.x, x), top: Math.min(origin.y, y), width: Math.abs(origin.x - x), height: Math.abs(origin.y - y) };
      const left = Math.max(rect.left, element.scrollLeft + labelWidth), top = Math.max(rect.top, element.scrollTop + rulerHeight);
      setBox({ left, top, width: Math.max(0, rect.left + rect.width - left), height: Math.max(0, rect.top + rect.height - top), visible: true });
      const ids = Array.from(element.querySelectorAll<HTMLElement>("[data-clip-id]")).filter(clip => {
        const client = clip.getBoundingClientRect(), left = client.left - bounds.left + element.scrollLeft, top = client.top - bounds.top + element.scrollTop;
        return left < rect.left + rect.width && left + client.width > rect.left && top < rect.top + rect.height && top + client.height > rect.top;
      }).map(clip => clip.dataset.clipId!);
      onSelect(editableSelection(scene, [...(additive ? original : []), ...ids]));
    };
    const move = (next: globalThis.PointerEvent) => { if (next.pointerId !== pointerId) return; pointer = { x: next.clientX, y: next.clientY }; locate(); };
    const cleanup = () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", abort); window.removeEventListener("keydown", key); window.removeEventListener("blur", abort);
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      setBox(previous => previous ? { ...previous, visible: false } : undefined); cancel.current = () => undefined;
    };
    const abort = () => { cleanup(); onSelect(original); };
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      move(next); cleanup();
      if (!active && inTrack && !additive) onBlankClick(Math.round((origin.x - labelWidth) / pixels));
    };
    const key = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); abort(); } };
    const scroll = () => {
      if (active) {
        const bounds = element.getBoundingClientRect();
        const dx = pointer.x < bounds.left + labelWidth + 24 ? -10 : pointer.x > bounds.right - 24 ? 10 : 0;
        const dy = pointer.y < bounds.top + rulerHeight + 24 ? -8 : pointer.y > bounds.bottom - 24 ? 8 : 0;
        if (dx || dy) { element.scrollLeft += dx; element.scrollTop += dy; locate(); }
      }
      animation = requestAnimationFrame(scroll);
    };
    cancel.current = cleanup; animation = requestAnimationFrame(scroll);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", abort); window.addEventListener("keydown", key); window.addEventListener("blur", abort);
  };
  return { box, start, cancel: () => cancel.current() };
}
