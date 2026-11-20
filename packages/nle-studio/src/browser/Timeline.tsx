import type { NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/view";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import {
  ArrowLeft, AudioLines, Blend, Captions, CircleMinus, CirclePlus, ClipboardCheck, Crop, Film, Group, Layers, Link2, Lock, Magnet,
  PanelLeftClose, PanelRightClose, Plus, Redo2, Scan, Scissors, Snowflake, Trash2, Type, Undo2, Unlock,
  Volume2, VolumeX,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { NleStudioOpenProjection, NleStudioProcessAddress, NleStudioProcessEdit, NleStudioTrimRange } from "../protocol.js";
import { IconButton } from "./common.js";
import { timecode } from "./timecode.js";
import { defaultMaxZoom, emptyTimelineMinZoom, labelWidth, rowHeight, rowSize, rulerHeight, snapTimelineEdges, timelineEndPadding, timelineSnapBoundaries } from "./timelineGeometry.js";
import { ToolSelector, type TimelineTool } from "./ToolSelector.js";
import { useTimelineSeek } from "./useTimelineSeek.js";
import { useTimelineZoom } from "./useTimelineZoom.js";
import { useTrackReorder } from "./useTrackReorder.js";
import { useItemGesture, type ItemDropIntent } from "./useItemGesture.js";
import { TimelineMedia, useTimelineMedia } from "./TimelineMedia.js";
import { TimelineRuler } from "./TimelineRuler.js";

import { readDropDestination } from "./api.js";
import { useTimelineViewport } from "./useTimelineViewport.js";
import type { MediaDrop } from "./mediaDrag.js";
import type { NleStudioDropDestination } from "../protocol.js";
import { CompositionActions } from "./CompositionActions.js";
import { CompoundMenu } from "./CompoundMenu.js";
import { TrackMenu } from "./TrackMenu.js";
import { ClipMenu } from "./ClipMenu.js";
import { directionalSelection, editableSelection, selectionAtFrame } from "./selection.js";
import { fadeMotion, softEase } from "./motion.js";

import { useMarqueeSelection } from "./useMarqueeSelection.js";

type Gesture = {
  readonly item: NleTimelineSceneItem;
  readonly mode: "trim-start" | "trim-end";
  readonly pointer: number;
  readonly startX: number;
  readonly originStart: number;
  readonly originDuration: number;
  readonly range: NleStudioTrimRange;
};

function clipClass(item: NleTimelineSceneItem, track: NleTimelineSceneTrack, isText: boolean): string {
  if (item.role === "adjust") return "effect";
  if (track.kind === "audio") return "audio";
  if (track.role === "subtitle" || isText) return "text";
  if (item.source === "composition") return "compound";
  return "visual";
}

function ProcessTimingHandle({ timing, duration, pixels, disabled, onSelect, onResize }: {
  readonly timing: NleTimelineSceneItem["anchoredProcesses"][number];
  readonly duration: number;
  readonly pixels: number;
  readonly disabled: boolean;
  readonly onSelect: () => void;
  readonly onResize: (frames: number) => void;
}) {
  const [draft, setDraft] = useState<number>();
  const drag = useRef<{ pointer: number; x: number; frames: number }>(undefined);
  const visible = Math.min(duration, timing.durationFrames);
  const direction = timing.edge === "start" ? 1 : -1;
  const label = timing.edge === "start" ? "片头效果" : "片尾效果";
  const clamp = (frames: number) => Math.max(1, Math.min(Math.floor(duration), Math.round(frames)));
  const stop = () => { drag.current = undefined; setDraft(undefined); };
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
        drag.current = { pointer: event.pointerId, x: event.clientX, frames: visible };
        onSelect();
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (current?.pointer !== event.pointerId) return;
        setDraft(clamp(current.frames + direction * (event.clientX - current.x) / pixels));
      }}
      onPointerUp={event => {
        const current = drag.current;
        if (current?.pointer !== event.pointerId) return;
        const distance = direction * (event.clientX - current.x) / pixels;
        const next = clamp(current.frames + distance);
        stop();
        if (Math.abs(distance) >= 0.5 && next !== Math.round(current.frames)) onResize(next);
      }}
      onLostPointerCapture={stop} onPointerCancel={stop}
      onKeyDown={event => {
        const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const next = clamp(visible + delta * direction);
        if (next !== Math.round(visible)) onResize(next);
      }}/>
  </div>;
}

export function Timeline({ session, frame, selection, busy, onSeek, onSelect, onMove, onTrim, onSplit, onRemove, onApplyPastedGroups,
  onTrackEnabled, onTrackLocked, onTrackMove, onTrackRename, onTrackRemove, onTrackHeight, onCloseGap, onRippleRemove, onComposition,
  onCompositionCreate, onCompositionEdit, onCompositionRoot, onCompositionRemove, onEnterComposition, onReturnComposition,
  onCompound, onCompoundUnique, onCompoundExplode, onAddTrack, onToggleGroup, canToggleGroup, grouped,
  onDetachAudio, canDetachAudio, canUndo, canRedo, onUndo, onRedo, drop, canFreeze, onFreeze, selectedProcess, onSelectProcess, onProcessTiming, selectedTransition, onSelectTransition, ref }: {
  readonly ref?: Ref<HTMLElement>;
  readonly selectedTransition: string | undefined;
  readonly onSelectTransition: (id: string) => void;
  readonly session: NleStudioOpenProjection;
  readonly drop: MediaDrop | undefined;
  readonly canFreeze: boolean;
  readonly onFreeze: () => void;
  readonly onCompositionCreate: (name: string, canvas: { width: number; height: number }) => void;
  readonly onCompositionEdit: (name: string, canvas: { width: number; height: number }) => void;
  readonly onCompositionRoot: () => void;
  readonly onCompositionRemove: () => void;
  readonly onRippleRemove: (items: readonly NleTimelineSceneItem[]) => void;
  readonly onTrackRename: (track: string, name: string) => void;
  readonly onTrackRemove: (track: string) => void;
  readonly onTrackHeight: (track: string, height: number | null) => void;
  readonly onCloseGap: (track: string, atFrames: readonly number[]) => void;
  readonly onCompoundUnique: (item: string) => void;
  readonly onCompoundExplode: (item: string) => void;
  readonly frame: number;
  readonly selection: readonly string[];
  readonly busy: boolean;
  readonly onSeek: (frame: number) => void;
  readonly onSelect: (ids: readonly string[]) => void;
  readonly onMove: (intent: ItemDropIntent) => void;
  readonly onTrim: (items: readonly NleTimelineSceneItem[], edge: "start" | "end", atFrame: number) => void;
  readonly onSplit: (items: readonly string[], atFrame: number) => void;
  readonly onRemove: () => void;
  readonly onApplyPastedGroups: () => void;
  readonly onTrackEnabled: (track: string, enabled: boolean) => void;
  readonly onTrackLocked: (track: string, locked: boolean) => void;
  readonly onTrackMove: (track: string, before?: string) => void;
  readonly onComposition: (composition: string) => void;
  readonly onEnterComposition: (item: string) => void;
  readonly onReturnComposition: () => void;
  readonly onCompound: () => void;
  readonly onAddTrack: () => void;
  readonly onToggleGroup: () => void;
  readonly canToggleGroup: boolean;
  readonly grouped: boolean;
  readonly onDetachAudio: () => void;
  readonly canDetachAudio: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly selectedProcess: NleStudioProcessAddress | undefined;
  readonly onSelectProcess: (address: NleStudioProcessAddress) => void;
  readonly onProcessTiming: (edit: NleStudioProcessEdit) => void;
}) {
  const scene = session.timeline.scene, fps = scene.editRate.numerator / scene.editRate.denominator;
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const scroller = useRef<HTMLDivElement>(null);
  const viewport = useTimelineViewport(scroller, labelWidth);
  const lastClipEnd = useMemo(() => scene.tracks.reduce((latest, track) => track.items.reduce(
    (end, item) => Math.max(end, item.startFrame + item.durationFrames), latest), 0), [scene.tracks]);
  const minZoom = lastClipEnd > 0
    ? Math.max(1, viewport.width - timelineEndPadding) * fps / (4 * lastClipEnd) : emptyTimelineMinZoom;
  const maxZoom = Math.max(defaultMaxZoom, 4 * minZoom);
  const { zoom, zoomPosition, changeZoom, changeZoomPosition, stepZoom } = useTimelineZoom(scroller, labelWidth, JSON.stringify([session.project.name, session.project.document, scene.composition]), minZoom, maxZoom);
  const [atTimelineStart, setAtTimelineStart] = useState(true);
  useLayoutEffect(() => setAtTimelineStart((scroller.current?.scrollLeft ?? 0) <= 0), []);
  const pixels = zoom / fps;
  const mediaViews = useTimelineMedia(scroller, session, pixels, labelWidth);
  const width = Math.max(viewport.width, (scene.maximumFrame + Math.ceil(fps * 15)) * pixels + timelineEndPadding);
  const endFrame = Math.floor((width - timelineEndPadding) / pixels);
  const [snap, setSnap] = useState(true), [tool, setTool] = useState<TimelineTool>("select");
  const [draft, setDraft] = useState<{ readonly id: string; readonly start: number; readonly duration: number; readonly snapFrame?: number }>();
  const [cutCursor, setCutCursor] = useState<{ readonly track: string; readonly frame: number }>();
  const draftRef = useRef<typeof draft>(undefined), gesture = useRef<Gesture | undefined>(undefined);
  const cancelTrim = useRef<() => void>(() => undefined);
  const snapBoundaries = useMemo(() => timelineSnapBoundaries(scene), [scene]);
  const textItems = useMemo(() => new Set(session.timeline.textItems), [session.timeline.textItems]);
  const seek = useTimelineSeek(scroller, pixels, labelWidth, frame, endFrame, snap ? snapBoundaries : undefined, onSeek);
  const marquee = useMarqueeSelection(scene, scroller, selection, onSelect, busy, pixels,
    at => onSeek(Math.max(0, Math.min(endFrame, at))));
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
  const visibleTracks = scene.tracks.filter(track => track.items.length > 0 || emptyDestinations.has(track.id));
  const reorder = useTrackReorder(scroller, scene.tracks, `${session.status.projectRevision}:${session.status.viewRevision}`, busy, onTrackMove);
  const itemGesture = useItemGesture({ scene, textItems, scroller, pixels, frame, snap, busy, selection, onSelect, onMove });
  const [resolvedDrop, setResolvedDrop] = useState<{ key: string; value: NleStudioDropDestination }>();
  const itemDrag = itemGesture.gesture;
  const intent = itemDrag?.intent;
  const dropIntent = intent === undefined ? undefined : JSON.stringify({
    ...intent, kind: "timeline.drop", composition: scene.composition,
    expectedProjectRevision: session.status.projectRevision, expectedViewRevision: session.status.viewRevision,
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
  const selected = scene.tracks.flatMap(track => track.items).find(item => selection.includes(item.id));
  const trimRanges = session.timeline.trimRanges;
  const trimAtFrame = (ids: readonly string[], edge: "start" | "end") =>
    selectionAtFrame(scene, ids, frame, edge === "start" ? "trimStart" : "trimEnd", item => {
      const range = trimRanges[item.id]?.[edge];
      return range !== undefined && frame >= range.minimum && frame <= range.maximum;
    });
  const trimStartItems = trimAtFrame(selection, "start"), trimEndItems = trimAtFrame(selection, "end");
  const nestedComposition = selected?.nestedComposition;
  const sceneItems = new Map(scene.tracks.flatMap(track => track.items.map(item => [item.id, item] as const)));
  const splitItems = selectionAtFrame(scene, selection, frame, "split");
  const compositions = session.timeline.compositions;
  const composition = compositions.find(item => item.id === scene.composition);

  useEffect(() => () => cancelTrim.current(), [pixels, busy, session.status.projectRevision, session.status.viewRevision]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!present || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey
        || (event.target as Element | null)?.closest("input,textarea,select,[contenteditable=true],[role=menu],[role=dialog]")) return;
      const next: TimelineTool | undefined = event.code === "KeyA" || event.key === "Escape" ? "select" : event.code === "KeyB" ? "cut" : event.code === "BracketLeft" ? "left" : event.code === "BracketRight" ? "right" : undefined;
      if (next) { if (event.key !== "Escape") event.preventDefault(); setTool(next); setCutCursor(undefined); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [present]);

  const begin = (event: React.PointerEvent<HTMLElement>, item: NleTimelineSceneItem, mode: "move" | Gesture["mode"], track: NleTimelineSceneTrack) => {
    if (busy || event.button !== 0) return;
    event.stopPropagation();
    const localFrame = item.startFrame + Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels);
    if (tool === "cut") {
      if (!track.locked && item.affordances.split && localFrame > item.startFrame && localFrame < item.startFrame + item.durationFrames) onSplit([item.id], localFrame);
      return;
    }
    if (tool === "left" || tool === "right") { onSelect(directionalSelection(scene, localFrame, tool)); return; }
    if (mode === "move") { itemGesture.start(event, item, track); return; }
    onSelect(event.metaKey || event.ctrlKey ? [...new Set([...selection, item.id])] : [item.id]);
    const range = trimRanges[item.id]?.[mode === "trim-start" ? "start" : "end"];
    if (track.locked || range === undefined) return;
    cancelTrim.current();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    gesture.current = { item, mode, pointer: event.pointerId, startX: event.clientX, originStart: item.startFrame, originDuration: item.durationFrames, range };
    const boundaries = timelineSnapBoundaries(scene, new Set([item.id]));
    const move = (next: PointerEvent) => {
      const current = gesture.current; if (!current || next.pointerId !== current.pointer) return;
      const delta = Math.round((next.clientX - current.startX) / pixels);
      const end = current.originStart + current.originDuration;
      const left = current.mode === "trim-start";
      const origin = left ? current.originStart : end;
      const proposed = Math.max(current.range.minimum, Math.min(current.range.maximum, origin + delta));
      const aligned = snap && !next.altKey ? snapTimelineEdges([proposed], frame, boundaries, pixels,
        value => proposed + value >= current.range.minimum && proposed + value <= current.range.maximum) : undefined;
      const at = Math.max(current.range.minimum, Math.min(current.range.maximum, Math.round(aligned?.frame ?? proposed)));
      const guide = aligned === undefined ? {} : { snapFrame: aligned.frame };
      const advances = delta < 0 ? at < origin : delta > 0 && at > origin;
      draftRef.current = !advances ? undefined : left
        ? { id: item.id, start: at, duration: end - at, ...guide }
        : { id: item.id, start: current.originStart, duration: at - current.originStart, ...guide };
      setDraft(draftRef.current);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key); window.removeEventListener("blur", cleanup);
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      cancelTrim.current = () => undefined;
      gesture.current = undefined; draftRef.current = undefined; setDraft(undefined);
    };
    const finish = (next: PointerEvent) => {
      const current = gesture.current; if (!current || next.pointerId !== current.pointer) return;
      move(next);
      const accepted = draftRef.current;
      cleanup();
      if (!accepted) return;
      onTrim([current.item], current.mode === "trim-start" ? "start" : "end",
        current.mode === "trim-start" ? accepted.start : Math.round(accepted.start + accepted.duration));
    };
    const cancel = (next: PointerEvent) => { if (next.pointerId === event.pointerId) cleanup(); };
    const key = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); cleanup(); } };
    cancelTrim.current = cleanup;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key); window.addEventListener("blur", cleanup);
  };

  const startZoomDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const update = (clientX: number) => changeZoomPosition(Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)));
    event.preventDefault(); update(event.clientX);
    const move = (next: PointerEvent) => update(next.clientX);
    const finish = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish);
  };

  return <motion.section ref={ref} className="nle-timeline" {...fadeMotion(reduced)} inert={!present}>
    <div className="nle-timeline-tabbar"><div className="nle-timeline-tabs" role="tablist"><AnimatePresence initial={false}>{compositions.map(composition => <motion.div {...fadeMotion(reduced)} className={`nle-timeline-tab${composition.id === scene.composition ? " current" : ""}`} key={composition.id}><button type="button" role="tab" disabled={busy} aria-selected={composition.id === scene.composition} title={composition.name} onClick={() => onComposition(composition.id)}>{composition.name}</button></motion.div>)}</AnimatePresence></div>
      {composition !== undefined && <CompositionActions composition={{ name: composition.name, canvas: session.canvas.canvas }}
        disabled={busy} root={composition.id === session.project.rootComposition} referenced={composition.referenced}
        onCreate={onCompositionCreate} onEdit={onCompositionEdit} onRoot={onCompositionRoot} onRemove={onCompositionRemove}/>}
    </div>
    <div className="nle-timeline-toolbar">
      <ToolSelector value={tool} onChange={value => { setTool(value); setCutCursor(undefined); }}/>
      <IconButton label="新建轨道" disabled={busy} onClick={onAddTrack}><Plus size={18} strokeWidth={1.6}/></IconButton><span className="nle-toolbar-separator"/>
      <IconButton label="撤销" disabled={busy || !canUndo} onClick={onUndo}><Undo2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="重做" disabled={busy || !canRedo} onClick={onRedo}><Redo2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="分割" disabled={busy || splitItems.length === 0} onClick={() => onSplit(splitItems.map(item => item.id), frame)}><Scissors size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="向左裁剪" disabled={busy || trimStartItems.length === 0} onClick={() => onTrim(trimStartItems, "start", frame)}><PanelLeftClose size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="向右裁剪" disabled={busy || trimEndItems.length === 0} onClick={() => onTrim(trimEndItems, "end", frame)}><PanelRightClose size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="删除" disabled={busy || (selected === undefined && selectedTransition === undefined)} onClick={onRemove}><Trash2 size={18} strokeWidth={1.6}/></IconButton>
      {session.clipboard.pendingGroups > 0 && <IconButton label="恢复粘贴分组" disabled={busy}
        onClick={onApplyPastedGroups}><ClipboardCheck size={18} strokeWidth={1.6}/></IconButton>}
      <IconButton label="分离音频" disabled={busy || !canDetachAudio} onClick={onDetachAudio}><AudioLines size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="裁剪画面" disabled><Crop size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="定格" disabled={busy || !canFreeze} onClick={onFreeze}><Snowflake size={18} strokeWidth={1.6}/></IconButton>
      <CompoundMenu disabled={busy} selected={selected !== undefined} nested={nestedComposition !== undefined && selection.length === 1}
        onCreate={onCompound} onOpen={() => selected && onEnterComposition(selected.id)}
        onDuplicate={() => selected && onCompoundUnique(selected.id)} onUnpack={() => selected && onCompoundExplode(selected.id)}/>
      <AnimatePresence initial={false}>{session.timeline.canReturn && <motion.span {...fadeMotion(reduced)} key="parent"><IconButton label="返回父 Composition" disabled={busy}
        onClick={onReturnComposition}><ArrowLeft size={18} strokeWidth={1.6}/></IconButton></motion.span>}</AnimatePresence>
      <IconButton label={grouped ? "取消组合" : "组合"} className={grouped ? "active" : ""} disabled={busy || !canToggleGroup} onClick={onToggleGroup}><Group size={18} strokeWidth={1.6}/></IconButton><span className="nle-toolbar-space"/>
      <IconButton label="吸附" className={snap ? "active" : ""} onClick={() => setSnap(value => !value)}><Magnet size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="适合时间线" onClick={() => changeZoom((viewport.width - 40) / (lastClipEnd > 0 ? lastClipEnd / fps : 1), true)}><Scan size={18} strokeWidth={1.6}/></IconButton>
      <div className="nle-zoom">
        <IconButton label="缩小" disabled={zoom <= minZoom} onClick={() => stepZoom(-1)}><CircleMinus size={18} strokeWidth={1.6}/></IconButton>
        <div className="nle-zoom-slider" onPointerDown={startZoomDrag}>
          <span className="nle-zoom-rail" aria-hidden="true" style={{ "--fill": `${zoomPosition * 100}%` } as React.CSSProperties}/>
          <input type="range" aria-label="时间线缩放" min="0" max="100" step="any" value={zoomPosition * 100}
            onChange={event => changeZoomPosition(Number(event.target.value) / 100)}/>
        </div>
        <IconButton label="放大" disabled={zoom >= maxZoom} onClick={() => stepZoom(1)}><CirclePlus size={18} strokeWidth={1.6}/></IconButton>
      </div>
    </div>
    <motion.div layoutScroll data-frame-pixels={pixels} data-snap={snap} data-at-start={atTimelineStart} className={`nle-timeline-scroll${tool === "cut" ? " cut-mode" : tool === "left" || tool === "right" ? " direction-mode" : ""}`} ref={scroller}
      onScroll={event => setAtTimelineStart(event.currentTarget.scrollLeft <= 0)} onPointerDown={event => {
      if (tool === "select") marquee.start(event);
      else if ((tool === "left" || tool === "right") && !(event.target as Element).closest(".nle-clip,.nle-track-label,.nle-ruler,button")) {
        const bounds = event.currentTarget.getBoundingClientRect(); onSelect(directionalSelection(scene, Math.max(0, Math.round((event.clientX - bounds.left - labelWidth + event.currentTarget.scrollLeft) / pixels)), tool));
      }
    }} onPointerLeave={() => setCutCursor(undefined)}>
      <div className="nle-tracks" style={{ width: labelWidth + width, minHeight: "100%", "--nle-track-padding": `${trackPadding}px` } as React.CSSProperties}>
        <TimelineRuler scroller={scroller} width={width} viewportWidth={viewport.width} endFrame={endFrame}
          pixels={pixels} fps={fps} frame={frame} onSeek={seek.start}/>
        <div className="nle-track-top" data-nle-drop=""><div className="nle-track-label empty"/><div className="nle-track-space" style={{ width }}/></div>
        <AnimatePresence initial={false} mode="popLayout">{visibleTracks.map(track => {
          const intervals = [...track.items].sort((left, right) => left.startFrame - right.startFrame);
          let end = 0;
          const gaps = intervals.flatMap(item => {
            const gap = Math.ceil(end) < Math.floor(item.startFrame) ? [{ start: Math.ceil(end), end: Math.floor(item.startFrame) }] : [];
            end = Math.max(end, item.startFrame + item.durationFrames);
            return gap;
          });
          const fade = fadeMotion(reduced);
          return <motion.div {...fade} layout={reduced ? false : "position"}
            transition={{ ...fade.transition, layout: { duration: reduced ? 0 : .22, ease: softEase } }}
            className={`nle-track${rowSize(track) === 36 ? " compact" : ""}${track.locked ? " locked" : ""}`}
            data-track-id={track.id} key={track.id} style={{ height: rowSize(track) }}>
          <TrackMenu name={track.name} disabled={busy || track.locked} pixels={pixels} gaps={gaps}
            onCloseGap={frames => onCloseGap(track.id, frames)} onRename={name => onTrackRename(track.id, name)}
            onRemove={() => onTrackRemove(track.id)}
            onHeight={track.role === undefined ? height => onTrackHeight(track.id, height) : undefined}>
          <div className={`nle-track-label${reorder.position?.trackId === track.id ? " reordering" : ""}`} data-reorderable={!track.locked && !busy} title={track.name} onPointerDown={event => reorder.start(event, track)}><span className="nle-track-icons"><span className="nle-track-kind">{track.role === "effect" ? <Layers size={14}/> : track.role === "subtitle" ? <Captions size={14}/> : track.role === "text" ? <Type size={14}/> : track.kind === "audio" ? <AudioLines size={14}/> : <Film size={14}/>}</span>
            <IconButton label={track.locked ? "解锁轨道" : "锁定轨道"} className="nle-track-lock" disabled={busy} aria-pressed={track.locked} onClick={() => onTrackLocked(track.id, !track.locked)}>{track.locked ? <Lock size={14}/> : <Unlock size={14}/>}</IconButton>
            <IconButton label={track.enabled ? "停用轨道" : "启用轨道"} disabled={busy} onClick={() => onTrackEnabled(track.id, !track.enabled)}>{track.enabled ? <Volume2 size={14}/> : <VolumeX size={14}/>}</IconButton></span></div>
          <div className="nle-track-content" data-drop-target={highlightedTrack === track.id ? "" : undefined} data-nle-drop={track.id} style={{ width }}>
            <AnimatePresence initial={false}>{track.items.map(item => {
              const current = draft?.id === item.id ? draft : { start: item.startFrame, duration: item.durationFrames };
              const kind = clipClass(item, track, textItems.has(item.id));
              const preview = item.display.layers.find(layer => layer.kind === "preview" && layer.state === "ready");
              const text = item.display.layers.find(layer => layer.kind === "text");
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
                <motion.div {...fadeMotion(reduced)} animate={{ opacity: itemGesture.gesture?.ids.includes(item.id) ? .25 : 1 }}
                  data-clip-id={item.id} role="button" tabIndex={0}
                  aria-label={item.display.title} aria-pressed={selection.includes(item.id)}
                  className={`nle-clip ${kind}${selection.includes(item.id) ? " selected" : ""}${itemGesture.gesture?.ids.includes(item.id) ? " drag-origin" : ""}`}
                  style={{ left: current.start * pixels, width: Math.max(8, current.duration * pixels) }}
                  onPointerDown={event => begin(event, item, "move", track)}
                  onDoubleClick={() => { if (!busy && item.nestedComposition !== undefined) onEnterComposition(item.id); }}
                  onKeyDown={event => { if (event.key === "Enter" && !busy) { event.preventDefault(); onSelect(editableSelection(scene, [item.id])); } }}
                  onPointerMove={event => {
              if (tool !== "cut" || busy || track.locked) return; const at = item.startFrame + Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels); setCutCursor(item.affordances.split && at > item.startFrame && at < item.startFrame + item.durationFrames ? { track: track.id, frame: at } : undefined);
            }} onPointerLeave={() => setCutCursor(undefined)}>
              <div className="nle-clip-content">
                <span className="nle-clip-title"><span className="nle-clip-chip">{item.group && <Group size={11}/>} {scene.mattes.some(matte => matte.content === item.id || matte.matte === item.id) && <Link2 size={11}/>} {item.source === "composition" && <Layers size={11}/>} {item.display.title}</span>{kind !== "text" && <span className="nle-clip-chip">{timecode(current.duration, fps)}</span>}</span>
                {preview?.kind === "preview" && preview.state === "ready" && <span className="nle-clip-thumbnails"><img src={preview.resource} style={{ left: 0, width: "100%" }}/></span>}
                {item.source === "media"
                  && <TimelineMedia views={mediaViews} item={item.id} start={current.start} frameWidth={pixels}/>}
                {text?.kind === "text" && <span className="nle-clip-text">{text.text}</span>}
                <div className={`nle-cut-line${tool === "cut" && cutCursor?.track === track.id && cutCursor.frame >= item.startFrame && cutCursor.frame <= item.startFrame + item.durationFrames ? " visible" : ""}`} style={{ left: ((cutCursor?.frame ?? item.startFrame) - item.startFrame) * pixels }}/>
                {timing !== undefined && selectedProcess !== undefined && <ProcessTimingHandle key={`${timing.medium}:${timing.id}`}
                  timing={timing} duration={current.duration} pixels={pixels} disabled={busy || track.locked}
                  onSelect={() => onSelectProcess(selectedProcess)}
                  onResize={durationFrames => onProcessTiming({ kind: "process.timing", ...selectedProcess, edge: timing.edge, durationFrames })}/>}
              </div>
              {trimRanges[item.id]?.start && <div className="nle-trim start" aria-label="裁剪开头" onPointerDown={event => begin(event, item, "trim-start", track)}/>}
              {trimRanges[item.id]?.end && <div className="nle-trim end" aria-label="裁剪结尾" onPointerDown={event => begin(event, item, "trim-end", track)}/>}
            </motion.div></ClipMenu>; })}</AnimatePresence>
            <AnimatePresence initial={false}>{scene.transitions.flatMap(transition => {
              const outgoing = sceneItems.get(transition.outgoing), incoming = sceneItems.get(transition.incoming);
              if (outgoing?.track !== track.id || incoming === undefined) return [];
              const start = incoming.startFrame, end = outgoing.startFrame + outgoing.durationFrames;
              return end <= start ? [] : [<motion.button {...fadeMotion(reduced)} key={transition.id} aria-pressed={selectedTransition === transition.id} className={`nle-transition-block${selectedTransition === transition.id ? " selected" : ""}`} style={{ left: start * pixels, width: Math.max(10, (end - start) * pixels) }} title={transition.operator.symbol} onPointerDown={event => event.stopPropagation()} onClick={() => { onSeek(Math.floor((start + end) / 2)); onSelectTransition(transition.id); }}><Blend size={12}/></motion.button>];
            })}</AnimatePresence>
            <div className={`nle-clip studio-media-drop${drop?.track === track.id && drop.durationFrames !== undefined ? " visible" : ""}`}
              style={{ left: (drop?.frame ?? 0) * pixels, width: Math.max(8, (drop?.durationFrames ?? 0) * pixels) }} aria-hidden="true"/>
          </div>
        </TrackMenu></motion.div>; })}</AnimatePresence>
        <div className="nle-track-space-row" data-nle-drop=""><div className="nle-track-label empty"/><div className="nle-track-space" style={{ width }}/></div>
        <div className={`nle-timeline-empty${visibleTracks.length ? "" : " visible"}`} style={{ left: labelWidth, width, height: trackPadding }}>从素材区拖入文件，开始剪辑</div>
        <div className={`nle-marquee${marquee.box?.visible ? " visible" : ""}`} style={marquee.box ?? { width: 0, height: 0 }}/>
        <AnimatePresence initial={false}>{insertion !== undefined && <motion.div {...fadeMotion(reduced)}
          className="nle-track-insertion" style={{ top: insertion }} />}</AnimatePresence>
        {guide !== undefined && guide !== frame && <div className="nle-snap-line" style={{ left: labelWidth + guide * pixels }}/>}
        <div className={`nle-playhead${playheadSnap}`} style={{ left: labelWidth + frame * pixels }}/><div className={`nle-playhead-control${playheadSnap}`} style={{ left: labelWidth + frame * pixels }}><button className={seek.active ? "active" : ""} aria-label="播放头" onPointerDown={seek.start}/></div>
      </div>
    </motion.div>
    <AnimatePresence>{itemGesture.gesture?.floating.map(item => <motion.div {...fadeMotion(reduced)} key={item.id} className="nle-floating-preview" style={{ position: "fixed", left: item.left, top: item.top, width: item.width, height: item.height, pointerEvents: "none" }}><div className={`nle-clip nle-clip-ghost ${item.kind}`} style={{ inset: 0, height: item.height }}><span className="nle-clip-title"><span className="nle-clip-chip">{item.title}</span></span></div></motion.div>)}</AnimatePresence>
  </motion.section>;
}
