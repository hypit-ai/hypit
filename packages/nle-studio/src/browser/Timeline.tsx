import type { NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/surface";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import {
  ArrowLeft, AudioLines, CircleMinus, CirclePlus, Group, Layers, Link2, Lock, Magnet,
  PanelLeftClose, PanelRightClose, Redo2, Scan, Scissors, Snowflake, Trash2, Undo2, Unlock,
  Volume2, VolumeX,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { NleStudioOpenProjection, NleStudioProcessAddress, NleStudioProcessEdit } from "../protocol.js";
import { IconButton } from "./common.js";
import { timecode } from "./timecode.js";
import { studioIcons } from "./studio-icons.js";
import { labelWidth, rowHeight, rowSize, rulerHeight, snapTimelineEdges, timelineItemLabel, timelineEndPadding,
  timelineOrigin, timelineSnapBoundaries, timelineStartPadding } from "./timelineGeometry.js";
import { ToolSelector, type TimelineTool } from "./ToolSelector.js";
import { useTimelineSeek } from "./useTimelineSeek.js";
import { useTrackReorder } from "./useTrackReorder.js";
import { useItemGesture, type ItemDropIntent } from "./useItemGesture.js";
import { TimelineSourcePreview, useTimelineMedia } from "./TimelineMedia.js";
import { TimelineRuler } from "./TimelineRuler.js";

import { readDropDestination } from "./api.js";
import { useTimelineViewport } from "./useTimelineViewport.js";
import type { MediaDrop } from "./mediaDrag.js";
import type { NleStudioDropDestination } from "../protocol.js";
import { CompositionActions, NewCompositionButton } from "./CompositionActions.js";
import { resolveCompoundSelection } from "../compound-selection.js";
import { TrackMenu } from "./TrackMenu.js";
import { ClipMenu } from "./ClipMenu.js";
import { directionalSelection, editableSelection, selectionAtFrame } from "./selection.js";
import { fadeMotion, softEase } from "./motion.js";

import { useMarqueeSelection } from "./useMarqueeSelection.js";

type TrimEdge = "start" | "end";
type PendingTrim = { readonly item: string; readonly edge: TrimEdge; readonly atFrame: number };

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
        const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const next = clamp(visible + delta * direction);
        if (next !== Math.round(visible)) commit(next);
      }}/>
  </div>;
}

export function Timeline({ session, frame, playing, reveal, selection, busy, gestureBlocked, onSeek, onSelect, onMove, onTrim, onTrimGesture, onSplit, onRemove,
  onTrackEnabled, onTrackLocked, onTrackMove, onTrackRename, onTrackRemove, onCloseGap, onRippleRemove, onComposition,
  onCompositionCreate, onCompositionEdit, onCompositionInsert, onCompositionCopy, onCompositionRoot, onCompositionRemove, onEnterComposition, onReturnComposition,
  onCompound, onCompoundUnique, onCompoundExplode, onToggleGroup, canToggleGroup, groupLabel,
  onDetachAudio, canDetachAudio, canUndo, canRedo, onUndo, onRedo, drop, canFreeze, onFreeze, selectedProcess, onSelectProcess, onProcessTiming, selectedTransition, onSelectTransition, ref }: {
  readonly ref?: Ref<HTMLElement>;
  readonly selectedTransition: string | undefined;
  readonly onSelectTransition: (id: string) => void;
  readonly session: NleStudioOpenProjection;
  readonly drop: MediaDrop | undefined;
  readonly canFreeze: boolean;
  readonly onFreeze: () => void;
  readonly onCompositionCreate: (name: string, canvas: { width: number; height: number }) => void;
  readonly onCompositionEdit: (id: string, fields: { name?: string; canvas?: { width: number; height: number } }) => void;
  readonly onCompositionInsert: (id: string) => void;
  readonly onCompositionCopy: (id: string) => void;
  readonly onCompositionRoot: (id: string) => void;
  readonly onCompositionRemove: (id: string) => void;
  readonly onRippleRemove: (items: readonly NleTimelineSceneItem[]) => void;
  readonly onTrackRename: (track: string, name: string) => void;
  readonly onTrackRemove: (track: string) => void;
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
  readonly onMove: (intent: ItemDropIntent) => Promise<void>;
  readonly onTrim: (items: readonly NleTimelineSceneItem[], edge: "start" | "end", atFrame: number) => void;
  readonly onTrimGesture: (item: string, edge: TrimEdge, atFrame: number) => Promise<void>;
  readonly onSplit: (items: readonly string[], atFrame: number) => void;
  readonly onRemove: () => void;
  readonly onTrackEnabled: (track: string, enabled: boolean) => void;
  readonly onTrackLocked: (track: string, locked: boolean) => void;
  readonly onTrackMove: (track: string, before?: string) => void;
  readonly onComposition: (composition: string) => void;
  readonly onEnterComposition: (item: string) => void;
  readonly onReturnComposition: () => void;
  readonly onCompound: () => void;
  readonly onToggleGroup: () => void;
  readonly canToggleGroup: boolean;
  readonly groupLabel: "组合" | "取消组合" | "移出组合";
  readonly onDetachAudio: () => void;
  readonly canDetachAudio: boolean;
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
  const tabList = useRef<HTMLDivElement>(null);
  const lastClipEnd = useMemo(() => scene.tracks.reduce((latest, track) => track.items.reduce(
    (end, item) => Math.max(end, item.startFrame + item.durationFrames), latest), 0), [scene.tracks]);
  const { viewport, zoom, minZoom, maxZoom, zoomPosition, fit, changeZoomPosition, stepZoom, contentWidth: width } = useTimelineViewport(
    scroller, labelWidth, JSON.stringify([session.project.name, session.project.document, scene.composition]),
    lastClipEnd, scene.maximumFrame, fps, { frame, playing, reveal });
  const pixels = zoom / fps;
  const playheadPosition = timelineStartPadding + frame * pixels;
  const playheadVisible = playheadPosition >= viewport.left && playheadPosition < viewport.left + viewport.width;
  const timeViewport = { ...viewport, left: viewport.left - timelineStartPadding };
  const endFrame = Math.floor((width - timelineEndPadding) / pixels);
  const [snap, setSnap] = useState(true), [tool, setTool] = useState<TimelineTool>("select");
  const [draft, setDraft] = useState<{ readonly id: string; readonly start: number; readonly duration: number; readonly snapFrame?: number }>();
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
  const visibleTracks = useMemo(() => scene.tracks.filter(track => track.items.length > 0 || emptyDestinations.has(track.id)),
    [scene.tracks, emptyDestinations]);
  const trackLayout = useMemo(() => JSON.stringify(visibleTracks.map(track => [track.id, rowSize(track)])), [visibleTracks]);
  const reorder = useTrackReorder(scroller, scene.tracks, session.status.projectRevision, busy, onTrackMove);
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
  const highlightedTrack = drop?.track ?? (resolved === undefined ? itemDrag?.sourceTrack : "track" in resolved ? resolved.track : undefined);
  const rows = Array.from(scroller.current?.querySelectorAll<HTMLElement>(".nle-track[data-track-id]") ?? [])
    .filter(row => visibleTracks.some(track => track.id === row.dataset.trackId));
  const resolvedGap = resolved && "gap" in resolved ? resolved : undefined;
  const after = rows.at(-1);
  const insertion = reorder.position?.top ?? (resolvedGap === undefined ? undefined
    : resolvedGap.before === undefined ? (after === undefined ? undefined : after.offsetTop + after.offsetHeight)
      : rows.find(row => row.dataset.trackId === resolvedGap.before)?.offsetTop);
  const guide = (resolved === undefined ? undefined : itemDrag?.snapFrame) ?? draft?.snapFrame ?? drop?.snapFrame ?? drop?.transitionCut?.frame;
  const playheadSnap = guide === frame || seek.snapped ? " adsorbed" : "";
  const trackPadding = Math.max(rowHeight, (viewport.height - rulerHeight - visibleTracks.reduce((height, track) => height + rowSize(track), 0)) / 2);
  const previewViewport = useTimelineMedia(session.timeline, visibleTracks, pixels, timeViewport, trackPadding);
  const selected = scene.tracks.flatMap(track => track.items).find(item => selection.includes(item.id));
  const trimRanges = session.timeline.trimRanges;
  const trimAtFrame = (ids: readonly string[], edge: "start" | "end") =>
    selectionAtFrame(scene, ids, frame, edge === "start" ? "trimStart" : "trimEnd", item => {
      const range = trimRanges[item.id]?.[edge];
      return range !== undefined && frame >= range.minimum && frame <= range.maximum;
    });
  const trimStartItems = trimAtFrame(selection, "start"), trimEndItems = trimAtFrame(selection, "end");
  const sceneItems = new Map(scene.tracks.flatMap(track => track.items.map(item => [item.id, item] as const)));
  const splitItems = selectionAtFrame(scene, selection, frame, "split");
  const compound = useMemo(() => resolveCompoundSelection(scene, selection), [scene, selection]);
  const canCompound = "track" in compound && !compound.track.locked;
  const compositions = session.timeline.compositions;

  useLayoutEffect(() => {
    const list = tabList.current;
    if (list === null) return;
    const tab = list.querySelector<HTMLElement>(".nle-timeline-tab.current");
    if (tab === null) return;
    const start = tab.offsetLeft, end = start + tab.offsetWidth;
    if (start < list.scrollLeft) list.scrollLeft = start;
    else if (end > list.scrollLeft + list.clientWidth) list.scrollLeft = end - list.clientWidth;
  }, [scene.composition]);

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
    const proposal = (next: PointerEvent) => {
      const delta = Math.round((next.clientX - clientX + viewport.scrollLeft - scrollLeft) / pixels);
      const at = clamp(origin + delta);
      const advances = (candidate: number) => candidate !== Math.round(origin) && (candidate - origin) * delta > 0;
      if (!advances(at)) return;
      const aligned = snap && !next.altKey ? snapTimelineEdges([at], frame, boundaries, pixels, correction =>
        at + correction >= minimum && at + correction <= maximum && advances(at + correction)) : undefined;
      return { atFrame: aligned?.frame ?? at, snapFrame: aligned?.frame };
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const nextEdge = proposal(next);
      if (nextEdge === undefined) { setDraft(undefined); return; }
      const guide = nextEdge.snapFrame === undefined ? {} : { snapFrame: nextEdge.snapFrame };
      setDraft(mode === "start" ? { id: item.id, start: nextEdge.atFrame, duration: end - nextEdge.atFrame, ...guide }
        : { id: item.id, start, duration: nextEdge.atFrame - start, ...guide });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", key);
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
    window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", key);
    window.addEventListener("blur", cleanup); element.addEventListener("lostpointercapture", cancel);
  };

  return <motion.section ref={ref} className="nle-timeline" {...fadeMotion(reduced)} inert={!present}>
    <div className="nle-timeline-tabbar">
      <div className="nle-timeline-tabs" ref={tabList} role="tablist" aria-label="项目时间线">
        <AnimatePresence initial={false}>{compositions.map(composition => {
          const current = composition.id === scene.composition;
          return <motion.div {...fadeMotion(reduced)} className={`nle-timeline-tab${current ? " current" : ""}`} key={composition.id}>
            <button type="button" role="tab" disabled={busy} aria-selected={current} title={composition.name}
              onClick={() => onComposition(composition.id)}>{composition.name}</button>
            <CompositionActions composition={composition} disabled={busy}
              root={composition.id === session.project.rootComposition} referenced={composition.referenced}
              canInsert={composition.canInsert}
              onRename={name => onCompositionEdit(composition.id, { name })}
              onResize={canvas => onCompositionEdit(composition.id, { canvas })}
              onInsert={() => onCompositionInsert(composition.id)} onCopy={() => onCompositionCopy(composition.id)}
              onRoot={() => onCompositionRoot(composition.id)} onRemove={() => onCompositionRemove(composition.id)}/>
          </motion.div>;
        })}</AnimatePresence>
      </div>
      <NewCompositionButton canvas={session.canvas.canvas} disabled={busy} onCreate={onCompositionCreate}/>
    </div>
    <div className="nle-timeline-toolbar">
      <ToolSelector value={tool} onChange={value => { setTool(value); setCutCursor(undefined); }}/>
      <span className="nle-toolbar-separator"/>
      <IconButton label="撤销" disabled={busy || !canUndo} onClick={onUndo}><Undo2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="重做" disabled={busy || !canRedo} onClick={onRedo}><Redo2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="分割" disabled={busy || splitItems.length === 0} onClick={() => onSplit(splitItems.map(item => item.id), frame)}><Scissors size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="向左裁剪" disabled={busy || trimStartItems.length === 0} onClick={() => onTrim(trimStartItems, "start", frame)}><PanelLeftClose size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="向右裁剪" disabled={busy || trimEndItems.length === 0} onClick={() => onTrim(trimEndItems, "end", frame)}><PanelRightClose size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="删除" disabled={busy || (selected === undefined && selectedTransition === undefined)} onClick={onRemove}><Trash2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="分离音频" disabled={busy || !canDetachAudio} onClick={onDetachAudio}><AudioLines size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="定格" disabled={busy || !canFreeze} onClick={onFreeze}><Snowflake size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="创建复合片段" disabled={busy || !canCompound} onClick={onCompound}><Layers size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label={groupLabel} className={groupLabel === "组合" ? "" : "active"} disabled={busy || !canToggleGroup} onClick={onToggleGroup}><Group size={18} strokeWidth={1.6}/></IconButton>
      <AnimatePresence initial={false}>{session.timeline.canReturn && <motion.span {...fadeMotion(reduced)} key="parent"><IconButton label="返回父时间线" disabled={busy}
        onClick={onReturnComposition}><ArrowLeft size={18} strokeWidth={1.6}/></IconButton></motion.span>}</AnimatePresence>
      <span className="nle-toolbar-space"/>
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
    <motion.div layoutScroll data-frame-pixels={pixels} data-snap={snap} data-at-start={viewport.left <= 0} className={`nle-timeline-scroll${tool === "cut" ? " cut-mode" : tool === "left" || tool === "right" ? " direction-mode" : ""}`} ref={scroller}
      onPointerDownCapture={() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.closest(".library-grid")) focused.blur();
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
          const intervals = [...track.items].sort((left, right) => left.startFrame - right.startFrame);
          let end = 0;
          const gaps = intervals.flatMap(item => {
            const gap = Math.ceil(end) < Math.floor(item.startFrame) ? [{ start: Math.ceil(end), end: Math.floor(item.startFrame) }] : [];
            end = Math.max(end, item.startFrame + item.durationFrames);
            return gap;
          });
          const fade = fadeMotion(reduced);
          return <motion.div {...fade} layout={reduced ? false : "position"} layoutDependency={trackLayout}
            transition={{ ...fade.transition, layout: { duration: reduced ? 0 : .22, ease: softEase } }}
            className={`nle-track${rowSize(track) === 36 ? " compact" : ""}${track.locked ? " locked" : ""}`}
            data-track-id={track.id} key={track.id} style={{ height: rowSize(track) }}>
          <TrackMenu name={track.name} disabled={busy || track.locked} pixels={pixels} gaps={gaps}
            onCloseGap={frames => onCloseGap(track.id, frames)} onRename={name => onTrackRename(track.id, name)}
            onRemove={() => onTrackRemove(track.id)}>
          <div className={`nle-track-label${reorder.position?.trackId === track.id ? " reordering" : ""}`} data-reorderable={!track.locked && !busy} title={track.name} onPointerDown={event => reorder.start(event, track)}><span className="nle-track-icons"><span className="nle-track-kind"><TrackIcon size={14}/></span>
            <IconButton label={track.locked ? "解锁轨道" : "锁定轨道"} className="nle-track-lock" disabled={busy} aria-pressed={track.locked} onClick={() => onTrackLocked(track.id, !track.locked)}>{track.locked ? <Lock size={14}/> : <Unlock size={14}/>}</IconButton>
            <IconButton label={track.enabled ? "停用轨道" : "启用轨道"} disabled={busy} onClick={() => onTrackEnabled(track.id, !track.enabled)}>{track.enabled ? <Volume2 size={14}/> : <VolumeX size={14}/>}</IconButton></span></div>
          <div className="nle-track-content" data-drop-target={highlightedTrack === track.id ? "" : undefined} data-nle-drop={track.id} style={{ width }}>
            <AnimatePresence initial={false}>{track.items.map(item => {
              const current = draft?.id === item.id ? draft : itemWindow(item, pendingTrims);
              const label = timelineItemLabel(item, track.role);
              const previewSource = session.timeline.previewSources[item.id];
              const timing = tool === "select" && selectedProcess?.item === item.id
                ? item.anchoredProcesses.find(process => process.medium === selectedProcess.medium && process.id === selectedProcess.process)
                : undefined;
              const menuIds = editableSelection(scene, selection.includes(item.id) ? selection : [item.id]);
              const splits = selectionAtFrame(scene, menuIds, frame, "split");
              const starts = trimAtFrame(menuIds, "start"), ends = trimAtFrame(menuIds, "end");
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
              return <ClipMenu key={item.id} disabled={busy || track.locked}
                canRippleRemove={rippleItems.length > 0 && contiguous}
                canSplit={splits.length > 0} canTrimStart={starts.length > 0} canTrimEnd={ends.length > 0}
                onSelect={() => onSelect(menuIds)} onSplit={() => onSplit(splits.map(entry => entry.id), frame)}
                onTrimStart={() => onTrim(starts, "start", frame)} onTrimEnd={() => onTrim(ends, "end", frame)}
                onRemove={onRemove} onRippleRemove={() => onRippleRemove(rippleItems)}
                {...(item.nestedComposition === undefined ? {} : { onOpen: () => onEnterComposition(item.id),
                  onDuplicate: () => onCompoundUnique(item.id), onUnpack: () => onCompoundExplode(item.id) })}>
                <motion.div {...fadeMotion(reduced)}
                  data-clip-id={item.id} data-source={item.source} role="button" tabIndex={0}
                  aria-label={label} aria-pressed={selection.includes(item.id)}
                  title={track.role === "audio" ? label : undefined}
                  className={`nle-clip ${track.role}${selection.includes(item.id) ? " selected" : ""}${itemGesture.moving.has(item.id) ? " drag-origin" : ""}`}
                  style={{ left: current.start * pixels, width: Math.max(8, current.duration * pixels) }}
                  onPointerDown={event => begin(event, item, "move", track)}
                  onDoubleClick={() => { if (!busy && item.nestedComposition !== undefined) onEnterComposition(item.id); }}
                  onKeyDown={event => { if (event.key === "Enter" && !busy) { event.preventDefault(); onSelect(editableSelection(scene, [item.id])); } }}
                  onPointerMove={event => {
              if (tool !== "cut" || busy || track.locked) return; const at = item.startFrame + Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels); setCutCursor(item.affordances.split && at > item.startFrame && at < item.startFrame + item.durationFrames ? { track: track.id, frame: at } : undefined);
            }} onPointerLeave={() => setCutCursor(undefined)}>
              <div className="nle-clip-content">
                <span className="nle-clip-title">
                  {item.group && <span className="nle-clip-chip nle-clip-icon" aria-hidden="true"><Group size={11}/></span>}
                  {item.nestedComposition !== undefined && <span className="nle-clip-chip nle-clip-icon" aria-hidden="true"><Layers size={11}/></span>}
                  <span className="nle-clip-chip">{scene.mattes.some(matte => matte.content === item.id || matte.matte === item.id) && <Link2 size={11}/>} {label}</span>
                  {(track.role === "picture" || track.role === "audio") && <span className="nle-clip-chip">{timecode(current.duration, fps)}</span>}
                </span>
                {previewSource !== undefined && (previewViewport.active.has(item.id) || previewViewport.retained.has(item.id)) && <TimelineSourcePreview source={previewSource} pictureItem={item.signals.picture}
                  generation={session.media.generation} origin={item.startFrame} duration={item.durationFrames} start={current.start}
                  frameWidth={pixels} editRate={scene.editRate} viewport={previewViewport} active={previewViewport.active.has(item.id)}/>}
                <div className={`nle-cut-line${tool === "cut" && cutCursor?.track === track.id && cutCursor.frame >= item.startFrame && cutCursor.frame <= item.startFrame + item.durationFrames ? " visible" : ""}`} style={{ left: ((cutCursor?.frame ?? item.startFrame) - item.startFrame) * pixels }}/>
                {timing !== undefined && selectedProcess !== undefined && <ProcessTimingHandle key={`${timing.medium}:${timing.id}`}
                  timing={timing} duration={current.duration} pixels={pixels} disabled={gestureBlocked || track.locked}
                  onSelect={() => onSelectProcess(selectedProcess)}
                  onResize={durationFrames => onProcessTiming({ kind: "process.timing", ...selectedProcess, edge: timing.edge, durationFrames })}/>}
              </div>
              {trimRanges[item.id]?.start && <div className="nle-trim start" aria-label="裁剪开头" onPointerDown={event => begin(event, item, "start", track)}/>}
              {trimRanges[item.id]?.end && <div className="nle-trim end" aria-label="裁剪结尾" onPointerDown={event => begin(event, item, "end", track)}/>}
            </motion.div></ClipMenu>; })}</AnimatePresence>
            <AnimatePresence initial={false}>{scene.transitions.flatMap(transition => {
              const outgoing = sceneItems.get(transition.outgoing), incoming = sceneItems.get(transition.incoming);
              if (outgoing?.track !== track.id || incoming === undefined) return [];
              const start = incoming.startFrame, end = outgoing.startFrame + outgoing.durationFrames;
              return end <= start ? [] : [<motion.button {...fadeMotion(reduced)} key={transition.id} aria-pressed={selectedTransition === transition.id} className={`nle-transition-block${selectedTransition === transition.id ? " selected" : ""}`} style={{ left: start * pixels, width: Math.max(10, (end - start) * pixels) }} title={transition.operator.symbol} onPointerDown={event => event.stopPropagation()} onClick={() => { onSeek(Math.floor((start + end) / 2)); onSelectTransition(transition.id); }}><studioIcons.transition size={12}/></motion.button>];
            })}</AnimatePresence>
            <div className={`nle-clip studio-media-drop${drop?.track === track.id && drop.durationFrames !== undefined ? " visible" : ""}`}
              style={{ left: (drop?.frame ?? 0) * pixels, width: Math.max(8, (drop?.durationFrames ?? 0) * pixels) }} aria-hidden="true"/>
          </div>
        </TrackMenu></motion.div>; })}</AnimatePresence>
        <div className="nle-track-space-row" data-nle-drop=""><div className="nle-track-label empty"/><div className="nle-track-space" style={{ width }}/></div>
        <div className={`nle-timeline-empty${visibleTracks.length ? "" : " visible"}`} style={{ left: timelineOrigin, width, height: trackPadding }}>从素材区拖入文件，开始剪辑</div>
        {marqueeBox && <div className="nle-marquee" style={marqueeBox} aria-hidden="true"/>}
        <AnimatePresence initial={false}>{insertion !== undefined && <motion.div {...fadeMotion(reduced)}
          className="nle-track-insertion" style={{ top: insertion }} />}</AnimatePresence>
        <div className="nle-timeline-guides" style={{ "--nle-playhead-x": `${labelWidth + playheadPosition}px` } as React.CSSProperties}>
          {guide !== undefined && guide !== frame && <div className="nle-snap-line" style={{ left: timelineOrigin + guide * pixels }}/>}
          <div className={`nle-playhead${playheadSnap}`}/>
          <div className={`nle-playhead-control${playheadSnap}`} style={{ visibility: playheadVisible ? undefined : "hidden" }}>
            <button className={seek.active ? "active" : ""} aria-label="播放头" onPointerDown={event => seek.start(event, frame)}/>
          </div>
        </div>
      </div>
    </motion.div>
    {itemGesture.floating.map(item => <div key={item.id} className="nle-floating-preview" aria-hidden="true"
      style={{ position: "fixed", left: item.left, top: item.top, width: item.width, height: item.height, pointerEvents: "none" }}>
      <div className={`nle-clip nle-clip-ghost ${item.role}`} style={{ inset: 0, height: item.height }}>
        {item.picture !== undefined && <FloatingFilmstrip picture={item.picture}/>}
        <span className="nle-clip-title"><span className="nle-clip-chip">{item.title}</span></span>
      </div>
    </div>)}
  </motion.section>;
}
