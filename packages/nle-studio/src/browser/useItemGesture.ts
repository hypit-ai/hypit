import type { NleTimelineScene, NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/view";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { labelWidth, rulerHeight } from "./timelineGeometry.js";
import { linkedSelection } from "./selection.js";

export type ItemTrackAddition = {
  readonly id: string;
  readonly name: string;
  readonly kind: NleTimelineSceneTrack["kind"];
  readonly displayBefore?: string;
};

export type ItemMovePlan = {
  readonly ids: readonly string[];
  readonly deltaFrames: number;
  readonly destinations: readonly { readonly item: string; readonly track: string }[];
  readonly additions: readonly ItemTrackAddition[];
};

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
  readonly dropTrack?: string;
  readonly plan: ItemMovePlan | undefined;
  readonly valid: boolean;
};

function itemKind(item: NleTimelineSceneItem, track: NleTimelineSceneTrack): FloatingItem["kind"] {
  if (item.role === "adjust") return "effect";
  if (track.kind === "audio") return "audio";
  if (item.source === "composition") return "compound";
  return item.display.layers.some((layer) => layer.kind === "text") ? "text" : "visual";
}

function overlaps(item: NleTimelineSceneItem, start: number, duration: number): boolean {
  return start < item.startFrame + item.durationFrames && item.startFrame < start + duration;
}

function newTrackId(): string {
  return `track-${crypto.randomUUID().slice(0, 8)}`;
}

/** Session-only pointer planning over the current finite Timeline projection. */
export function useItemGesture({ scene, rows: displayRows, scroller, pixels, frame, snap, busy, selection, onSelect, onMove }: {
  readonly scene: NleTimelineScene;
  readonly rows: readonly NleTimelineSceneTrack[];
  readonly scroller: RefObject<HTMLDivElement | null>;
  readonly pixels: number;
  readonly frame: number;
  readonly snap: boolean;
  readonly busy: boolean;
  readonly selection: readonly string[];
  readonly onSelect: (ids: readonly string[]) => void;
  readonly onMove: (plan: ItemMovePlan) => void;
}) {
  const [gesture, setGesture] = useState<ItemGestureState>();
  const cancel = useRef<() => void>(() => undefined);
  useEffect(() => () => cancel.current(), [scene, displayRows, pixels, busy]);

  const start = (event: PointerEvent<HTMLElement>, item: NleTimelineSceneItem, track: NleTimelineSceneTrack) => {
    const viewport = scroller.current;
    if (!viewport || busy || event.button !== 0 || track.locked || !item.affordances.move) return;
    const clicked = linkedSelection(scene, [item.id]);
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault(); event.stopPropagation();
      onSelect(selection.includes(item.id)
        ? selection.filter((id) => !clicked.includes(id))
        : linkedSelection(scene, [...selection, ...clicked]));
      return;
    }
    const ids = new Set(linkedSelection(scene, selection.includes(item.id) ? selection : clicked));
    const movingTracks = scene.tracks.map((row) => ({
      track: row, items: row.items.filter((candidate) => ids.has(candidate.id)),
    })).filter(({ items }) => items.length > 0);
    const members = movingTracks.flatMap(({ track, items }) => items.map((item) => ({ item, track })));
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
    const created = new Map<string, ItemTrackAddition>();
    handle.setPointerCapture(pointerId);
    let active = false, animation = 0;
    let pointer = { x: startX, y: startY, alt: event.altKey };
    let proposed: ItemMovePlan | undefined, previousPlan = "";

    const locate = () => {
      if (!active) return;
      const rawDelta = Math.max(minimum, Math.round((pointer.x - startX + viewport.scrollLeft - scrollLeft) / pixels));
      let delta = rawDelta;
      let aligned: number | undefined;
      if (snap && !pointer.alt) {
        let best = Infinity;
        for (const edge of members.flatMap((member) => [member.item.startFrame, member.item.startFrame + member.item.durationFrames])) {
          for (const boundary of boundaries) {
            const correction = boundary - (edge + rawDelta);
            if (Math.abs(correction * pixels) <= 7 && Math.abs(correction) < best && rawDelta + correction >= minimum) {
              best = Math.abs(correction); aligned = boundary; delta = rawDelta + correction;
            }
          }
        }
      }

      const rows = Array.from(viewport.querySelectorAll<HTMLElement>(".nle-track[data-track-id]")).filter(row => displayRows.some(track => track.id === row.dataset.trackId));
      const bounds = viewport.getBoundingClientRect();
      const inside = pointer.x >= bounds.left + labelWidth && pointer.x < bounds.right
        && pointer.y >= bounds.top + rulerHeight && pointer.y < bounds.bottom;
      let targetIndex = displayRows.findIndex((candidate) => candidate.id === track.id);
      let insertionIndex: number | undefined;
      const firstRow = rows[0], lastRow = rows.at(-1);
      const movedVertically = Math.abs(pointer.y - startY) > 4;
      if (inside && firstRow && lastRow) {
        const y = pointer.y;
        const tolerance = movedVertically ? 6 : 0;
        if (y <= firstRow.getBoundingClientRect().top + tolerance) insertionIndex = 0;
        else if (y >= lastRow.getBoundingClientRect().bottom - tolerance) insertionIndex = rows.length;
        else if (movedVertically) {
          const boundary = rows.findIndex((row) => Math.abs(y - row.getBoundingClientRect().top) <= tolerance);
          if (boundary >= 0) insertionIndex = boundary;
          else targetIndex = rows.findIndex((row) => { const rect = row.getBoundingClientRect(); return y >= rect.top && y < rect.bottom; });
        }
      }

      const valid = inside && targetIndex >= 0;
      const destinations = new Map<string, string>();
      const additions: ItemTrackAddition[] = [];
      let insertionTop: number | undefined;
      const anchorIndex = displayRows.findIndex((candidate) => candidate.id === track.id);

      const additionAt = (index: number, kind: NleTimelineSceneTrack["kind"], key: string): ItemTrackAddition => {
        const bounded = Math.max(0, Math.min(displayRows.length, index));
        const cacheKey = `${key}:${kind}:${bounded}`;
        let addition = created.get(cacheKey);
        if (addition === undefined) {
          const displayBefore = (bounded === 0 ? scene.tracks[0] : displayRows[bounded])?.id;
          addition = {
            id: newTrackId(), name: kind === "audio" ? "音频轨道" : "视频轨道", kind,
            ...(displayBefore === undefined ? {} : { displayBefore }),
          };
          created.set(cacheKey, addition);
        }
        if (!additions.some((candidate) => candidate.id === addition!.id)) additions.push(addition);
        if (key === "drop" || insertionIndex === undefined) {
          insertionTop = rows[bounded]?.offsetTop ?? (lastRow ? lastRow.offsetTop + lastRow.offsetHeight : undefined);
        }
        return addition;
      };

      const inserted = insertionIndex === undefined ? undefined : additionAt(insertionIndex, track.kind, "drop");
      const offset = (insertionIndex ?? targetIndex) - anchorIndex;
      const plannedItems = new Map<string, readonly NleTimelineSceneItem[]>();
      for (const { track: source, items } of movingTracks) {
        const sourceIndex = displayRows.findIndex((candidate) => candidate.id === source.id);
        const desiredIndex = sourceIndex + offset;
        let destinationId = inserted && source.id === track.id ? inserted.id : undefined;
        if (destinationId === undefined) {
          const fits = (candidate: NleTimelineSceneTrack) => candidate.kind === source.kind && !candidate.locked
            && items.every((item) => candidate.items.every((other) => ids.has(other.id)
              || !overlaps(other, item.startFrame + delta, item.durationFrames))
              && (plannedItems.get(candidate.id) ?? []).every((other) => !overlaps(other, item.startFrame, item.durationFrames)));
          const target = displayRows[desiredIndex];
          const destination = target && fits(target) ? target : displayRows
            .map((candidate, index) => ({ candidate, distance: Math.abs(index - desiredIndex) }))
            .filter(({ candidate }) => fits(candidate))
            .sort((a, b) => a.distance - b.distance)[0]?.candidate;
          destinationId = destination?.id ?? additionAt(desiredIndex, source.kind, `overlap:${source.id}`).id;
        }
        plannedItems.set(destinationId, [...(plannedItems.get(destinationId) ?? []), ...items]);
        for (const item of items) destinations.set(item.id, destinationId);
      }

      const floating = members.flatMap((member): FloatingItem[] => {
        const origin = origins.get(member.item.id);
        return origin === undefined ? [] : [{ id: member.item.id, title: member.item.display.title,
          kind: itemKind(member.item, member.track), left: origin.left + pointer.x - startX,
          top: origin.top + pointer.y - startY, width: origin.width, height: origin.height }];
      });
      const plan = valid ? { ids: [...ids], deltaFrames: delta,
        destinations: [...destinations].filter(([id, destination]) => members.find((member) => member.item.id === id)?.track.id !== destination)
          .map(([movedItem, destination]) => ({ item: movedItem, track: destination })), additions } : undefined;
      const key = JSON.stringify(plan) ?? "";
      if (key !== previousPlan) { previousPlan = key; proposed = plan; }
      const dropTrack = valid && insertionIndex === undefined && destinations.get(item.id) === displayRows[targetIndex]?.id
        ? displayRows[targetIndex]?.id : undefined;
      setGesture({ ids: [...ids], floating, valid, plan: proposed, ...(dropTrack === undefined ? {} : { dropTrack }), ...(!valid || insertionTop === undefined ? {} : { insertionTop }),
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
      if (accepted !== undefined && (accepted.deltaFrames !== 0 || accepted.destinations.length > 0)) onMove(accepted);
    };
    cancel.current = cleanup;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", abort); window.addEventListener("keydown", key);
    window.addEventListener("blur", cleanup); animation = requestAnimationFrame(scroll);
  };

  return { gesture, start, cancel: () => cancel.current() };
}
