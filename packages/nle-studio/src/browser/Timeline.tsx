import type { NleTimelineScene, NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/surface";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import {
  ArrowLeft, AudioLines, CircleMinus, CirclePlus, Copy, Eye, EyeOff, Group, Layers, Lock, LogIn, Magnet,
  PanelLeftClose, PanelRightClose, Redo2, Scan, Scissors, Snowflake, Trash2, Undo2, Unlink2, Unlock,
  Ungroup, Volume2, VolumeX, X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { NleStudioCompositionActionsProjection, NleStudioMatteSourcesProjection, NleStudioOpenProjection, NleStudioProcessAddress, NleStudioProcessEdit,
  NleStudioTimelineCutsProjection } from "../protocol.js";
import { IconButton } from "./common.js";
import { timecode } from "./timecode.js";
import { studioIcons, timelineBadgeIcons, unavailableTrackIcons } from "./studio-icons.js";
import { labelWidth, rowHeight, rowSize, rulerHeight, snapTimelineEdges, timelineItemLabel, timelineEndPadding,
  timelineOrigin, timelineSnapBoundaries, timelineStartPadding, type TimelineSnap } from "./timelineGeometry.js";
import { ToolSelector, type TimelineTool } from "./ToolSelector.js";
import { useTimelineSeek } from "./useTimelineSeek.js";
import { useTrackReorder } from "./useTrackReorder.js";
import { useItemGesture, type ItemDropContinuation, type ItemDropIntent } from "./useItemGesture.js";
import { TimelineSourcePreview, useTimelineMedia, type TimelinePreviewTrim } from "./TimelineMedia.js";
import { TimelineRuler } from "./TimelineRuler.js";

import { readCompositionActions, readDropDestination, readMatteSources, readTimelineCuts } from "./api.js";
import { useTimelineViewport } from "./useTimelineViewport.js";
import type { MediaDrop, MediaPlacementDraft } from "./mediaDrag.js";
import type { NleStudioDropDestination } from "../protocol.js";
import { CompositionTabs } from "./CompositionTabs.js";
import { TrackMenu } from "./TrackMenu.js";
import { ClipMenu, type ClipMenuAction } from "./ClipMenu.js";
import { directionalSelection, editableSelection, resolveGroupSelection, selectionAtFrame } from "./selection.js";
import { fadeMotion, softEase } from "./motion.js";

import { useMarqueeSelection } from "./useMarqueeSelection.js";

type TrimEdge = "start" | "end";

const matteSourceMessages = {
  "no-source": "时间线里没有其他画面片段",
  "no-alternative": "已绑定遮罩，暂无其他来源",
  "outside-range": "遮罩源须覆盖片段的完整时段",
  locked: "解锁相关轨道后才能选源",
  ineligible: "当前片段和遮罩源无法配对",
} satisfies Record<NonNullable<NleStudioMatteSourcesProjection["unavailable"]>, string>;
type PendingTrim = TimelinePreviewTrim & { readonly item: string };
type TransitionWindow = { readonly id: string; readonly start: number; readonly end: number; readonly middle: number };
type ClipTransitions = { readonly incoming?: TransitionWindow; readonly outgoing?: TransitionWindow };

function canBindMatte(item: NleTimelineSceneItem | undefined): boolean {
  return item?.kind === "present" && item.enabled && item.signals.picture && item.affordances.move;
}

function itemWindow(item: NleTimelineSceneItem, pending: readonly PendingTrim[]) {
  let start = item.startFrame, end = start + item.durationFrames;
  for (const trim of pending) if (trim.item === item.id) {
    if (trim.edge === "start" && trim.atFrame <= end - 1) start = trim.atFrame;
    if (trim.edge === "end" && trim.atFrame >= start + 1) end = trim.atFrame;
  }
  return { start, duration: end - start };
}

function FloatingFilmstrip({ picture }: { readonly picture: HTMLCanvasElement }) {
  const host = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    host.current?.append(picture);
    return () => picture.remove();
  }, [picture]);
  return <span ref={host} aria-hidden="true"/>;
}

function ProcessTimingHandle({ timing, duration, pixels, disabled, onSelect, onResize }: {
  readonly timing: NleTimelineSceneItem["anchoredProcesses"][number];
  readonly duration: number;
  readonly pixels: number;
  readonly disabled: boolean;
  readonly onSelect: () => void;
  readonly onResize: (frames: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<number>();
  const [pending, setPending] = useState<{ frames: number }>();
  const drag = useRef<{ pointer: number; x: number; frames: number; pixels: number;
    direction: number; submit: typeof onResize }>(undefined);
  const visible = Math.min(duration, pending?.frames ?? timing.durationFrames);
  const direction = timing.edge === "start" ? 1 : -1;
  const label = timing.edge === "start" ? "片头效果" : "片尾效果";
  const clamp = (frames: number) => Math.max(1, Math.min(Math.floor(duration), Math.round(frames)));
  const stop = () => { drag.current = undefined; setDraft(undefined); };
  const commit = (frames: number, submit = onResize) => {
    const submitted = { frames };
    setPending(submitted);
    void submit(frames).finally(() => setPending(current => current === submitted ? undefined : current));
  };
  return <div className={`nle-process-range ${timing.edge}`}
    style={{ width: `${100 * Math.min(duration, draft ?? visible) / duration}%` }}>
    <button type="button" className="nle-process-region" aria-label={`选择${timing.label}`} title={`${timing.label} · ${label}`}
      onPointerDown={event => event.stopPropagation()} onClick={onSelect}/>
    <button type="button" className="nle-process-handle" disabled={disabled || duration < 1}
      aria-label={`调整${label}时长`} title={`调整${label}时长`}
      onPointerDown={event => {
        event.stopPropagation();
        if (event.button !== 0 || drag.current !== undefined) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, x: event.clientX, frames: visible, pixels, direction, submit: onResize };
        onSelect();
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (current?.pointer !== event.pointerId) return;
        setDraft(clamp(current.frames + current.direction * (event.clientX - current.x) / current.pixels));
      }}
      onPointerUp={event => {
        const current = drag.current;
        if (current?.pointer !== event.pointerId) return;
        const distance = current.direction * (event.clientX - current.x) / current.pixels;
        const next = clamp(current.frames + distance);
        stop();
        if (Math.abs(distance) >= 0.5 && next !== Math.round(current.frames)) commit(next, current.submit);
      }}
      onLostPointerCapture={stop} onPointerCancel={stop}
      onKeyDown={event => {
        if (event.key === "Escape" && drag.current !== undefined) {
          event.preventDefault();
          const pointer = drag.current.pointer;
          stop();
          if (event.currentTarget.hasPointerCapture(pointer)) event.currentTarget.releasePointerCapture(pointer);
          return;
        }
        const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const next = clamp(visible + delta * direction);
        if (next !== Math.round(visible)) commit(next);
      }}/>
  </div>;
}

export function Timeline({ session, frame, playing, reveal, selection, busy, gestureBlocked, onSeek, onSelect, onMove, onItemReorder, onTrim, onTrimGesture, onSplit, onRemove,
  onTrackSignal, onTrackLocked, onTrackMove, onCloseGap, onRippleRemove, onComposition, onCompositionMove,
  onCompositionCreate, onCompositionEdit, onCompositionInsert, onCompositionCopy, onCompositionRoot, onCompositionRemove, onEnterComposition, onReturnComposition,
  onCompound, onCompoundUnique, onCompoundExplode, onEditGroup,
  onBindMatte, onRemoveMatte, onDetachAudio, canUndo, canRedo, onUndo, onRedo, drop, mediaPlacement, fileDrop, isSampledMedia, onFreeze, selectedProcess, onSelectProcess, onProcessTiming, selectedTransition, onSelectTransition, ref }: {
  readonly ref?: Ref<HTMLElement>;
  readonly selectedTransition: string | undefined;
  readonly onSelectTransition: (id: string) => void;
  readonly session: NleStudioOpenProjection;
  readonly drop: MediaDrop | undefined;
  readonly mediaPlacement: MediaPlacementDraft | undefined;
  readonly fileDrop: { readonly frame: number; readonly pending: boolean } | undefined;
  readonly isSampledMedia: (item: string) => boolean;
  readonly onFreeze: (item: string, atFrame: number) => void;
  readonly onCompositionCreate: (name: string, canvas: { width: number; height: number }) => void;
  readonly onCompositionEdit: (id: string, fields: { name?: string; canvas?: { width: number; height: number } }) => void;
  readonly onCompositionInsert: (id: string) => void;
  readonly onCompositionCopy: (id: string) => void;
  readonly onCompositionRoot: (id: string) => void;
  readonly onCompositionRemove: (id: string) => void;
  readonly onRippleRemove: (items: readonly NleTimelineSceneItem[]) => void;
  readonly onCloseGap: (track: string, atFrames: readonly number[]) => void;
  readonly onCompoundUnique: (item: string) => void;
  readonly onCompoundExplode: (item: string) => void;
  readonly frame: number;
  readonly playing: boolean;
  readonly reveal: { readonly frame: number } | undefined;
  readonly selection: readonly string[];
  readonly busy: boolean;
  readonly gestureBlocked: boolean;
  readonly onSeek: (frame: number) => void;
  readonly onSelect: (ids: readonly string[]) => void;
  readonly onMove: (intent: ItemDropIntent, continuation?: ItemDropContinuation) => Promise<void>;
  readonly onItemReorder: (item: string, direction: "up" | "down") => void;
  readonly onTrim: (items: readonly string[], edge: "start" | "end", atFrame: number) => void;
  readonly onTrimGesture: (item: string, edge: TrimEdge, atFrame: number) => Promise<void>;
  readonly onSplit: (items: readonly string[], atFrame: number) => void;
  readonly onRemove: () => void;
  readonly onTrackSignal: (track: string, signal: "picture" | "audio", enabled: boolean) => void;
  readonly onTrackLocked: (track: string, locked: boolean) => void;
  readonly onTrackMove: (track: string, before?: string) => Promise<void>;
  readonly onComposition: (composition: string) => void;
  readonly onCompositionMove: (composition: string, before?: string) => Promise<void>;
  readonly onEnterComposition: (item: string) => void;
  readonly onReturnComposition: () => void;
  readonly onCompound: (items: readonly string[]) => void;
  readonly onEditGroup: (items: readonly string[]) => void;
  readonly onBindMatte: (content: string, source: string) => void;
  readonly onRemoveMatte: (matte: string) => void;
  readonly onDetachAudio: (item: string) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly selectedProcess: NleStudioProcessAddress | undefined;
  readonly onSelectProcess: (address: NleStudioProcessAddress) => void;
  readonly onProcessTiming: (edit: NleStudioProcessEdit) => Promise<void>;
}) {
  const scene = session.timeline.scene, fps = scene.editRate.numerator / scene.editRate.denominator;
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const scroller = useRef<HTMLDivElement>(null);
  const lastClipEnd = useMemo(() => scene.tracks.reduce((latest, track) => track.items.reduce(
    (end, item) => Math.max(end, item.startFrame + item.durationFrames), latest), 0), [scene.tracks]);
  const { viewport, zoom, minZoom, maxZoom, zoomPosition, fit, changeZoomPosition, stepZoom, contentWidth: width } = useTimelineViewport(
    scroller, labelWidth, JSON.stringify([session.project.name, session.project.document, scene.composition]),
    lastClipEnd, scene.maximumFrame,
    fps, { frame, playing, reveal });
  const pixels = zoom / fps;
  const playheadPosition = timelineStartPadding + frame * pixels;
  const playheadVisible = playheadPosition >= viewport.left && playheadPosition < viewport.left + viewport.width;
  const timeViewport = { ...viewport, left: viewport.left - timelineStartPadding };
  const endFrame = Math.floor((width - timelineEndPadding) / pixels);
  const [snap, setSnap] = useState(true), [tool, setTool] = useState<TimelineTool>("select");
  const [draft, setDraft] = useState<TimelinePreviewTrim & {
    readonly id: string; readonly start: number; readonly duration: number; readonly snapFrame?: number;
  }>();
  const [pendingTrims, setPendingTrims] = useState<readonly PendingTrim[]>([]);
  const [cutCursor, setCutCursor] = useState<{ readonly track: string; readonly frame: number }>();
  const cancelTrim = useRef<() => void>(() => undefined);
  const snapBoundaries = useMemo(() => timelineSnapBoundaries(scene), [scene]);
  const seek = useTimelineSeek(scroller, pixels, endFrame, snap ? snapBoundaries : undefined, onSeek);
  const { box: marqueeBox, start: startMarquee, cancel: cancelMarquee } = useMarqueeSelection({
    selection, onSelect, disabled: busy,
    targetAttribute: "data-clip-id", exclude: ".nle-clip,.nle-track-label,.nle-ruler,button",
    insetLeft: labelWidth, insetTop: rulerHeight,
    filterSelection: ids => editableSelection(scene, ids),
    onBlankClick: origin => {
      const at = Math.round((origin.x - timelineOrigin) / pixels);
      onSeek(Math.max(0, Math.min(endFrame, at)));
    },
  });
  useEffect(() => cancelMarquee, [cancelMarquee, scene, pixels, tool]);
  const knownTracks = useRef(new Set(scene.tracks.map(track => track.id)));
  const [emptyDestinations, setEmptyDestinations] = useState<ReadonlySet<string>>(() => new Set());
  useLayoutEffect(() => {
    const empty = new Set(scene.tracks.filter(track => track.items.length === 0).map(track => track.id));
    const added = [...empty].filter(id => !knownTracks.current.has(id));
    knownTracks.current = new Set(scene.tracks.map(track => track.id));
    setEmptyDestinations(previous => {
      const next = new Set([...previous].filter(id => empty.has(id)).concat(added));
      return next.size === previous.size && [...next].every(id => previous.has(id)) ? previous : next;
    });
  }, [scene.tracks]);
  const displayedTracks = useMemo(() => scene.tracks.filter(track => track.items.length > 0 || emptyDestinations.has(track.id)),
    [scene.tracks, emptyDestinations]);
  const reorder = useTrackReorder(scroller, displayedTracks, busy || gestureBlocked, onTrackMove);
  const visibleTracks = reorder.ordered;
  const mediaTarget = mediaPlacement?.target;
  const mediaGap = mediaTarget !== undefined && "gap" in mediaTarget ? mediaTarget : undefined;
  const shiftedByMedia = useMemo(() => new Set(mediaPlacement?.shifted), [mediaPlacement?.shifted]);
  const shift = mediaPlacement?.position.durationFrames ?? 0;
  const trackLayout = useMemo(() => JSON.stringify(visibleTracks.map(track => [track.id, rowSize(track)])), [visibleTracks]);
  const itemGesture = useItemGesture({ scene, scroller, pixels, frame, snap, busy: gestureBlocked, selection, onSelect, onMove });
  const [resolvedDrop, setResolvedDrop] = useState<{ key: string; value: NleStudioDropDestination }>();
  const itemDrag = itemGesture.gesture;
  const intent = itemDrag?.intent;
  const dropIntent = intent === undefined ? undefined : JSON.stringify({
    ...intent, kind: "timeline.drop", composition: scene.composition,
    expectedProjectRevision: session.status.projectRevision,
  });
  useEffect(() => {
    if (dropIntent === undefined) return;
    let active = true;
    const animation = requestAnimationFrame(() => void readDropDestination(JSON.parse(dropIntent))
      .then(value => { if (active) setResolvedDrop({ key: dropIntent, value }); }).catch(() => {
        if (active) setResolvedDrop(undefined);
      }));
    return () => { active = false; cancelAnimationFrame(animation); };
  }, [dropIntent]);
  const resolved = resolvedDrop?.key === dropIntent ? resolvedDrop?.value : undefined;
  const itemTarget = resolved ?? (intent?.target.kind === "track" ? { track: intent.target.track }
    : intent?.target.kind === "gap" ? { gap: true, before: intent.target.before } : undefined);
  const highlightedTrack = (mediaTarget !== undefined && "track" in mediaTarget ? mediaTarget.track : undefined)
    ?? drop?.track ?? (itemTarget !== undefined && "track" in itemTarget ? itemTarget.track : undefined);
  const rows = Array.from(scroller.current?.querySelectorAll<HTMLElement>(".nle-track[data-track-id]") ?? [])
    .filter(row => visibleTracks.some(track => track.id === row.dataset.trackId));
  const resolvedGap = mediaGap ?? (itemTarget && "gap" in itemTarget ? itemTarget : undefined);
  const after = rows.at(-1);
  const trackPadding = Math.max(rowHeight, (viewport.height - rulerHeight - visibleTracks.reduce((height, track) => height + rowSize(track), 0)) / 2);
  const insertion = reorder.position?.top ?? (resolvedGap === undefined ? undefined
    : resolvedGap.before === undefined ? (after === undefined ? rulerHeight + trackPadding : after.offsetTop + after.offsetHeight)
      : rows.find(row => row.dataset.trackId === resolvedGap.before)?.offsetTop);
  const guide = itemDrag?.snapFrame ?? draft?.snapFrame ?? mediaPlacement?.snapFrame ?? drop?.snapFrame ?? drop?.transitionCut?.frame;
  const playheadSnap = guide === frame || seek.snapped ? " adsorbed" : "";
  const previewViewport = useTimelineMedia(session.timeline, visibleTracks, pixels, timeViewport, trackPadding);
  const previewTrims = useMemo(() => {
    const edits = new Map<string, TimelinePreviewTrim[]>();
    for (const trim of pendingTrims) {
      const list = edits.get(trim.item) ?? [];
      list.push(trim);
      edits.set(trim.item, list);
    }
    if (draft !== undefined) edits.set(draft.id, [...(edits.get(draft.id) ?? []), draft]);
    return edits;
  }, [pendingTrims, draft]);
  const selected = scene.tracks.flatMap(track => track.items).find(item => selection.includes(item.id));
  const trimRanges = session.timeline.trimRanges;
  const cutIntent = playing || selection.length === 0 ? undefined : JSON.stringify({
    composition: scene.composition, expectedProjectRevision: session.status.projectRevision,
    items: selection, atFrame: frame,
  });
  const [resolvedCuts, setResolvedCuts] = useState<{ key: string; scene: typeof scene; value: NleStudioTimelineCutsProjection }>();
  useEffect(() => {
    if (cutIntent === undefined) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void readTimelineCuts(JSON.parse(cutIntent)).then(value => {
        if (active) setResolvedCuts({ key: cutIntent, scene, value });
      }).catch(() => {
        if (active) setResolvedCuts(undefined);
      });
    }, 40);
    return () => { active = false; window.clearTimeout(timer); };
  }, [cutIntent, scene]);
  const playbackTargets = playing ? selectionAtFrame(scene, selection, frame) : [];
  const cuts: NleStudioTimelineCutsProjection | undefined = playbackTargets.length > 0 ? {
    items: playbackTargets.map(item => item.id),
    split: playbackTargets.every(item => item.affordances.split),
    trimStart: playbackTargets.every(item => item.affordances.trimStart),
    trimEnd: playbackTargets.every(item => item.affordances.trimEnd),
  } : resolvedCuts?.key === cutIntent && resolvedCuts?.scene === scene ? resolvedCuts.value : undefined;
  const splitAtPlayhead = () => { if (cuts?.split) onSplit(cuts.items, frame); };
  const trimAtPlayhead = (edge: TrimEdge) => {
    if (cuts?.[edge === "start" ? "trimStart" : "trimEnd"]) onTrim(cuts.items, edge, frame);
  };
  const sceneItems = useMemo(() => new Map(scene.tracks.flatMap(track => track.items.map(item => [item.id, item] as const))), [scene.tracks]);
  const compositionIntent = selection.length === 0 ? undefined : JSON.stringify({
    composition: scene.composition, expectedProjectRevision: session.status.projectRevision, items: selection,
  });
  const [resolvedCompositionActions, setResolvedCompositionActions] = useState<{
    key: string; scene: typeof scene; value: NleStudioCompositionActionsProjection;
  }>();
  useEffect(() => {
    if (compositionIntent === undefined) return;
    let active = true;
    void readCompositionActions(JSON.parse(compositionIntent)).then(value => {
      if (active) setResolvedCompositionActions({ key: compositionIntent, scene, value });
    }).catch(() => {
      if (active) setResolvedCompositionActions(undefined);
    });
    return () => { active = false; };
  }, [compositionIntent, scene]);
  const compositionActions = resolvedCompositionActions?.key === compositionIntent && resolvedCompositionActions?.scene === scene
    ? resolvedCompositionActions.value : undefined;
  const selectedItemId = selection.length === 1 ? selection[0] : undefined;
  const matteTrackLocks = JSON.stringify(scene.tracks.filter(track => track.locked).map(track => track.id));
  const [matteTarget, setMatteTarget] = useState<string>();
  const [matteSourcesProjection, setMatteSourcesProjection] = useState<NleStudioMatteSourcesProjection>();
  const [matteReadError, setMatteReadError] = useState<string>();
  const pickMatte = (item: string) => {
    setMatteSourcesProjection(undefined);
    setMatteReadError(undefined);
    setMatteTarget(item);
  };
  const matteCandidates = useMemo(() => new Set(matteSourcesProjection?.sources), [matteSourcesProjection]);
  const timelineObject = (id: string) => ({
    "data-timeline-object": id,
    "data-matte-state": matteTarget === undefined ? undefined
      : id === matteTarget ? "content" : matteCandidates.has(id) ? "candidate" : "ineligible",
  });
  const mattePrompt = matteReadError ?? (matteSourcesProjection?.unavailable === undefined
    ? `为「${matteTarget === undefined ? "" : sceneItems.get(matteTarget)?.display.title ?? matteTarget}」选择遮罩源`
    : matteSourceMessages[matteSourcesProjection.unavailable]);
  useEffect(() => { setMatteTarget(undefined); }, [selectedItemId, session.status.projectRevision, matteTrackLocks]);
  useEffect(() => {
    if (matteTarget === undefined) return;
    let active = true;
    void readMatteSources(matteTarget).then(projection => {
      if (active) setMatteSourcesProjection(projection);
    }).catch((error: unknown) => {
      if (active) setMatteReadError(error instanceof Error ? error.message : String(error));
    });
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault(); setMatteTarget(undefined);
    };
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (event.button !== 0 || !(target instanceof Element) || scroller.current?.contains(target)
        || target.closest(".nle-matte-prompt")) return;
      setMatteTarget(undefined);
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", outside, true);
    return () => {
      active = false;
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", outside, true);
    };
  }, [matteTarget]);
  const chooseMatte = (item?: string) => {
    if (matteTarget === undefined) return;
    if (item !== undefined && matteCandidates.has(item)) {
      if (busy) return;
      onBindMatte(matteTarget, item);
    }
    setMatteTarget(undefined);
  };
  const { matteByContent, matteSources, focusedMatteItems } = useMemo(() => {
    const selectedItems = new Set(selection);
    const matteByContent = new Map<string, typeof scene.mattes[number]>();
    const matteSources = new Set<string>(), focusedMatteItems = new Set<string>();
    for (const relation of scene.mattes) {
      const { content, matte } = relation;
      matteByContent.set(content, relation);
      matteSources.add(matte);
      if (selectedItems.has(content) || selectedItems.has(matte)) {
        focusedMatteItems.add(content);
        focusedMatteItems.add(matte);
      }
    }
    return { matteByContent, matteSources, focusedMatteItems };
  }, [scene.mattes, selection]);
  const clipActions = (ids: readonly string[], track: NleTimelineSceneTrack): ClipMenuAction[] => {
    const actions: ClipMenuAction[] = [];
    const single = ids.length === 1 ? sceneItems.get(ids[0]!) : undefined;
    if (single?.kind === "present" && single.signals.picture) {
      if (single.signals.audio) actions.push({ label: "分离音频", Icon: AudioLines, run: () => onDetachAudio(single.id) });
      if (single.source === "media" && single.enabled && isSampledMedia(single.id)) {
        const outside = frame < single.startFrame || frame >= single.startFrame + single.durationFrames;
        const freeze = cuts?.freeze?.item === single.id ? cuts.freeze : undefined;
        const hint = outside ? "将播放头移到片段内" : freeze?.available === false ? freeze.diagnostic
          : freeze === undefined && !playing ? "正在检查能否插入定格" : undefined;
        actions.push({ label: "定格", Icon: Snowflake, disabled: hint !== undefined, hint,
          run: () => onFreeze(single.id, frame) });
      }
    }
    const group = resolveGroupSelection(scene, ids);
    if (group !== undefined) actions.push({ ...group, Icon: Group, run: () => onEditGroup(ids) });
    if (single !== undefined && canBindMatte(single)) {
      const matte = matteByContent.get(single.id);
      const sourceLocked = matte !== undefined && sceneItems.get(matte.matte)?.affordances.move !== true;
      const hint = sourceLocked ? "请先解锁遮罩源所在轨道" : undefined;
      actions.push({ label: matte === undefined ? "设置遮罩" : "更换遮罩源",
        Icon: timelineBadgeIcons.matteContent.Icon, disabled: sourceLocked, hint, run: () => pickMatte(single.id) });
      if (matte !== undefined) {
        actions.push({ label: "删除遮罩", Icon: Unlink2, disabled: sourceLocked, hint,
          run: () => onRemoveMatte(matte.id) });
      }
    }
    const placement = ids.length === selection.length && ids.every(id => selection.includes(id)) ? compositionActions : undefined;
    const action = (label: string, Icon: ClipMenuAction["Icon"], run: () => void,
      availability: NleStudioCompositionActionsProjection["compound"] | undefined): ClipMenuAction => ({
      label, Icon, run, disabled: availability?.available !== true,
      hint: availability === undefined ? "正在检查片段关系" : availability.available ? undefined : availability.diagnostic,
    });
    if (ids.some(id => sceneItems.get(id)?.kind === "present")) {
      actions.push(action("创建复合片段", Layers, () => onCompound(ids), placement?.compound));
    }
    if (single?.nestedComposition !== undefined) {
      const nested = placement?.nested?.item === single.id ? placement.nested : undefined;
      actions.push(
        { label: "进入内部时间线", Icon: LogIn, run: () => onEnterComposition(single.id) },
        action("使内部时间线独立", Copy, () => onCompoundUnique(single.id), nested?.makeUnique),
        action("拆解复合片段", Ungroup, () => onCompoundExplode(single.id), nested?.explode),
      );
    }
    return actions;
  };
  const { trackTransitions, clipTransitions } = useMemo(() => {
    const trackTransitions = new Map<string, TransitionWindow[]>();
    const clipTransitions = new Map<string, ClipTransitions>();
    for (const { id, outgoing, incoming } of scene.transitions) {
      const left = sceneItems.get(outgoing), right = sceneItems.get(incoming);
      if (left === undefined || right === undefined) continue;
      const start = right.startFrame + (shiftedByMedia.has(right.id) ? shift : 0);
      const end = left.startFrame + left.durationFrames + (shiftedByMedia.has(left.id) ? shift : 0);
      const transition = { id, start, end, middle: (start + end) / 2 };
      const windows = trackTransitions.get(left.track) ?? [];
      windows.push(transition);
      trackTransitions.set(left.track, windows);
      clipTransitions.set(outgoing, { ...clipTransitions.get(outgoing), outgoing: transition });
      clipTransitions.set(incoming, { ...clipTransitions.get(incoming), incoming: transition });
    }
    return { trackTransitions, clipTransitions };
  }, [sceneItems, scene.transitions, shift, shiftedByMedia]);
  useEffect(() => () => cancelTrim.current(), [pixels, gestureBlocked, scene.composition]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!present || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey
        || (event.target as Element | null)?.closest("input,textarea,select,[contenteditable=true],[role=menu],[role=dialog]")) return;
      const next: TimelineTool | undefined = event.code === "KeyA" || event.key === "Escape" ? "select" : event.code === "KeyB" ? "cut" : event.code === "BracketLeft" ? "left" : event.code === "BracketRight" ? "right" : undefined;
      if (next) { if (event.key !== "Escape") event.preventDefault(); setTool(next); setCutCursor(undefined); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [present]);

  const begin = (event: React.PointerEvent<HTMLElement>, item: NleTimelineSceneItem, mode: "move" | TrimEdge, track: NleTimelineSceneTrack) => {
    if (gestureBlocked || (busy && tool !== "select") || event.button !== 0) return;
    event.stopPropagation();
    const localFrame = item.startFrame + Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels);
    if (tool === "cut") {
      if (!track.locked && item.affordances.split && localFrame > item.startFrame && localFrame < item.startFrame + item.durationFrames) onSplit([item.id], localFrame);
      return;
    }
    if (tool === "left" || tool === "right") { onSelect(directionalSelection(scene, localFrame, tool)); return; }
    if (mode === "move") { itemGesture.start(event, item, track); return; }
    const viewport = scroller.current;
    const range = trimRanges[item.id]?.[mode];
    if (viewport === null || track.locked || range === undefined) return;
    onSelect(event.metaKey || event.ctrlKey ? [...new Set([...selection, item.id])] : [item.id]);
    cancelTrim.current();
    const element = event.currentTarget;
    const { pointerId, clientX } = event;
    const scrollLeft = viewport.scrollLeft;
    const { start, duration } = itemWindow(item, pendingTrims);
    const end = start + duration;
    const origin = mode === "start" ? start : end;
    const minimum = mode === "end" ? Math.max(range.minimum, Math.ceil(start + 1)) : range.minimum;
    const maximum = mode === "start" ? Math.min(range.maximum, Math.floor(end - 1)) : range.maximum;
    if (maximum < minimum) return;
    event.preventDefault();
    element.setPointerCapture(pointerId);
    const pendingItems = new Set(pendingTrims.map(trim => trim.item));
    const boundaries = timelineSnapBoundaries(scene, new Set([item.id, ...pendingItems]));
    for (const id of pendingItems) {
      const other = sceneItems.get(id);
      if (other === undefined || id === item.id) continue;
      const { start, duration } = itemWindow(other, pendingTrims);
      if (start > 0) boundaries.push(Math.round(start));
      boundaries.push(Math.round(start + duration));
    }
    const clamp = (value: number) => Math.max(minimum, Math.min(maximum, Math.round(value)));
    let heldSnap: TimelineSnap | undefined;
    const proposal = (next: PointerEvent) => {
      const delta = (next.clientX - clientX + viewport.scrollLeft - scrollLeft) / pixels;
      const raw = origin + delta;
      const at = clamp(raw);
      const advances = (candidate: number) => (candidate - origin) * delta > 0;
      if (!advances(at)) { heldSnap = undefined; return; }
      heldSnap = snap && !next.altKey ? snapTimelineEdges([raw], frame, boundaries, pixels, {
        held: heldSnap,
        allows: value => value.frame >= minimum && value.frame <= maximum && advances(value.frame),
      }) : undefined;
      return { atFrame: heldSnap?.frame ?? at, snapFrame: heldSnap?.frame };
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const nextEdge = proposal(next);
      if (nextEdge === undefined) { setDraft(undefined); return; }
      const edit = { id: item.id, edge: mode, atFrame: nextEdge.atFrame,
        ...(nextEdge.snapFrame === undefined ? {} : { snapFrame: nextEdge.snapFrame }) };
      setDraft(mode === "start" ? { ...edit, start: nextEdge.atFrame, duration: end - nextEdge.atFrame }
        : { ...edit, start, duration: nextEdge.atFrame - start });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cleanup); element.removeEventListener("lostpointercapture", cancel);
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      cancelTrim.current = () => undefined;
      setDraft(undefined);
    };
    const finish = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const final = proposal(next);
      cleanup();
      if (final === undefined) return;
      const submitted = { item: item.id, edge: mode, atFrame: final.atFrame };
      setPendingTrims(previous => [...previous, submitted]);
      void onTrimGesture(item.id, mode, final.atFrame).finally(() =>
        setPendingTrims(previous => previous.filter(trim => trim !== submitted)));
    };
    const cancel = (next: PointerEvent) => { if (next.pointerId === pointerId) cleanup(); };
    const key = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); cleanup(); } };
    cancelTrim.current = cleanup;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cleanup); element.addEventListener("lostpointercapture", cancel);
  };

  return <motion.section ref={ref} className="nle-timeline" {...fadeMotion(reduced)} inert={!present}>
    <CompositionTabs tabs={session.timeline.compositions} active={scene.composition} root={session.project.rootComposition}
      canvas={session.canvas.canvas} busy={busy || gestureBlocked}
      onSelect={onComposition} onMove={onCompositionMove} onCreate={onCompositionCreate} onEdit={onCompositionEdit}
      onInsert={onCompositionInsert} onCopy={onCompositionCopy} onRoot={onCompositionRoot} onRemove={onCompositionRemove}/>
    <div className="nle-timeline-toolbar">
      <ToolSelector value={tool} onChange={value => { setTool(value); setCutCursor(undefined); }}/>
      <span className="nle-toolbar-separator" aria-hidden="true"/>
      <IconButton label="撤销" disabled={busy || !canUndo} onClick={onUndo}><Undo2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="重做" disabled={busy || !canRedo} onClick={onRedo}><Redo2 size={18} strokeWidth={1.6}/></IconButton>
      <span className="nle-toolbar-separator" aria-hidden="true"/>
      <IconButton label="分割" disabled={busy || !cuts?.split} onClick={splitAtPlayhead}><Scissors size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="向左裁剪" disabled={busy || !cuts?.trimStart} onClick={() => trimAtPlayhead("start")}><PanelLeftClose size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="向右裁剪" disabled={busy || !cuts?.trimEnd} onClick={() => trimAtPlayhead("end")}><PanelRightClose size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="删除" disabled={busy || (selected === undefined && selectedTransition === undefined)} onClick={onRemove}><Trash2 size={18} strokeWidth={1.6}/></IconButton>
      <AnimatePresence initial={false}>{session.timeline.canReturn && <motion.span {...fadeMotion(reduced)} key="parent"><IconButton label="返回父时间线" disabled={busy}
        onClick={onReturnComposition}><ArrowLeft size={18} strokeWidth={1.6}/></IconButton></motion.span>}</AnimatePresence>
      <span className="nle-toolbar-space"/>
      {matteTarget !== undefined && <div className="nle-matte-prompt">
        <span role="status" title={mattePrompt}>{mattePrompt}</span>
        <IconButton label="取消选择遮罩源" onClick={() => setMatteTarget(undefined)}><X size={14}/></IconButton>
      </div>}
      <IconButton label="吸附" className={snap ? "active" : ""} onClick={() => setSnap(value => !value)}><Magnet size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="适合时间线" onClick={fit}><Scan size={18} strokeWidth={1.6}/></IconButton>
      <div className="nle-zoom">
        <IconButton label="缩小" disabled={zoom <= minZoom} onClick={() => stepZoom(-1, frame)}><CircleMinus size={18} strokeWidth={1.6}/></IconButton>
        <div className="nle-zoom-slider">
          <span className="nle-zoom-rail" aria-hidden="true" style={{ "--fill": `${zoomPosition * 100}%` } as React.CSSProperties}/>
          <input type="range" aria-label="时间线缩放" min="0" max="100" step="any" value={zoomPosition * 100}
            onChange={event => changeZoomPosition(Number(event.target.value) / 100, frame)}/>
        </div>
        <IconButton label="放大" disabled={zoom >= maxZoom} onClick={() => stepZoom(1, frame)}><CirclePlus size={18} strokeWidth={1.6}/></IconButton>
      </div>
    </div>
    <motion.div layoutScroll data-frame-pixels={pixels} data-snap={snap} className={`nle-timeline-scroll${tool === "cut" ? " cut-mode" : tool === "left" || tool === "right" ? " direction-mode" : ""}`} ref={scroller}
      tabIndex={-1} role="region" aria-label="时间线编辑区" data-matte-pick={matteTarget !== undefined ? "" : undefined}
      onClickCapture={event => {
        if (matteTarget === undefined || !(event.target instanceof Element)) return;
        event.stopPropagation();
        chooseMatte(event.target.closest<HTMLElement>("[data-timeline-object]")?.dataset.timelineObject);
      }} onPointerDownCapture={event => {
      if (matteTarget !== undefined) {
        event.preventDefault(); event.stopPropagation(); return;
      }
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.closest(".library-grid")) focused.blur();
      if (event.button === 0 && event.target instanceof Element
        && !event.target.closest("button,input,textarea,select,a[href],[contenteditable=true]")) {
        event.currentTarget.focus({ preventScroll: true });
      }
    }} onPointerDown={event => {
      if (tool === "select") startMarquee(event);
      else if ((tool === "left" || tool === "right") && !(event.target as Element).closest(".nle-clip,.nle-track-label,.nle-ruler,button")) {
        const bounds = event.currentTarget.getBoundingClientRect(); onSelect(directionalSelection(scene, Math.max(0, Math.round((event.clientX - bounds.left - timelineOrigin + event.currentTarget.scrollLeft) / pixels)), tool));
      }
    }} onPointerLeave={() => setCutCursor(undefined)}>
      <div className="nle-tracks" style={{ width: timelineOrigin + width, minHeight: "100%", "--nle-track-padding": `${trackPadding}px`,
        "--nle-timeline-label-width": `${labelWidth}px`, "--nle-timeline-start-padding": `${timelineStartPadding}px` } as React.CSSProperties}>
        <TimelineRuler width={width} viewportLeft={timeViewport.left} viewportWidth={timeViewport.width} endFrame={endFrame}
          pixels={pixels} fps={fps} frame={frame} onSeek={seek.start}/>
        <div className="nle-track-top" data-nle-drop=""><div className="nle-track-label empty"/><div className="nle-track-space" style={{ width }}/></div>
        <AnimatePresence initial={false} mode="popLayout">{visibleTracks.map(track => {
          const TrackIcon = studioIcons[track.role];
          const picture = track.kind === "picture";
          const audio = track.kind === "audio" || track.items.some(item => item.signals.audio);
          const PictureIcon = !picture ? unavailableTrackIcons.picture : track.pictureEnabled ? Eye : EyeOff;
          const AudioIcon = !audio ? unavailableTrackIcons.audio : track.audioEnabled ? Volume2 : VolumeX;
          const adjustment = track.role === "filter" || track.role === "effect";
          const reordering = reorder.position?.trackId === track.id;
          const intervals = [...track.items].sort((left, right) => left.startFrame - right.startFrame);
          let end = 0;
          const gaps = intervals.flatMap(item => {
            const gap = Math.ceil(end) < Math.floor(item.startFrame) ? [{ start: Math.ceil(end), end: Math.floor(item.startFrame) }] : [];
            end = Math.max(end, item.startFrame + item.durationFrames);
            return gap;
          });
          const fade = fadeMotion(reduced);
          return <motion.div {...fade} layout={reduced || reordering || reorder.pending ? false : "position"} layoutDependency={trackLayout}
            transition={{ ...fade.transition, layout: { duration: reduced ? 0 : .22, ease: softEase } }}
            className={`nle-track${rowSize(track) === 36 ? " compact" : ""}${track.locked ? " locked" : ""}`}
            data-track-id={track.id} data-reordering={reordering ? "" : undefined} key={track.id} style={{ height: rowSize(track) }}>
          <TrackMenu disabled={busy || track.locked} pixels={pixels} gaps={gaps}
            onCloseGap={frames => onCloseGap(track.id, frames)}>
          <div className="nle-track-label" data-reorderable={!track.locked && !busy && !gestureBlocked && visibleTracks.length > 1}
            title={track.name} onPointerDown={event => reorder.start(event, track)}>
            <span className="nle-track-icons">
              <span className="nle-track-kind"><TrackIcon size={14} strokeWidth={1.75}/></span>
              <IconButton label={track.locked ? "解锁轨道" : "锁定轨道"} className="nle-track-lock" disabled={busy}
                aria-pressed={track.locked} onClick={() => onTrackLocked(track.id, !track.locked)}>
                {track.locked ? <Lock size={14} strokeWidth={1.75}/> : <Unlock size={14} strokeWidth={1.75}/>}
              </IconButton>
              <IconButton className="nle-track-signal" label={!picture ? "此轨道无画面" : adjustment ? (track.pictureEnabled ? "停用轨道效果" : "启用轨道效果")
                : (track.pictureEnabled ? "隐藏轨道画面" : "显示轨道画面")} disabled={!picture || busy || track.locked}
                aria-pressed={picture ? !track.pictureEnabled : undefined} onClick={() => onTrackSignal(track.id, "picture", !track.pictureEnabled)}>
                <PictureIcon size={14} strokeWidth={1.75}/>
              </IconButton>
              <IconButton className="nle-track-signal" label={!audio ? "此轨道无声音" : track.audioEnabled ? "静音轨道" : "取消轨道静音"}
                disabled={!audio || busy || track.locked}
                aria-pressed={audio ? !track.audioEnabled : undefined} onClick={() => onTrackSignal(track.id, "audio", !track.audioEnabled)}>
                <AudioIcon size={14} strokeWidth={1.75}/>
              </IconButton>
            </span>
          </div>
          <div className="nle-track-content" data-drop-target={highlightedTrack === track.id ? "" : undefined} data-nle-drop={track.id} style={{ width }}>
            <AnimatePresence initial={false}>{track.items.map(item => {
              const unshifted = draft?.id === item.id ? draft : itemWindow(item, pendingTrims);
              const current = shiftedByMedia.has(item.id) ? { ...unshifted, start: unshifted.start + shift } : unshifted;
              const clipLeft = current.start * pixels;
              const span = current.duration * pixels;
              const clipWidth = Math.max(8, span);
              const selected = selection.includes(item.id), moving = itemGesture.moving.has(item.id);
              const trim = trimRanges[item.id];
              const transitions = clipTransitions.get(item.id);
              const clipStyle = { left: clipLeft, width: clipWidth,
                ...(transitions?.incoming === undefined ? {} : {
                  "--nle-transition-leading": `${Math.max(0, transitions.incoming.middle * pixels - clipLeft)}px`,
                  "--nle-transition-title-start": `${Math.max(0, transitions.incoming.end * pixels - clipLeft)}px`,
                }),
                ...(transitions?.outgoing === undefined ? {} : {
                  "--nle-transition-trailing": `${Math.max(0, clipLeft + clipWidth - transitions.outgoing.middle * pixels)}px`,
                }) };
              const label = timelineItemLabel(item, track.role);
              const badges: (keyof typeof timelineBadgeIcons)[] = [];
              if (item.nestedComposition !== undefined) badges.push("composition");
              if (matteByContent.has(item.id)) badges.push("matteContent");
              if (matteSources.has(item.id)) badges.push("matteSource");
              if (item.group !== undefined) badges.push("group");
              const previewSource = session.timeline.previewSources[item.id];
              const edits = previewTrims.get(item.id);
              const previewActive = edits !== undefined || previewViewport.active.has(item.id);
              const timing = tool === "select" && selectedProcess?.item === item.id
                ? item.anchoredProcesses.find(process => process.medium === selectedProcess.medium && process.id === selectedProcess.process)
                : undefined;
              const menuIds = editableSelection(scene, selection.includes(item.id) ? selection : [item.id]);
              const menuCuts = selection.includes(item.id) ? cuts : undefined;
              const rippleItems = menuIds.flatMap(id => {
                const selected = sceneItems.get(id);
                return selected === undefined ? [] : [selected];
              }).sort((left, right) => left.startFrame - right.startFrame);
              let rippleEnd = rippleItems[0]?.startFrame ?? 0;
              const contiguous = rippleItems.every(entry => {
                const next = entry.startFrame <= rippleEnd;
                rippleEnd = Math.max(rippleEnd, entry.startFrame + entry.durationFrames);
                return next;
              });
              return <ClipMenu key={item.id} disabled={busy || track.locked || matteTarget !== undefined}
                readActions={() => clipActions(menuIds, track)}
                canRippleRemove={rippleItems.length > 0 && contiguous}
                canSplit={menuCuts?.split === true} canTrimStart={menuCuts?.trimStart === true} canTrimEnd={menuCuts?.trimEnd === true}
                onSelect={() => onSelect(menuIds)} onSplit={splitAtPlayhead}
                onTrimStart={() => trimAtPlayhead("start")} onTrimEnd={() => trimAtPlayhead("end")}
                onRemove={onRemove} onRippleRemove={() => onRippleRemove(rippleItems)}
                {...(item.stacking?.up === undefined ? {} : { onRaise: () => onItemReorder(item.id, "up") })}
                {...(item.stacking?.down === undefined ? {} : { onLower: () => onItemReorder(item.id, "down") })}>
                <motion.div {...fadeMotion(reduced)} {...timelineObject(item.id)}
                  data-clip-id={item.id} data-source={item.source} data-transition-endpoint={transitions === undefined ? undefined : ""}
                  data-pending-move={itemGesture.pendingItems.has(item.id) ? "" : undefined}
                  data-matte-related={focusedMatteItems.has(item.id) ? "" : undefined}
                  role="button" tabIndex={0}
                  aria-label={label} aria-pressed={selected}
                  aria-description={badges.length > 0 ? badges.map(badge => timelineBadgeIcons[badge].label).join("，") : undefined}
                  title={track.role === "audio" ? label : undefined}
                  className={`nle-clip ${track.role}${selected ? " selected" : ""}${moving ? " drag-origin" : ""}`}
                  style={clipStyle}
                  onPointerDown={event => begin(event, item, "move", track)}
                  onDoubleClick={() => { if (!busy && item.nestedComposition !== undefined) onEnterComposition(item.id); }}
                  onKeyDown={event => {
                    if (event.key !== "Enter" || busy) return;
                    event.preventDefault();
                    if (matteTarget !== undefined) chooseMatte(item.id);
                    else onSelect(editableSelection(scene, [item.id]));
                  }}
                  onPointerMove={event => {
              if (tool !== "cut" || busy || track.locked) return; const at = item.startFrame + Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels); setCutCursor(item.affordances.split && at > item.startFrame && at < item.startFrame + item.durationFrames ? { track: track.id, frame: at } : undefined);
            }} onPointerLeave={() => setCutCursor(undefined)}>
              <div className="nle-clip-content">
                <span className="nle-clip-title">
                  {badges.map(badge => {
                    const { Icon, label } = timelineBadgeIcons[badge];
                    return <span key={badge} className="nle-clip-chip nle-clip-badge" data-clip-badge={badge}
                      title={label} aria-hidden="true"><Icon size={12}/></span>;
                  })}
                  <span className="nle-clip-chip">{label}</span>
                  {(track.role === "picture" || track.role === "audio") && <span className="nle-clip-chip">{timecode(current.duration, fps)}</span>}
                </span>
                {previewSource !== undefined && (previewActive || previewViewport.retained.has(item.id)) && <TimelineSourcePreview source={previewSource} pictureItem={item.signals.picture}
                  generation={session.media.generation} authored={item} window={current} trims={edits}
                  frameWidth={pixels} editRate={scene.editRate} viewport={previewViewport} active={previewActive}/>}
                <div className={`nle-cut-line${tool === "cut" && cutCursor?.track === track.id && cutCursor.frame >= item.startFrame && cutCursor.frame <= item.startFrame + item.durationFrames ? " visible" : ""}`} style={{ left: ((cutCursor?.frame ?? item.startFrame) - item.startFrame) * pixels }}/>
                {timing !== undefined && selectedProcess !== undefined && <ProcessTimingHandle key={`${timing.medium}:${timing.id}`}
                  timing={timing} duration={current.duration} pixels={pixels} disabled={gestureBlocked || track.locked}
                  onSelect={() => onSelectProcess(selectedProcess)}
                  onResize={durationFrames => onProcessTiming({ kind: "process.timing", ...selectedProcess, edge: timing.edge, durationFrames })}/>}
              </div>
              {selected && !moving && (trim?.start || trim?.end) &&
                <div className="nle-clip-trims" data-narrow={span < 8 ? "" : undefined} style={{ width: span }}>
                  {trim.start && <div className="nle-trim start" aria-label="裁剪开头" onPointerDown={event => begin(event, item, "start", track)}/>}
                  {trim.end && <div className="nle-trim end" aria-label="裁剪结尾" onPointerDown={event => begin(event, item, "end", track)}/>}
                </div>}
            </motion.div></ClipMenu>; })}</AnimatePresence>
            <AnimatePresence initial={false}>{(trackTransitions.get(track.id) ?? []).map(({ id, start, end }) => {
              const transitionWidth = (end - start) * pixels;
              const title = session.timeline.transitionTitles[id] ?? "转场";
              const duration = timecode(end - start, fps);
              const label = `${title} · ${duration}`;
              const selected = selectedTransition === id;
              return <motion.button {...fadeMotion(reduced)} {...timelineObject(id)} key={id} type="button" data-transition-id={id}
                aria-label={label} aria-pressed={selected} className={`nle-transition-block${selected ? " selected" : ""}`}
                style={{ left: start * pixels, width: transitionWidth }} title={label}
                onPointerDown={event => event.stopPropagation()}
                onClick={() => onSelectTransition(id)}>
                <span className="nle-transition-divider" aria-hidden="true"/>
                <span className="nle-clip-title" aria-hidden="true">
                  <span className="nle-clip-chip">{title}</span>
                  <span className="nle-clip-chip">{duration}</span>
                </span>
              </motion.button>;
            })}</AnimatePresence>
            <div className={`nle-clip studio-media-drop${drop?.track === track.id && drop.durationFrames !== undefined ? " visible" : ""}`}
              style={{ left: (drop?.frame ?? 0) * pixels, width: Math.max(8, (drop?.durationFrames ?? 0) * pixels) }} aria-hidden="true"/>
          </div>
        </TrackMenu></motion.div>; })}</AnimatePresence>
        <div className="nle-track-space-row" data-nle-drop=""><div className="nle-track-label empty"/><div className="nle-track-space" style={{ width }}/></div>
        <div className={`nle-timeline-empty${visibleTracks.length || fileDrop !== undefined ? "" : " visible"}`} style={{ left: timelineOrigin, width, height: trackPadding }}>从素材区或文件系统拖入素材</div>
        {marqueeBox && <div className="nle-marquee" style={marqueeBox} aria-hidden="true"/>}
        <AnimatePresence initial={false}>{insertion !== undefined && <motion.div {...fadeMotion(reduced)}
          className="nle-track-insertion" style={{ top: insertion }} />}</AnimatePresence>
        <div className="nle-timeline-guides" style={{ "--nle-playhead-x": `${labelWidth + playheadPosition}px` } as React.CSSProperties}>
          {fileDrop !== undefined && <span className="nle-file-drop-hint" role="status" style={{
            left: Math.max(labelWidth + viewport.left + 8, Math.min(
              timelineOrigin + fileDrop.frame * pixels + 10, labelWidth + viewport.left + viewport.width - 172,
            )),
            top: viewport.top + rulerHeight + 8,
          }}>{fileDrop.pending ? "正在导入并添加到播放头…" : "导入并添加到播放头"}</span>}
          {guide !== undefined && guide !== frame && <div className="nle-snap-line" style={{ left: Math.round(timelineOrigin + guide * pixels - viewport.left) + viewport.left }}/>}
          <div className={`nle-playhead${playheadSnap}`}/>
          <div className={`nle-playhead-control${playheadSnap}`} style={{ visibility: playheadVisible ? undefined : "hidden" }}>
            <button className={seek.active ? "active" : ""} aria-label="播放头" onPointerDown={event => seek.start(event, frame)}/>
          </div>
        </div>
      </div>
    </motion.div>
    {mediaPlacement !== undefined && <MediaPlacementPreview draft={mediaPlacement} editRate={scene.editRate} generation={session.media.generation}/>}
    {itemGesture.floating.map(item => {
      const entry = item.pending ? sceneItems.get(item.id) : undefined;
      const track = entry === undefined ? undefined : scene.tracks.find(row => row.id === entry.track);
      const canDrag = tool === "select" && matteTarget === undefined && !gestureBlocked && entry !== undefined && track !== undefined;
      const bounds = item.pending ? scroller.current?.getBoundingClientRect() : undefined;
      const clipPath = bounds === undefined ? undefined : `inset(${Math.max(0, bounds.top + rulerHeight - item.top)}px ${
        Math.max(0, item.left + item.width - bounds.right)}px ${Math.max(0, item.top + item.height - bounds.bottom)}px ${
        Math.max(0, bounds.left + labelWidth - item.left)}px)`;
      return <div key={item.id} className="nle-floating-preview" aria-hidden="true"
        data-pending-clip-id={item.pending ? item.id : undefined} data-drop-invalid={!item.pending && intent === undefined ? "" : undefined}
        onPointerDown={canDrag ? event => itemGesture.start(event, entry, track) : undefined}
        style={{ position: "fixed", left: item.left, top: item.top, width: item.width, height: item.height,
          clipPath, pointerEvents: canDrag ? "auto" : "none", cursor: canDrag ? "grab" : undefined }}>
        <div className={`nle-clip nle-clip-ghost ${item.role}`} style={{ inset: 0, height: item.height }}>
          {item.picture !== undefined && <FloatingFilmstrip picture={item.picture}/>}
          <span className="nle-clip-title"><span className="nle-clip-chip">{item.title}</span></span>
        </div>
      </div>;
    })}
  </motion.section>;
}

function MediaPlacementPreview({ draft, editRate, generation }: {
  readonly draft: MediaPlacementDraft;
  readonly editRate: NleTimelineScene["editRate"];
  readonly generation: number;
}) {
  const { left, top, pixels, frame, durationFrames } = draft.position;
  const origin = frame * pixels - left;
  return <div className="nle-floating-preview nle-media-placement" data-media-placement="" data-blocked={draft.blocked || undefined}
    aria-hidden="true" style={{ left, top, height: rowHeight - 6, width: Math.max(8, durationFrames * pixels) }}>
    <div className={`nle-clip ${draft.role}`} style={{ inset: 0 }}>
      <div className="nle-clip-content">
        {draft.preview !== undefined && <TimelineSourcePreview source={draft.preview} pictureItem={draft.role === "picture"}
          generation={generation} authored={{ startFrame: frame, durationFrames }} window={{ start: frame, duration: durationFrames }}
          frameWidth={pixels} editRate={editRate} viewport={{ left: origin, right: origin + window.innerWidth }} active/>}
        <span className="nle-clip-title"><span className="nle-clip-chip">{draft.label}</span>
          <span className="nle-clip-chip">{timecode(durationFrames, editRate.numerator / editRate.denominator)}</span></span>
      </div>
    </div>
  </div>;
}
