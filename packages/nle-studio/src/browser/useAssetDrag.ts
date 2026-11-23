import type { NleTimelineScene, NleTimelineSceneTrack } from "@hypit/nle/surface";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { NleStudioMediaEntry } from "../protocol.js";
import { acceptsTimelinePlacement, trackHasRoom, transitionCutAt, type MediaDrop, type TransitionCut } from "./mediaDrag.js";
import { labelWidth, rulerHeight, snapTimelineEdges, timelineOrigin, timelineSnapBoundaries } from "./timelineGeometry.js";

export function useAssetDrag(scene: NleTimelineScene | undefined, root: RefObject<HTMLElement | null>, frame: number, busy: boolean,
  place: (drop: MediaDrop) => void, select: (entry: NleStudioMediaEntry) => void,
  moveToFolder: (asset: string, folder: string | null) => void) {
  const [drag, setDrag] = useState<{ entry: NleStudioMediaEntry; x: number; y: number; drop?: MediaDrop; folder?: string | null }>();
  const cancel = useRef<() => void>(() => undefined);
  useEffect(() => () => cancel.current(), [scene, busy]);
  const start = (event: ReactPointerEvent, entry: NleStudioMediaEntry, { cuts, role, component, adjust, process, onClick }: {
    cuts?: readonly TransitionCut[];
    role?: NleTimelineSceneTrack["role"];
    component?: boolean;
    adjust?: boolean;
    process?: boolean;
    onClick?: (entry: NleStudioMediaEntry) => void;
  } = {}) => {
    if (event.button !== 0 || !scene || busy || entry.state !== "available") return;
    cancel.current(); event.preventDefault();
    const handle = event.currentTarget, pointerId = event.pointerId, x = event.clientX, y = event.clientY;
    handle.setPointerCapture(pointerId);
    let moved = false, drop: MediaDrop | undefined, animation = 0;
    let folder: string | null | undefined;
    let pointer = { x, y, alt: event.altKey }, viewport: HTMLElement | undefined;
    const boundaries = timelineSnapBoundaries(scene);
    const media = !cuts && !component && !adjust;
    const medium = entry.kind === "audio" ? "audio" : "picture";
    const destinationRole = role ?? medium;
    const duration = cuts === undefined
      ? entry.durationFrames ?? Math.max(1, Math.round(5 * scene.editRate.numerator / scene.editRate.denominator))
      : undefined;
    const locate = () => {
      if (!moved) return;
      const hit = document.elementFromPoint(pointer.x, pointer.y);
      const folderId = media ? hit?.closest<HTMLElement>("[data-media-folder-drop]")?.dataset.mediaFolderDrop : undefined;
      folder = folderId === "" ? null : folderId;
      const target = hit?.closest<HTMLElement>("[data-nle-drop]");
      viewport = target && root.current?.contains(target) ? target.closest<HTMLElement>(".nle-timeline-scroll") ?? undefined : undefined;
      drop = undefined;
      if (viewport && target) {
        const pixels = Number(viewport.dataset.framePixels), bounds = viewport.getBoundingClientRect();
        const track = scene.tracks.find(track => track.id === target.dataset.nleDrop);
        if (pixels > 0 && pointer.x >= bounds.left + labelWidth && pointer.y >= bounds.top + rulerHeight) {
          const position = (pointer.x - bounds.left - timelineOrigin + viewport.scrollLeft) / pixels;
          if (cuts !== undefined && track) {
            const transitionCut = transitionCutAt(cuts, position, track.id, 32 / pixels);
            if (transitionCut) drop = { id: entry.id, frame: transitionCut.frame, track: track.id, transitionCut };
          } else if (cuts === undefined) {
            const at = Math.max(0, Math.round(position));
            const aligned = viewport.dataset.snap === "true" && !pointer.alt
              ? snapTimelineEdges([at], frame, boundaries, pixels) : undefined;
            const dropFrame = Math.round(aligned?.frame ?? at);
            const item = hit?.closest<HTMLElement>("[data-clip-id]")?.dataset.clipId;
            const attachment = process === true && track?.enabled === true && !track.locked
              && track.items.some(clip => clip.id === item && clip.kind === "present" && clip.signals[medium]);
            const compatible = track === undefined || acceptsTimelinePlacement(track, medium, destinationRole) || attachment;
            // Picture insertion at a direct cut shifts the following clips. Other media drops need a vacant range.
            const insert = media && track?.role === "picture" && track.items.some(clip => clip.startFrame === dropFrame)
              && !track.items.some(clip => clip.startFrame < dropFrame && clip.startFrame + clip.durationFrames > dropFrame);
            const vacant = track === undefined || attachment || adjust || insert
              || duration !== undefined && trackHasRoom(track, dropFrame, duration);
            if (compatible && vacant) drop = { id: entry.id, frame: dropFrame,
              ...(aligned ? { snapFrame: aligned.frame } : {}), ...(track ? { track: track.id } : {}),
              ...(item ? { item } : {}), ...(duration === undefined || attachment ? {} : { durationFrames: duration }) };
          }
        }
      }
      setDrag({ entry, x: pointer.x, y: pointer.y, ...(drop ? { drop } : {}), ...(folder === undefined ? {} : { folder }) });
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
      if (!moved) (onClick ?? select)(entry);
      else if (accepted) place(accepted);
      else if (folder !== undefined) moveToFolder(entry.id, folder);
    };
    cancel.current = clean;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", abort); window.addEventListener("keydown", key); window.addEventListener("blur", clean);
    animation = requestAnimationFrame(scroll);
  };
  return { drag, start };
}
