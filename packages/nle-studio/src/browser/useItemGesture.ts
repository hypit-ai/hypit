import { nleGroupMoveItems } from "@hypit/nle";
import type { NleTimelineScene, NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/surface";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { NleStudioTimelineDrop } from "../protocol.js";
import { labelWidth, locateTimelineDrop, rulerHeight, timelineOrigin, snapTimelineEdges, timelineFrameAt, timelineItemLabel, timelineSnapBoundaries, timelineSnapPixels,
  timelineSnapReleasePixels, type TimelineSnap } from "./timelineGeometry.js";

export type ItemDropIntent = Pick<NleStudioTimelineDrop, "anchor" | "items" | "deltaFrames" | "alignment" | "target">;
export type ItemDropContinuation = { readonly startFrame: number; readonly followAnchorTrack: boolean };

type FloatingItem = {
  readonly id: string;
  readonly title: string;
  readonly role: NleTimelineSceneTrack["role"];
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly startFrame: number;
  readonly pending?: boolean;
  readonly picture?: HTMLCanvasElement;
};

type SubmittedMove = {
  readonly floating: readonly FloatingItem[];
  readonly pixels: number;
  readonly scrollTop: number;
};

export type ItemGestureState = {
  readonly ids: readonly string[];
  readonly floating: readonly FloatingItem[];
  readonly snapFrame?: number;
  readonly intent?: ItemDropIntent;
};

function copyFilmstrip(element: HTMLElement, clip: DOMRect): HTMLCanvasElement | undefined {
  const source = element.querySelector<HTMLCanvasElement>(element.hasAttribute("data-pending-clip-id") ? "canvas" : "canvas.nle-clip-filmstrip");
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

type NeighborSnap = { alignment: NonNullable<ItemDropIntent["alignment"]>; frame: number; delta: number };

function snapNeighbor(moving: readonly NleTimelineSceneItem[], stationary: readonly NleTimelineSceneItem[],
  raw: number, minimum: number, pixels: number, held: NeighborSnap | undefined) {
  if (held !== undefined && Math.abs(held.delta - raw) * pixels <= timelineSnapReleasePixels) return held;
  let nearest: NeighborSnap | undefined;
  for (const item of moving) for (const neighbor of stationary) for (const edge of ["start", "end"] as const) {
    const origin = edge === "start" ? item.startFrame : item.startFrame + item.durationFrames;
    const frame = edge === "start" ? neighbor.startFrame + neighbor.durationFrames : neighbor.startFrame;
    const delta = frame - origin;
    if (delta < minimum || Math.abs(delta - raw) * pixels > timelineSnapPixels) continue;
    if (!nearest || Math.abs(delta - raw) < Math.abs(nearest.delta - raw)) {
      nearest = { alignment: { item: item.id, edge, neighbor: neighbor.id }, frame, delta };
    }
  }
  return nearest;
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
  readonly onMove: (intent: ItemDropIntent, continuation?: ItemDropContinuation) => Promise<void>;
}) {
  const [gesture, setGesture] = useState<ItemGestureState>();
  const [submitted, setSubmitted] = useState<readonly SubmittedMove[]>([]);
  const cancel = useRef<() => void>(() => undefined);
  const scale = useRef(pixels);
  useLayoutEffect(() => { scale.current = pixels; }, [pixels]);
  useEffect(() => () => cancel.current(), [scene.composition, busy]);

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
    const fromPending = handle.hasAttribute("data-pending-clip-id");
    const capture = fromPending ? viewport : handle;
    const pointerId = event.pointerId;
    const startX = event.clientX, startY = event.clientY;
    const pointerStart = timelineFrameAt(viewport, viewport.getBoundingClientRect(), startX, pixels);
    const origins = new Map(Array.from(viewport.querySelectorAll<HTMLElement>("[data-clip-id]"))
      .filter(element => ids.has(element.dataset.clipId!))
      .map(element => [element.dataset.clipId!, { element, bounds: element.getBoundingClientRect() }] as const));
    for (const element of Array.from(viewport.parentElement?.querySelectorAll<HTMLElement>("[data-pending-clip-id]") ?? [])) {
      const id = element.dataset.pendingClipId!;
      if (ids.has(id)) origins.set(id, { element, bounds: element.getBoundingClientRect() });
    }
    const startOf = (candidate: NleTimelineSceneItem) => pendingItems.get(candidate.id)?.startFrame ?? candidate.startFrame;
    const boundaries = timelineSnapBoundaries(scene, ids);
    const movingEdges = members.flatMap(({ item }) => [startOf(item), startOf(item) + item.durationFrames]);
    const anchorLaneItems = track.items.filter(candidate => ids.has(candidate.id));
    const minimum = -Math.min(...members.map(({ item }) => startOf(item)));
    capture.setPointerCapture(pointerId);
    let active = false, animation = 0;
    let pointer = { x: startX, y: startY, alt: event.altKey };
    let proposed: ItemDropIntent | undefined;
    let followAnchorTrack = false;
    let displacement = 0;
    let heldNeighbor: NeighborSnap | undefined, heldSnap: TimelineSnap | undefined;
    let snapDestination: string | undefined;
    let preview: readonly FloatingItem[] = [];
    const pictures = new Map<string, HTMLCanvasElement | undefined>();
    let edge: "top" | "bottom" | undefined;

    const locate = () => {
      if (!active) return;
      const movedVertically = Math.abs(pointer.y - startY) > 8;
      followAnchorTrack = fromPending && !movedVertically;
      const location = locateTimelineDrop(viewport, pointer, { edge });
      edge = location.edge;
      const lane = movedVertically ? scene.tracks.find(candidate => candidate.id === location.track) : track;
      const before = location.gap?.before;
      const target: ItemDropIntent["target"] | undefined = movedVertically && location.gap !== undefined
        ? { kind: "gap", ...(before === undefined ? {} : { before }) }
        : lane === undefined ? undefined : { kind: "track", track: lane.id };
      const valid = location.inside && target !== undefined && (target.kind === "gap"
        || lane?.kind === track.kind && lane.role === track.role && !lane.locked);
      const frameWidth = scale.current;
      const pointerDelta = timelineFrameAt(viewport, location.bounds, pointer.x, frameWidth) - pointerStart;
      const raw = Math.max(Math.ceil(minimum), Math.round(pointerDelta));
      const destination = snap && !pointer.alt && valid && (raw !== 0 || target.kind !== "gap")
        ? (target.kind === "track" ? `track:${target.track}` : `gap:${target.before ?? ""}`) : undefined;
      if (destination !== snapDestination) {
        heldNeighbor = undefined;
        heldSnap = undefined;
        snapDestination = destination;
      }
      const snapDelta = (value: TimelineSnap) => value.frame - movingEdges[value.movingEdge]!;
      if (destination !== undefined) {
        const generalSnap = () => snapTimelineEdges(movingEdges.map(value => value + pointerDelta), frame, boundaries, frameWidth, {
          held: heldSnap,
          allows: value => {
            const offset = snapDelta(value);
            const frames = Math.round(offset);
            return frames >= Math.ceil(minimum) && Math.abs(offset - frames) < 1e-6;
          },
        });
        const general = heldSnap === undefined ? undefined : generalSnap();
        const retained = general !== undefined && general.frame === heldSnap?.frame && general.movingEdge === heldSnap.movingEdge;
        heldNeighbor = !fromPending && !retained && target?.kind === "track" && lane
          ? snapNeighbor(anchorLaneItems, lane.items.filter(candidate => !ids.has(candidate.id)), pointerDelta, minimum, frameWidth, heldNeighbor)
          : undefined;
        heldSnap = heldNeighbor === undefined ? (general ?? generalSnap()) : undefined;
      }
      displacement = heldNeighbor?.delta ?? (heldSnap === undefined ? raw : Math.round(snapDelta(heldSnap)));
      const snapFrame = heldNeighbor?.frame ?? heldSnap?.frame;
      preview = members.flatMap((member): FloatingItem[] => {
        const { id } = member.item;
        const origin = origins.get(id);
        if (origin === undefined) return [];
        if (!pictures.has(id)) pictures.set(id, copyFilmstrip(origin.element, origin.bounds));
        const picture = pictures.get(id);
        return [{ id, title: timelineItemLabel(member.item, member.track.role), role: member.track.role,
          left: location.bounds.left + timelineOrigin
            + (startOf(member.item) + (snapFrame === undefined ? pointerDelta : displacement)) * frameWidth - viewport.scrollLeft,
          top: origin.bounds.top + (movedVertically ? pointer.y - startY : 0),
          width: Math.max(8, member.item.durationFrames * frameWidth), height: origin.bounds.height,
          startFrame: startOf(member.item) + displacement,
          ...(picture === undefined ? {} : { picture }) }];
      });
      proposed = valid ? { anchor: item.id, items: seeds, deltaFrames: Math.round(displacement), target,
        ...(heldNeighbor === undefined ? {} : { alignment: heldNeighbor.alignment }) } : undefined;
      setGesture({ ids: [...ids], floating: preview, ...(proposed === undefined ? {} : { intent: proposed }),
        ...(snapFrame === undefined ? {} : { snapFrame }) });
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
      window.removeEventListener("pointercancel", abort); window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cleanup); capture.removeEventListener("lostpointercapture", abort);
      if (capture.hasPointerCapture(pointerId)) capture.releasePointerCapture(pointerId);
      setGesture(undefined); cancel.current = () => undefined;
    };
    const abort = (next: globalThis.PointerEvent) => { if (next.pointerId === pointerId) cleanup(); };
    const key = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); cleanup(); } };
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      move(next); const accepted = proposed, wasActive = active; cleanup();
      if (!wasActive) { onSelect([item.id]); return; }
      if (accepted === undefined || (displacement === 0
        && accepted.target.kind === "track" && accepted.target.track === track.id)) return;
      const pending: SubmittedMove = { floating: preview, pixels: scale.current, scrollTop: viewport.scrollTop };
      flushSync(() => setSubmitted(previous => [...previous, pending]));
      const done = () => setSubmitted(previous => previous.filter(move => move !== pending));
      const continuation = fromPending ? { startFrame: startOf(item) + displacement, followAnchorTrack } : undefined;
      void onMove(accepted, continuation).then(done, done);
    };
    cancel.current = cleanup;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", abort); window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cleanup); capture.addEventListener("lostpointercapture", abort);
    animation = requestAnimationFrame(scroll);
  };

  const pendingItems = new Map<string, FloatingItem>();
  const viewport = scroller.current;
  if (submitted.length > 0 && viewport !== null) {
    const bounds = viewport.getBoundingClientRect();
    const authoredItems = new Set(scene.tracks.flatMap(track => track.items.map(item => item.id)));
    for (const move of submitted) for (const item of move.floating) {
      if (!authoredItems.has(item.id)) continue;
      pendingItems.set(item.id, { ...item, pending: true,
        left: bounds.left + timelineOrigin + item.startFrame * pixels - viewport.scrollLeft,
        top: item.top + move.scrollTop - viewport.scrollTop, width: Math.max(8, item.width * pixels / move.pixels) });
    }
  }
  const floating = new Map(pendingItems);
  for (const item of gesture?.floating ?? []) floating.set(item.id, item);
  return { gesture, floating: [...floating.values()], pendingItems,
    moving: new Set([...floating.keys(), ...gesture?.ids ?? []]), start, cancel: () => cancel.current() };
}
