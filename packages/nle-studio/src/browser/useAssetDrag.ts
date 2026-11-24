import type { NleTimelineScene, NleTimelineSceneTrack } from "@hypit/nle/surface";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { NleStudioMediaEntry } from "../protocol.js";
import { acceptsTimelinePlacement, trackHasRoom, transitionCutAt, type MediaDragPosition, type MediaDrop, type TransitionCut } from "./mediaDrag.js";
import { labelWidth, locateTimelineDrop, rowHeight, rulerHeight, snapTimelineEdges, timelineFrameAt, timelineOrigin, timelineSnapBoundaries,
  type TimelineSnap } from "./timelineGeometry.js";

export function useAssetDrag(scene: NleTimelineScene | undefined, root: RefObject<HTMLElement | null>, frame: number, busy: boolean,
  place: (drop: MediaDrop) => void, select: (entry: NleStudioMediaEntry) => void,
  moveToFolder: (asset: string, folder: string | null) => void) {
  const [drag, setDrag] = useState<{
    entry: NleStudioMediaEntry; x: number; y: number; media: boolean; overTimeline: boolean;
    drop?: MediaDrop; folder?: string | null; mediaPosition?: MediaDragPosition;
  }>();
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
    let heldSnap: TimelineSnap | undefined, snapDestination: HTMLElement | undefined;
    let folder: string | null | undefined;
    let pointer = { x, y, alt: event.altKey }, viewport: HTMLElement | undefined;
    const boundaries = timelineSnapBoundaries(scene);
    const media = !cuts && !component && !adjust;
    const medium = entry.kind === "audio" ? "audio" : "picture";
    const destinationRole = role ?? medium;
    const fps = scene.editRate.numerator / scene.editRate.denominator;
    const duration = cuts === undefined
      ? entry.durationFrames ?? Math.max(1, Math.round(5 * fps))
      : undefined;
    const mediaDuration = entry.duration === undefined ? Math.max(1, Math.round(5 * fps))
      : Number(entry.duration.ticks) * entry.duration.timeBase.numerator / entry.duration.timeBase.denominator * fps;
    const timeline = media ? root.current?.querySelector<HTMLElement>(".nle-timeline-scroll") : undefined;
    let mediaPosition: MediaDragPosition | undefined;
    let mediaEdge: "top" | "bottom" | undefined;
    let mediaSnapDestination: string | undefined;
    const locateMedia = (scroller: HTMLElement) => {
      const location = locateTimelineDrop(scroller, pointer, { edge: mediaEdge });
      mediaEdge = location.edge;
      viewport = location.inside ? scroller : undefined;
      const pixels = Number(scroller.dataset.framePixels);
      if (!(pixels > 0) || (!location.inside && mediaPosition === undefined)) return;
      const track = scene.tracks.find(candidate => candidate.id === location.track);
      const before = location.gap?.before;
      const target = !location.inside ? undefined : location.gap !== undefined
        ? { gap: true as const, ...(before === undefined ? {} : { before }) }
        : track !== undefined && acceptsTimelinePlacement(track, medium, destinationRole) ? { track: track.id } : undefined;
      const key = target === undefined ? undefined : "track" in target ? `track:${target.track}` : `gap:${target.before ?? ""}`;
      if (key !== mediaSnapDestination) heldSnap = undefined;
      mediaSnapDestination = key;
      const raw = Math.max(0, timelineFrameAt(scroller, location.bounds, pointer.x, pixels));
      heldSnap = target !== undefined && scroller.dataset.snap === "true" && !pointer.alt
        ? snapTimelineEdges([raw, raw + mediaDuration], frame, boundaries, pixels, { held: heldSnap,
          allows: candidate => {
            const start = raw + candidate.correction;
            return start >= 0 && Math.abs(start - Math.round(start)) < 1e-6;
          } }) : undefined;
      const at = Math.round(raw + (heldSnap?.correction ?? 0));
      mediaPosition = {
        left: location.inside ? location.bounds.left + timelineOrigin + at * pixels - scroller.scrollLeft : pointer.x,
        top: pointer.y - (rowHeight - 6) / 2,
        pixels, frame: at, durationFrames: mediaDuration,
      };
      if (target !== undefined) drop = { id: entry.id, frame: at, mediaTarget: target, mediaPosition,
        ...(heldSnap === undefined ? {} : { snapFrame: heldSnap.frame }) };
    };
    const locate = () => {
      if (!moved) return;
      const hit = document.elementFromPoint(pointer.x, pointer.y);
      const folderId = media ? hit?.closest<HTMLElement>("[data-media-folder-drop]")?.dataset.mediaFolderDrop : undefined;
      folder = folderId === "" ? null : folderId;
      drop = undefined;
      if (timeline) {
        locateMedia(timeline);
        setDrag({ entry, x: pointer.x, y: pointer.y, media, overTimeline: viewport !== undefined,
          ...(drop === undefined ? {} : { drop }), ...(folder === undefined ? {} : { folder }),
          ...(mediaPosition === undefined ? {} : { mediaPosition }) });
        return;
      }
      const target = hit?.closest<HTMLElement>("[data-nle-drop]") ?? undefined;
      if (target !== snapDestination) { heldSnap = undefined; snapDestination = target; }
      viewport = target && root.current?.contains(target) ? target.closest<HTMLElement>(".nle-timeline-scroll") ?? undefined : undefined;
      let overTimeline = false;
      if (viewport && target) {
        const pixels = Number(viewport.dataset.framePixels), bounds = viewport.getBoundingClientRect();
        const track = scene.tracks.find(track => track.id === target.dataset.nleDrop);
        if (pixels > 0 && pointer.x >= bounds.left + labelWidth && pointer.y >= bounds.top + rulerHeight) {
          overTimeline = true;
          const position = timelineFrameAt(viewport, bounds, pointer.x, pixels);
          if (cuts !== undefined && track) {
            const transitionCut = transitionCutAt(cuts, position, track.id, 12 / pixels);
            if (transitionCut) drop = { id: entry.id, frame: transitionCut.frame, track: track.id, transitionCut };
          } else if (cuts === undefined) {
            const at = Math.max(0, position);
            const aligned = viewport.dataset.snap === "true" && !pointer.alt
              ? snapTimelineEdges([at], frame, boundaries, pixels, { held: heldSnap }) : undefined;
            const dropFrame = Math.round(aligned?.frame ?? at);
            const item = hit?.closest<HTMLElement>("[data-clip-id]")?.dataset.clipId;
            const attachment = process === true && track !== undefined && !track.locked
              && track.items.some(clip => clip.id === item && clip.kind === "present" && clip.signals[medium]);
            const compatible = track === undefined || acceptsTimelinePlacement(track, medium, destinationRole) || attachment;
            const vacant = track === undefined || attachment || adjust
              || duration !== undefined && trackHasRoom(track, dropFrame, duration);
            if (compatible && vacant) {
              heldSnap = aligned;
              drop = { id: entry.id, frame: dropFrame,
                ...(aligned ? { snapFrame: aligned.frame } : {}), ...(track ? { track: track.id } : {}),
                ...(item ? { item } : {}), ...(duration === undefined || attachment ? {} : { durationFrames: duration }) };
            }
          }
        }
      }
      if (!drop) heldSnap = undefined;
      setDrag({ entry, x: pointer.x, y: pointer.y, media, overTimeline, ...(drop ? { drop } : {}), ...(folder === undefined ? {} : { folder }) });
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      pointer = { x: next.clientX, y: next.clientY, alt: next.altKey };
      if (!moved && Math.hypot(pointer.x - x, pointer.y - y) > 4) {
        moved = true;
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && (focused === handle || handle.closest(".nle-bin")?.contains(focused))) focused.blur();
      }
      locate();
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
      window.removeEventListener("pointercancel", abort); window.removeEventListener("keydown", key, true); window.removeEventListener("blur", clean);
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
    window.addEventListener("pointercancel", abort); window.addEventListener("keydown", key, true); window.addEventListener("blur", clean);
    animation = requestAnimationFrame(scroll);
  };
  return { drag, start };
}
