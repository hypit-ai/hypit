import type { NleTimelineScene, NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/view";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { NleStudioTimelineDrop } from "../protocol.js";
import { labelWidth, rulerHeight, snapTimelineEdges, timelineSnapBoundaries } from "./timelineGeometry.js";

export type ItemDropIntent = Pick<NleStudioTimelineDrop, "anchor" | "items" | "deltaFrames" | "target">;

type FloatingItem = {
  readonly id: string;
  readonly title: string;
  readonly kind: "visual" | "audio" | "text" | "compound" | "effect";
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

export type ItemGestureState = {
  readonly ids: readonly string[];
  readonly sourceTrack: string;
  readonly floating: readonly FloatingItem[];
  readonly snapFrame?: number;
  readonly intent?: ItemDropIntent;
};

function itemKind(item: NleTimelineSceneItem, track: NleTimelineSceneTrack, isText: boolean): FloatingItem["kind"] {
  if (item.role === "adjust") return "effect";
  if (track.kind === "audio") return "audio";
  if (track.role === "subtitle" || isText) return "text";
  if (item.source === "composition") return "compound";
  return "visual";
}

function relatedItems(scene: NleTimelineScene, seeds: readonly string[], moving = false): string[] {
  const result = new Set(seeds);
  const relations = scene.groups.map(group => group.items);
  if (moving) {
    relations.push(...scene.transitions.map(transition => [transition.outgoing, transition.incoming]));
    relations.push(...scene.mattes.map(matte => [matte.content, matte.matte]));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const members of relations) {
      if (!members.some((id) => result.has(id))) continue;
      for (const id of members) {
        if (!result.has(id)) { result.add(id); changed = true; }
      }
    }
  }
  return [...result];
}

/** Session-local pointer feedback. The operation resolves destinations after release. */
export function useItemGesture({ scene, textItems, scroller, pixels, frame, snap, busy, selection, onSelect, onMove }: {
  readonly scene: NleTimelineScene;
  readonly textItems: ReadonlySet<string>;
  readonly scroller: RefObject<HTMLDivElement | null>;
  readonly pixels: number;
  readonly frame: number;
  readonly snap: boolean;
  readonly busy: boolean;
  readonly selection: readonly string[];
  readonly onSelect: (ids: readonly string[]) => void;
  readonly onMove: (intent: ItemDropIntent) => void;
}) {
  const [gesture, setGesture] = useState<ItemGestureState>();
  const cancel = useRef<() => void>(() => undefined);
  useEffect(() => () => cancel.current(), [scene, pixels, busy]);

  const start = (event: PointerEvent<HTMLElement>, item: NleTimelineSceneItem, track: NleTimelineSceneTrack) => {
    const viewport = scroller.current;
    if (!viewport || busy || event.button !== 0 || track.locked || !item.affordances.move) return;
    const clicked = relatedItems(scene, [item.id]);
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault(); event.stopPropagation();
      onSelect(selection.includes(item.id)
        ? selection.filter((id) => !clicked.includes(id))
        : relatedItems(scene, [...selection, ...clicked]));
      return;
    }
    const seeds = selection.includes(item.id) ? selection : clicked;
    const ids = new Set(relatedItems(scene, seeds, true));
    const members = scene.tracks.flatMap((row) => row.items
      .filter((candidate) => ids.has(candidate.id))
      .map((candidate) => ({ item: candidate, track: row })));
    if (members.length === 0 || members.some((member) => member.track.locked || !member.item.affordances.move)) return;

    cancel.current(); event.preventDefault(); event.stopPropagation(); onSelect([...ids]);
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX, startY = event.clientY;
    const scrollLeft = viewport.scrollLeft;
    const origins = new Map(Array.from(viewport.querySelectorAll<HTMLElement>("[data-clip-id]"))
      .map((element) => [element.dataset.clipId!, element.getBoundingClientRect()] as const));
    const boundaries = timelineSnapBoundaries(scene, ids);
    const sourceRole = textItems.has(item.id) ? "text" : track.role === "text" ? undefined : track.role;
    const movingEdges = members.flatMap(member => [member.item.startFrame, member.item.startFrame + member.item.durationFrames]);
    const minimum = -Math.min(...members.map((member) => member.item.startFrame));
    handle.setPointerCapture(pointerId);
    let active = false, animation = 0;
    let pointer = { x: startX, y: startY, alt: event.altKey };
    let proposed: ItemDropIntent | undefined;
    let edge: "top" | "bottom" | undefined;

    const locate = () => {
      if (!active) return;
      const rows = Array.from(viewport.querySelectorAll<HTMLElement>(".nle-track[data-track-id]"));
      const bounds = viewport.getBoundingClientRect();
      const inside = pointer.x >= bounds.left + labelWidth && pointer.x < bounds.right
        && pointer.y >= bounds.top + rulerHeight && pointer.y < bounds.bottom;
      let targetIndex = scene.tracks.findIndex((candidate) => candidate.id === track.id);
      let insertionIndex: number | undefined;
      const first = rows[0];
      const last = rows.at(-1);
      if (inside && first && last) {
        const movedVertically = Math.abs(pointer.y - startY) > 4;
        const tolerance = movedVertically ? 6 : 0;
        if (pointer.y <= first.getBoundingClientRect().top + (edge === "top" ? 12 : tolerance)) {
          edge = "top";
          insertionIndex = 0;
        } else if (pointer.y >= last.getBoundingClientRect().bottom - (edge === "bottom" ? 12 : tolerance)) {
          edge = "bottom";
          insertionIndex = rows.length;
        } else {
          edge = undefined;
          if (movedVertically) {
            const boundary = rows.findIndex(row => Math.abs(pointer.y - row.getBoundingClientRect().top) <= tolerance);
            if (boundary >= 0) insertionIndex = boundary;
            else targetIndex = rows.findIndex(row => {
              const rect = row.getBoundingClientRect();
              return pointer.y >= rect.top && pointer.y < rect.bottom;
            });
          }
        }
      }
      const lane = scene.tracks[targetIndex];
      const before = insertionIndex === undefined ? undefined : scene.tracks[insertionIndex]?.id;
      const target: ItemDropIntent["target"] | undefined = insertionIndex !== undefined
        ? { kind: "gap", ...(before === undefined ? {} : { before }) }
        : lane === undefined ? undefined : { kind: "track", track: lane.id };
      const valid = inside && target !== undefined && (target.kind === "gap"
        || lane?.kind === track.kind && lane.role === sourceRole && !lane.locked);
      const raw = Math.max(Math.ceil(minimum), Math.round((pointer.x - startX + viewport.scrollLeft - scrollLeft) / pixels));
      const aligned = snap && !pointer.alt && (raw !== 0 || target?.kind !== "gap")
        ? snapTimelineEdges(movingEdges.map(value => value + raw), frame, boundaries, pixels, delta => raw + delta >= minimum)
        : undefined;
      const delta = Math.max(Math.ceil(minimum), raw + Math.round(aligned?.correction ?? 0));
      const floating = members.flatMap((member): FloatingItem[] => {
        const origin = origins.get(member.item.id);
        return origin === undefined ? [] : [{ id: member.item.id, title: member.item.display.title,
          kind: itemKind(member.item, member.track, textItems.has(member.item.id)), left: origin.left + (aligned === undefined ? pointer.x - startX : delta * pixels - (viewport.scrollLeft - scrollLeft)),
          top: origin.top + pointer.y - startY, width: origin.width, height: origin.height }];
      });
      proposed = valid ? { anchor: item.id, items: seeds, deltaFrames: delta, target } : undefined;
      setGesture({ ids: [...ids], sourceTrack: track.id, floating, ...(proposed === undefined ? {} : { intent: proposed }),
        ...(aligned === undefined ? {} : { snapFrame: aligned.frame }) });
    };

    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      pointer = { x: next.clientX, y: next.clientY, alt: next.altKey };
      active ||= Math.abs(pointer.x - startX) > 3 || Math.abs(pointer.y - startY) > 3;
      locate();
    };
    const scroll = () => {
      if (active) {
        const bounds = viewport.getBoundingClientRect();
        const dx = pointer.x < bounds.left + labelWidth + 24 ? -Math.min(12, (bounds.left + labelWidth + 24 - pointer.x) / 4)
          : pointer.x > bounds.right - 24 ? Math.min(12, (pointer.x - bounds.right + 24) / 4) : 0;
        const dy = pointer.y < bounds.top + rulerHeight + 24 ? -Math.min(10, (bounds.top + rulerHeight + 24 - pointer.y) / 4)
          : pointer.y > bounds.bottom - 24 ? Math.min(10, (pointer.y - bounds.bottom + 24) / 4) : 0;
        if (dx || dy) { viewport.scrollLeft += dx; viewport.scrollTop += dy; locate(); }
      }
      animation = requestAnimationFrame(scroll);
    };
    const cleanup = () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", abort); window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cleanup);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      setGesture(undefined); cancel.current = () => undefined;
    };
    const abort = (next: globalThis.PointerEvent) => { if (next.pointerId === pointerId) cleanup(); };
    const key = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); cleanup(); } };
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      move(next); const accepted = proposed, wasActive = active; cleanup();
      if (!wasActive) { onSelect([...ids]); return; }
      if (accepted !== undefined && (accepted.deltaFrames !== 0
        || accepted.target.kind === "gap" || accepted.target.track !== track.id)) onMove(accepted);
    };
    cancel.current = cleanup;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", abort); window.addEventListener("keydown", key);
    window.addEventListener("blur", cleanup); animation = requestAnimationFrame(scroll);
  };

  return { gesture, start, cancel: () => cancel.current() };
}
