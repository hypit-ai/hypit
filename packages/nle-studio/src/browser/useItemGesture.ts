import { nleGroupMoveItems } from "@hypit/nle";
import type { NleTimelineScene, NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/surface";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { NleStudioTimelineDrop } from "../protocol.js";
import { labelWidth, rulerHeight, snapTimelineEdges, timelineItemLabel, timelineSnapBoundaries } from "./timelineGeometry.js";

export type ItemDropIntent = Pick<NleStudioTimelineDrop, "anchor" | "items" | "deltaFrames" | "target">;

type FloatingItem = {
  readonly id: string;
  readonly title: string;
  readonly role: NleTimelineSceneTrack["role"];
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly picture?: HTMLCanvasElement;
};

type SubmittedMove = {
  readonly floating: readonly FloatingItem[];
  readonly origins: ReadonlyMap<string, { readonly frame: number; readonly track: string }>;
  readonly pixels: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
};

export type ItemGestureState = {
  readonly ids: readonly string[];
  readonly sourceTrack: string;
  readonly floating: readonly FloatingItem[];
  readonly snapFrame?: number;
  readonly intent?: ItemDropIntent;
};

function copyFilmstrip(element: HTMLElement, clip: DOMRect): HTMLCanvasElement | undefined {
  const source = element.querySelector<HTMLCanvasElement>("canvas.nle-clip-filmstrip");
  if (source === null || source.width === 0 || source.height === 0) return;
  const bounds = source.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) return;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d")?.drawImage(source, 0, 0);
  Object.assign(canvas.style, { position: "absolute", left: `${bounds.left - clip.left - element.clientLeft}px`,
    top: `${bounds.top - clip.top - element.clientTop}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
  return canvas;
}

function relatedItems(scene: NleTimelineScene, seeds: readonly string[]): Set<string> {
  let result = new Set(seeds);
  const relations = [
    ...scene.transitions.map(transition => [transition.outgoing, transition.incoming]),
    ...scene.mattes.map(matte => [matte.content, matte.matte]),
  ];
  let changed = true;
  while (changed) {
    const size = result.size;
    result = nleGroupMoveItems(scene, result);
    for (const members of relations) {
      if (!members.some((id) => result.has(id))) continue;
      for (const id of members) result.add(id);
    }
    changed = size !== result.size;
  }
  return result;
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
  readonly onMove: (intent: ItemDropIntent) => Promise<void>;
}) {
  const [gesture, setGesture] = useState<ItemGestureState>();
  const [submitted, setSubmitted] = useState<readonly SubmittedMove[]>([]);
  const cancel = useRef<() => void>(() => undefined);
  useEffect(() => () => cancel.current(), [scene.composition, pixels, busy]);

  const start = (event: PointerEvent<HTMLElement>, item: NleTimelineSceneItem, track: NleTimelineSceneTrack) => {
    const viewport = scroller.current;
    if (!viewport || busy || event.button !== 0 || track.locked) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.metaKey || event.ctrlKey) {
      onSelect(selection.includes(item.id)
        ? selection.filter(id => id !== item.id)
        : [...selection, item.id]);
      return;
    }
    const seeds = selection.includes(item.id) ? selection : [item.id];
    const ids = relatedItems(scene, seeds);
    const members = scene.tracks.flatMap((row) => row.items
      .filter((candidate) => ids.has(candidate.id))
      .map((candidate) => ({ item: candidate, track: row })));
    if (members.length === 0 || members.some((member) => member.track.locked || !member.item.affordances.move)) {
      onSelect([item.id]);
      return;
    }

    cancel.current(); onSelect(seeds);
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX, startY = event.clientY;
    const scrollLeft = viewport.scrollLeft;
    const origins = new Map(Array.from(viewport.querySelectorAll<HTMLElement>("[data-clip-id]"))
      .filter(element => ids.has(element.dataset.clipId!))
      .map(element => [element.dataset.clipId!, { element, bounds: element.getBoundingClientRect() }] as const));
    const boundaries = timelineSnapBoundaries(scene, ids);
    const movingEdges = members.flatMap(member => [member.item.startFrame, member.item.startFrame + member.item.durationFrames]);
    const minimum = -Math.min(...members.map((member) => member.item.startFrame));
    handle.setPointerCapture(pointerId);
    let active = false, animation = 0;
    let pointer = { x: startX, y: startY, alt: event.altKey };
    let proposed: ItemDropIntent | undefined;
    let preview: readonly FloatingItem[] = [];
    const pictures = new Map<string, HTMLCanvasElement | undefined>();
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
            else {
              const row = rows.find(row => {
                const rect = row.getBoundingClientRect();
                return pointer.y >= rect.top && pointer.y < rect.bottom;
              });
              targetIndex = scene.tracks.findIndex(candidate => candidate.id === row?.dataset.trackId);
            }
          }
        }
      }
      const lane = scene.tracks[targetIndex];
      const before = insertionIndex === undefined ? undefined : rows[insertionIndex]?.dataset.trackId;
      const target: ItemDropIntent["target"] | undefined = insertionIndex !== undefined
        ? { kind: "gap", ...(before === undefined ? {} : { before }) }
        : lane === undefined ? undefined : { kind: "track", track: lane.id };
      const valid = inside && target !== undefined && (target.kind === "gap"
        || lane?.kind === track.kind && lane.role === track.role && !lane.locked);
      const raw = Math.max(Math.ceil(minimum), Math.round((pointer.x - startX + viewport.scrollLeft - scrollLeft) / pixels));
      const aligned = snap && !pointer.alt && (raw !== 0 || target?.kind !== "gap")
        ? snapTimelineEdges(movingEdges.map(value => value + raw), frame, boundaries, pixels, delta => raw + delta >= minimum)
        : undefined;
      const delta = Math.max(Math.ceil(minimum), raw + Math.round(aligned?.correction ?? 0));
      preview = members.flatMap((member): FloatingItem[] => {
        const { id } = member.item;
        const origin = origins.get(id);
        if (origin === undefined) return [];
        if (!pictures.has(id)) pictures.set(id, copyFilmstrip(origin.element, origin.bounds));
        const picture = pictures.get(id);
        return [{ id, title: timelineItemLabel(member.item, member.track.role), role: member.track.role,
          left: origin.bounds.left + (aligned === undefined ? pointer.x - startX : delta * pixels - (viewport.scrollLeft - scrollLeft)),
          top: origin.bounds.top + pointer.y - startY, width: origin.bounds.width, height: origin.bounds.height,
          ...(picture === undefined ? {} : { picture }) }];
      });
      proposed = valid ? { anchor: item.id, items: seeds, deltaFrames: delta, target } : undefined;
      setGesture({ ids: [...ids], sourceTrack: track.id, floating: preview, ...(proposed === undefined ? {} : { intent: proposed }),
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
      window.removeEventListener("blur", cleanup); handle.removeEventListener("lostpointercapture", abort);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      setGesture(undefined); cancel.current = () => undefined;
    };
    const abort = (next: globalThis.PointerEvent) => { if (next.pointerId === pointerId) cleanup(); };
    const key = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); cleanup(); } };
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      move(next); const accepted = proposed, wasActive = active; cleanup();
      if (!wasActive) { onSelect([item.id]); return; }
      if (accepted === undefined || (accepted.deltaFrames === 0
        && accepted.target.kind === "track" && accepted.target.track === track.id)) return;
      const pending: SubmittedMove = { floating: preview.map(item => ({ ...item,
        left: origins.get(item.id)!.bounds.left + accepted.deltaFrames * pixels - (viewport.scrollLeft - scrollLeft) })),
        origins: new Map(members.map(member => [member.item.id, { frame: member.item.startFrame, track: member.track.id }])),
        pixels, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
      setSubmitted(previous => [...previous, pending]);
      const done = () => setSubmitted(previous => previous.filter(move => move !== pending));
      void onMove(accepted).then(done, done);
    };
    cancel.current = cleanup;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", abort); window.addEventListener("keydown", key);
    window.addEventListener("blur", cleanup); handle.addEventListener("lostpointercapture", abort);
    animation = requestAnimationFrame(scroll);
  };

  const floating = new Map<string, FloatingItem>();
  for (const move of submitted) {
    if (move.pixels !== pixels || scroller.current === null) continue;
    for (const item of move.floating) {
      const origin = move.origins.get(item.id)!;
      const track = scene.tracks.find(row => row.id === origin.track);
      if (!track?.items.some(candidate => candidate.id === item.id && candidate.startFrame === origin.frame)) continue;
      floating.set(item.id, { ...item, left: item.left + move.scrollLeft - scroller.current.scrollLeft,
        top: item.top + move.scrollTop - scroller.current.scrollTop });
    }
  }
  for (const item of gesture?.floating ?? []) floating.set(item.id, item);
  return { gesture, floating: [...floating.values()], moving: new Set([...floating.keys(), ...gesture?.ids ?? []]),
    start, cancel: () => cancel.current() };
}
