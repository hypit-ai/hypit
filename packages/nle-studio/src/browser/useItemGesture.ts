import type { NleTimelineScene, NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/view";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { NleStudioTimelineDrop } from "../protocol.js";
import { labelWidth, rulerHeight } from "./timelineGeometry.js";

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
  readonly floating: readonly FloatingItem[];
  readonly insertionTop?: number;
  readonly snapFrame?: number;
  readonly valid: boolean;
};

function itemKind(item: NleTimelineSceneItem, track: NleTimelineSceneTrack): FloatingItem["kind"] {
  if (item.role === "adjust") return "effect";
  if (track.kind === "audio") return "audio";
  if (item.source === "composition") return "compound";
  return item.display.layers.some((layer) => layer.kind === "text") ? "text" : "visual";
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
export function useItemGesture({ scene, scroller, pixels, frame, snap, busy, selection, onSelect, onMove }: {
  readonly scene: NleTimelineScene;
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
    const boundaries = [0, frame, ...scene.tracks.flatMap((row) => row.items
      .filter((candidate) => !ids.has(candidate.id))
      .flatMap((candidate) => [candidate.startFrame, candidate.startFrame + candidate.durationFrames]))];
    const minimum = -Math.min(...members.map((member) => member.item.startFrame));
    handle.setPointerCapture(pointerId);
    let active = false, animation = 0;
    let pointer = { x: startX, y: startY, alt: event.altKey };
    let proposed: ItemDropIntent | undefined;

    const locate = () => {
      if (!active) return;
      let delta = Math.max(minimum, Math.round((pointer.x - startX + viewport.scrollLeft - scrollLeft) / pixels));
      let aligned: number | undefined;
      if (snap && !pointer.alt) {
        let adjustment: number | undefined;
        for (const edge of members.flatMap((member) => [member.item.startFrame, member.item.startFrame + member.item.durationFrames])) {
          for (const boundary of boundaries) {
            const correction = boundary - (edge + delta);
            if (Math.abs(correction * pixels) <= 7 && Math.abs(correction) < Math.abs(adjustment ?? Infinity)
              && delta + correction >= minimum) {
              adjustment = correction;
              aligned = boundary;
            }
          }
        }
        delta += adjustment ?? 0;
      }

      const rows = Array.from(viewport.querySelectorAll<HTMLElement>(".nle-track[data-track-id]"));
      const bounds = viewport.getBoundingClientRect();
      const inside = pointer.x >= bounds.left + labelWidth && pointer.x < bounds.right
        && pointer.y >= bounds.top + rulerHeight && pointer.y < bounds.bottom;
      let targetIndex = scene.tracks.findIndex((candidate) => candidate.id === track.id);
      let insertionIndex: number | undefined;
      if (inside && Math.abs(pointer.y - startY) > 4) {
        const y = Math.max(bounds.top + rulerHeight + 1, Math.min(bounds.bottom - 1, pointer.y));
        const boundary = rows.findIndex((row) => Math.abs(y - row.getBoundingClientRect().top) <= 6);
        const afterLast = rows.length > 0 && y >= rows.at(-1)!.getBoundingClientRect().bottom - 6;
        if (boundary >= 0 || afterLast) insertionIndex = boundary >= 0 ? boundary : rows.length;
        else targetIndex = rows.findIndex((row) => { const rect = row.getBoundingClientRect(); return y >= rect.top && y < rect.bottom; });
      }

      const lane = scene.tracks[targetIndex];
      const before = insertionIndex === undefined ? undefined : scene.tracks[insertionIndex]?.id;
      const target: ItemDropIntent["target"] | undefined = insertionIndex !== undefined
        ? { kind: "gap", ...(before === undefined ? {} : { before }) }
        : lane === undefined ? undefined : { kind: "track", track: lane.id };
      const valid = inside && target !== undefined;
      const lastRow = rows.at(-1);
      const insertionTop = insertionIndex === undefined ? undefined
        : rows[insertionIndex]?.offsetTop ?? (lastRow === undefined ? undefined : lastRow.offsetTop + lastRow.offsetHeight);

      const floating = members.flatMap((member): FloatingItem[] => {
        const origin = origins.get(member.item.id);
        return origin === undefined ? [] : [{ id: member.item.id, title: member.item.display.title,
          kind: itemKind(member.item, member.track), left: origin.left + pointer.x - startX,
          top: origin.top + pointer.y - startY, width: origin.width, height: origin.height }];
      });
      proposed = valid ? { anchor: item.id, items: seeds, deltaFrames: delta, target } : undefined;
      setGesture({ ids: [...ids], floating, valid, ...(insertionTop === undefined ? {} : { insertionTop }),
        ...(aligned === undefined ? {} : { snapFrame: aligned }) });
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
