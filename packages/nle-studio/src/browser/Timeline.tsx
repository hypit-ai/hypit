import type { NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/view";
import {
  AudioLines, Blend, CircleMinus, CirclePlus, Film, Group, Layers, Link2, Lock, Magnet,
  PanelLeftClose, PanelRightClose, Plus, Redo2, Scan, Scissors, Trash2, Type, Undo2, Unlock,
  Volume2, VolumeX,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { enterMotion, fadeMotion } from "./motion.js";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { NleStudioMediaEntry, NleStudioSession } from "../protocol.js";
import { CompositionActions } from "./CompositionActions.js";
import { CompoundMenu } from "./CompoundMenu.js";
import { TrackMenu } from "./TrackMenu.js";
import { frameOf, trackGaps } from "./editPlans.js";
import { ClipMenu } from "./ClipMenu.js";
import { IconButton } from "./common.js";
import { timecode } from "./timecode.js";
import { labelWidth, maxZoom, minZoom, rowHeight, rowSize, rulerHeight, timelineRows } from "./timelineGeometry.js";
import { ToolSelector, type TimelineTool } from "./ToolSelector.js";
import { useTimelineSeek } from "./useTimelineSeek.js";
import { useTimelineZoom } from "./useTimelineZoom.js";
import { useTrackReorder } from "./useTrackReorder.js";
import { useItemGesture, type ItemMovePlan } from "./useItemGesture.js";
import { directionalSelection, editableSelection, selectionAtFrame } from "./selection.js";
import { useMarqueeSelection } from "./useMarqueeSelection.js";
import { useTimelineViewport } from "./useTimelineViewport.js";
import type { MediaDrop } from "./mediaDrag.js";

type Gesture = {
  readonly item: NleTimelineSceneItem;
  readonly mode: "trim-start" | "trim-end";
  readonly pointer: number;
  readonly startX: number;
  readonly originStart: number;
  readonly originDuration: number;
  readonly element: HTMLElement;
};

function clipClass(item: NleTimelineSceneItem, track: NleTimelineSceneTrack): string {
  if (item.role === "adjust") return "effect";
  if (track.kind === "audio") return "audio";
  if (item.source === "composition") return "compound";
  return item.display.layers.some(layer => layer.kind === "text") ? "text" : "visual";
}

export function Timeline({ session, frame, selection, busy, onSeek, onSelect, onMove, onTrim, onSplit, onRemove,
  onTrackEnabled, onTrackLocked, onTrackMove, onComposition, onAddTrack, onToggleGroup, canToggleGroup, grouped,
  onDetachAudio, canDetachAudio, onUndo, onRedo, draggedMedia, mediaDrop: drop, onTrimSelection, canUndo, canRedo, onCreateCompound, onDuplicateCompound, onUnpackCompound, onRippleRemove, onCloseGaps, onTrackRename, onTrackRemove, onTrackHeight, onSelectTransition, selectedTransition, primaryTrack, onTrackMagnet, onCompositionCreate, onCompositionEdit, onCompositionRoot, onCompositionRemove, ref }: {
  readonly onCompositionCreate: (name: string, canvas: { width: number; height: number }) => void;
  readonly onCompositionEdit: (name: string, canvas: { width: number; height: number }) => void;
  readonly onCompositionRoot: () => void;
  readonly onCompositionRemove: () => void;
  readonly selectedTransition: string | undefined;
  readonly onSelectTransition: (id: string) => void;
  readonly primaryTrack: string | undefined;
  readonly onTrackMagnet: (track: string) => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onCreateCompound: () => void;
  readonly onDuplicateCompound: (id: string) => void;
  readonly onUnpackCompound: (id: string) => void;
  readonly onRippleRemove: (ids: readonly string[]) => void;
  readonly onCloseGaps: (track: string, at?: number) => void;
  readonly onTrackRename: (track: string, name: string) => void;
  readonly onTrackRemove: (track: string) => void;
  readonly onTrackHeight: (track: string, height: number | null) => void;
  readonly ref?: Ref<HTMLElement>;
  readonly session: NleStudioSession;
  readonly frame: number;
  readonly selection: readonly string[];
  readonly busy: boolean;
  readonly onSeek: (frame: number) => void;
  readonly onSelect: (ids: readonly string[]) => void;
  readonly onMove: (plan: ItemMovePlan) => void;
  readonly onTrim: (item: NleTimelineSceneItem, edge: "start" | "end", atFrame: number) => void;
  readonly onSplit: (items: readonly NleTimelineSceneItem[], atFrame: number) => void;
  readonly onTrimSelection: (items: readonly NleTimelineSceneItem[], edge: "start" | "end", atFrame: number) => void;
  readonly onRemove: () => void;
  readonly onTrackEnabled: (track: string, enabled: boolean) => void;
  readonly onTrackLocked: (track: string, locked: boolean) => void;
  readonly onTrackMove: (track: string, before?: string) => void;
  readonly onComposition: (composition: string) => void;
  readonly onAddTrack: () => void;
  readonly onToggleGroup: () => void;
  readonly canToggleGroup: boolean;
  readonly grouped: boolean;
  readonly onDetachAudio: () => void;
  readonly canDetachAudio: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly draggedMedia: NleStudioMediaEntry | undefined;
  readonly mediaDrop: MediaDrop | undefined;
}) {
  const reduced = useReducedMotion();
  const scene = session.open.timeline, fps = scene.editRate.numerator / scene.editRate.denominator;
  const scroller = useRef<HTMLDivElement>(null);
  const viewport = useTimelineViewport(scroller, labelWidth);
  const { zoom, changeZoom } = useTimelineZoom(scroller, labelWidth, `${session.open.project.project.id}/${session.projectDocument.path}/${scene.composition}`);
  const pixels = zoom / fps;
  const [snap, setSnap] = useState(true), [tool, setTool] = useState<TimelineTool>("select");
  const [draft, setDraft] = useState<{ readonly id: string; readonly start: number; readonly duration: number }>();
  const [cutCursor, setCutCursor] = useState<{ readonly track: string; readonly frame: number }>();
  const knownTracks = useRef(new Set(scene.tracks.map(track => track.id)));
  const [emptyDestinations, setEmptyDestinations] = useState<ReadonlySet<string>>(() => new Set());
  useLayoutEffect(() => {
    const currentEmpty = new Set(scene.tracks.filter(track => track.items.length === 0).map(track => track.id));
    const added = [...currentEmpty].filter(id => !knownTracks.current.has(id));
    knownTracks.current = new Set(scene.tracks.map(track => track.id));
    setEmptyDestinations(previous => {
      const next = new Set([...previous].filter(id => currentEmpty.has(id)));
      for (const id of added) next.add(id);
      return next.size === previous.size && [...next].every(id => previous.has(id)) ? previous : next;
    });
  }, [scene.tracks]);
  const rows = useMemo(() => timelineRows(scene, session.open.view.view, primaryTrack,
    new Set([...emptyDestinations, ...(drop?.track ? [drop.track] : [])])), [scene, session.open.view.view, primaryTrack, emptyDestinations, drop?.track]);
  const cancelTrim = useRef<() => void>(() => undefined);
  const draftRef = useRef<typeof draft>(undefined), gesture = useRef<Gesture | undefined>(undefined);
  const seek = useTimelineSeek(scroller, pixels, labelWidth, frame, onSeek);
  const marquee = useMarqueeSelection(scene, scroller, selection, onSelect, busy, pixels);
  const reorder = useTrackReorder(scroller, scene.tracks, rows, session.open.status.projectRevision, busy, onTrackMove);
  const itemGesture = useItemGesture({ scene, rows, scroller, pixels, frame, snap, busy, selection, onSelect, onMove });
  const visibleWidth = Math.max(600, viewport.right - viewport.left);
  const width = Math.max(scene.maximumFrame * pixels, frame * pixels, viewport.right) + visibleWidth;
  const tracksHeight = rows.reduce((height, track) => height + rowSize(track), 0);
  const trackPadding = Math.max(rowHeight, (viewport.height - rulerHeight - tracksHeight) / 2);
  const selected = scene.tracks.flatMap(track => track.items).find(item => selection.includes(item.id));
  const composition = session.open.project.project.compositions.find(value => value.id === scene.composition)!;
  const projectSelected = composition.tracks.flatMap(track => track.items).find(item => item.id === selected?.id);
  const nestedComposition = projectSelected?.kind === "present" && projectSelected.source === "composition"
    ? projectSelected.composition : undefined;
  const sceneItems = new Map(scene.tracks.flatMap(track => track.items.map(item => [item.id, item] as const)));
  const splitItems = selectionAtFrame(scene, selection, frame, "split");
  const trimStartItems = selectionAtFrame(scene, selection, frame, "trimStart");
  const trimEndItems = selectionAtFrame(scene, selection, frame, "trimEnd");
  const stepFrames = Math.max(1, Math.round(([1, 2, 5, 10, 30, 60, 120, 300, 600].find(value => value * zoom >= 78) ?? 1200) * fps));
  const ticks = useMemo(() => Array.from({ length: Math.ceil(width / (stepFrames * pixels)) + 1 }, (_, index) => index * stepFrames), [width, stepFrames, pixels]);
  const zoomPosition = Math.log(zoom / minZoom) / Math.log(maxZoom / minZoom) * 100;
  const compositions = session.open.project.project.compositions;

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || (event.target as Element | null)?.closest("input,textarea,select,[contenteditable=true]") || document.querySelector("[role=dialog],[role=menu]")) return;
      const next: TimelineTool | undefined = event.code === "KeyA" || event.key === "Escape" ? "select" : event.code === "KeyB" ? "cut" : event.code === "BracketLeft" ? "left" : event.code === "BracketRight" ? "right" : undefined;
      if (next) { event.preventDefault(); cancelTrim.current(); setTool(next); setCutCursor(undefined); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => () => cancelTrim.current(), [scene, pixels, busy]);

  const begin = (event: React.PointerEvent<HTMLElement>, item: NleTimelineSceneItem, mode: "move" | Gesture["mode"], track: NleTimelineSceneTrack) => {
    if (busy || event.button !== 0) return;
    event.stopPropagation();
    const localFrame = item.startFrame + Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels);
    if (tool === "cut") {
      const items = selectionAtFrame(scene, [item.id], localFrame, "split");
      if (items.length) onSplit(items, localFrame);
      return;
    }
    if (tool === "left" || tool === "right") { onSelect(directionalSelection(scene, localFrame, tool)); return; }
    if (mode === "move") { itemGesture.start(event, item, track); return; }
    onSelect(editableSelection(scene, event.metaKey || event.ctrlKey ? [...selection, item.id] : [item.id]));
    if (track.locked || (mode === "trim-start" && !item.affordances.trimStart) || (mode === "trim-end" && !item.affordances.trimEnd)) return;
    const element = event.currentTarget;
    cancelTrim.current();
    element.setPointerCapture(event.pointerId);
    gesture.current = { item, mode, pointer: event.pointerId, startX: event.clientX, originStart: item.startFrame, originDuration: item.durationFrames, element };
    const move = (next: PointerEvent) => {
      const current = gesture.current; if (!current || next.pointerId !== current.pointer) return;
      let delta = Math.round((next.clientX - current.startX) / pixels);
      if (snap && !next.altKey) {
        const edge = current.originStart + (current.mode === "trim-end" ? current.originDuration : 0);
        const boundary = [0, frame, ...scene.tracks.flatMap(row => row.items.filter(candidate => candidate.id !== item.id)
          .flatMap(candidate => [candidate.startFrame, candidate.startFrame + candidate.durationFrames]))]
          .filter(value => Math.abs(value - edge - delta) * pixels <= 7)
          .sort((a, b) => Math.abs(a - edge - delta) - Math.abs(b - edge - delta))[0];
        if (boundary !== undefined) delta = boundary - edge;
      }
      if (current.mode === "trim-start") {
        const start = Math.max(0, Math.min(current.originStart + current.originDuration - 1, current.originStart + delta));
        draftRef.current = { id: item.id, start, duration: current.originDuration + current.originStart - start };
      } else draftRef.current = { id: item.id, start: current.originStart, duration: Math.max(1, current.originDuration + delta) };
      setDraft(draftRef.current);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key); window.removeEventListener("blur", cleanup);
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      gesture.current = undefined; draftRef.current = undefined; setDraft(undefined);
      cancelTrim.current = () => undefined;
    };
    const finish = (next: PointerEvent) => {
      const current = gesture.current; if (!current || next.pointerId !== current.pointer) return;
      move(next); const accepted = draftRef.current; cleanup();
      if (!accepted) return;
      onTrim(current.item, current.mode === "trim-start" ? "start" : "end", current.mode === "trim-start" ? accepted.start : accepted.start + accepted.duration);
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
    const update = (clientX: number) => changeZoom(minZoom * (maxZoom / minZoom) ** Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)));
    event.preventDefault(); update(event.clientX);
    const move = (next: PointerEvent) => update(next.clientX);
    const finish = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish);
  };

  return <motion.section ref={ref} className="nle-timeline" {...enterMotion(reduced)}>
    <div className="nle-timeline-tabbar"><div className="nle-timeline-tabs" role="tablist"><AnimatePresence initial={false}>{compositions.map(composition => <motion.div {...fadeMotion(reduced)} className={`nle-timeline-tab${composition.id === scene.composition ? " current" : ""}`} key={composition.id}><button type="button" role="tab" aria-selected={composition.id === scene.composition} title={composition.name} onClick={() => onComposition(composition.id)}>{composition.name}</button></motion.div>)}</AnimatePresence></div><CompositionActions composition={composition} disabled={busy} root={session.open.project.project.rootComposition === scene.composition} referenced={compositions.some(value => value.tracks.some(track => track.items.some(item => item.kind === "present" && item.source === "composition" && item.composition === scene.composition)))} onCreate={onCompositionCreate} onEdit={onCompositionEdit} onRoot={onCompositionRoot} onRemove={onCompositionRemove}/></div>
    <div className="nle-timeline-toolbar">
      <ToolSelector value={tool} onChange={value => { cancelTrim.current(); itemGesture.cancel(); marquee.cancel(); setTool(value); setCutCursor(undefined); }}/>
      <IconButton label="新建轨道" disabled={busy} onClick={onAddTrack}><Plus size={18} strokeWidth={1.6}/></IconButton><span className="nle-toolbar-separator"/>
      <IconButton label="撤销" disabled={busy || !canUndo} onClick={onUndo}><Undo2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="重做" disabled={busy || !canRedo} onClick={onRedo}><Redo2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="分割" disabled={busy || !splitItems.length} onClick={() => onSplit(splitItems, frame)}><Scissors size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="向左裁剪" disabled={busy || !trimStartItems.length} onClick={() => onTrimSelection(trimStartItems, "start", frame)}><PanelLeftClose size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="向右裁剪" disabled={busy || !trimEndItems.length} onClick={() => onTrimSelection(trimEndItems, "end", frame)}><PanelRightClose size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="删除" disabled={busy || !editableSelection(scene, selection).length} onClick={onRemove}><Trash2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="分离音频" disabled={busy || !canDetachAudio} onClick={onDetachAudio}><AudioLines size={18} strokeWidth={1.6}/></IconButton>
      <CompoundMenu disabled={busy || !editableSelection(scene, selection).length} selected={selection.length > 0} nested={Boolean(nestedComposition) && selection.length === 1} onCreate={onCreateCompound} onOpen={() => nestedComposition && onComposition(nestedComposition)} onDuplicate={() => selected && onDuplicateCompound(selected.id)} onUnpack={() => selected && onUnpackCompound(selected.id)}/>
      <IconButton label={grouped ? "取消组合" : "组合"} className={grouped ? "active" : ""} disabled={busy || !canToggleGroup} onClick={onToggleGroup}><Group size={18} strokeWidth={1.6}/></IconButton><span className="nle-toolbar-space"/>
      <IconButton label="吸附" className={snap ? "active" : ""} onClick={() => setSnap(value => !value)}><Magnet size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="适合时间线" onClick={() => changeZoom(((scroller.current?.clientWidth ?? 1000) - labelWidth - 40) / Math.max(1, scene.maximumFrame / fps), true)}><Scan size={18} strokeWidth={1.6}/></IconButton>
      <div className="nle-zoom"><IconButton label="缩小" disabled={zoom <= minZoom} onClick={() => changeZoom(zoom / 1.25)}><CircleMinus size={18} strokeWidth={1.6}/></IconButton><div className="nle-zoom-slider" onPointerDown={startZoomDrag}><span className="nle-zoom-rail" aria-hidden="true" style={{ "--fill": `${zoomPosition}%` } as React.CSSProperties}/><input type="range" aria-label="时间线缩放" min="0" max="100" step="any" value={zoomPosition} onChange={event => changeZoom(minZoom * (maxZoom / minZoom) ** (Number(event.target.value) / 100))}/></div><IconButton label="放大" disabled={zoom >= maxZoom} onClick={() => changeZoom(zoom * 1.25)}><CirclePlus size={18} strokeWidth={1.6}/></IconButton></div>
    </div>
    <div className={`nle-timeline-scroll${tool === "cut" ? " cut-mode" : tool === "left" || tool === "right" ? " direction-mode" : ""}`} ref={scroller} onPointerDown={event => {
      if (tool === "select") marquee.start(event);
      else if ((tool === "left" || tool === "right") && !(event.target as Element).closest(".nle-clip,.nle-track-label,.nle-ruler,button")) {
        const bounds = event.currentTarget.getBoundingClientRect(); onSelect(directionalSelection(scene, Math.max(0, Math.round((event.clientX - bounds.left - labelWidth + event.currentTarget.scrollLeft) / pixels)), tool));
      }
    }} onPointerLeave={() => setCutCursor(undefined)} data-frame-pixels={pixels} data-snap={snap}>
      <div className="nle-tracks" style={{ width: labelWidth + width, minHeight: Math.max(viewport.height, rulerHeight + tracksHeight + trackPadding * 2), "--nle-track-padding": `${trackPadding}px` } as React.CSSProperties}>
        <div className="nle-ruler"><div className="nle-ruler-label"/><div className="nle-ruler-scale" style={{ width }} onPointerDown={seek.start}>{ticks.map(value => <span key={value} style={{ left: value * pixels, "--minor": `${stepFrames * pixels / 2}px` } as React.CSSProperties}>{timecode(value, fps)}</span>)}<i className={`nle-ruler-frame${pixels >= 8 ? " visible" : ""}`} style={{ left: frame * pixels, width: pixels }}/></div></div>
        <div className="nle-track-top"><div className="nle-track-label empty"/><div className="nle-track-space" data-nle-drop="" style={{ width }}/></div>
        <AnimatePresence initial={false}>{rows.map(track => <TrackMenu key={track.id} name={track.name} primary={primaryTrack === track.id} picture={track.kind === "picture"} onMagnet={() => onTrackMagnet(track.id)} disabled={busy || track.locked} pixels={pixels} gaps={trackGaps(composition.tracks.find(value => value.id === track.id)!).map(range => ({ start: frameOf(session, range.start), end: frameOf(session, range.end) }))} onCloseGaps={at => onCloseGaps(track.id, at)} onRename={name => onTrackRename(track.id, name)} onRemove={() => onTrackRemove(track.id)} onHeight={height => onTrackHeight(track.id, height)}><motion.div {...fadeMotion(reduced)} className={`nle-track${rowSize(track) <= 36 ? " compact" : ""}${primaryTrack === track.id ? " main" : ""}${track.locked ? " locked" : ""}`} data-track-id={track.id} key={track.id} style={{ height: rowSize(track) }}>
          <div className={`nle-track-label${reorder.position?.trackId === track.id ? " reordering" : ""}`} data-reorderable={!track.locked && !busy} title={primaryTrack === track.id ? `${track.name} / 主轨道` : track.name} data-primary={primaryTrack === track.id || undefined} onPointerDown={event => reorder.start(event, track)}><span className="nle-track-icons"><span className="nle-track-kind">{primaryTrack === track.id ? <Magnet size={14}/> : track.items.every(item => item.role === "adjust") ? <Layers size={14}/> : track.kind === "audio" ? <AudioLines size={14}/> : track.items.some(item => item.display.layers.some(layer => layer.kind === "text")) ? <Type size={14}/> : <Film size={14}/>}</span>
            <IconButton label={track.locked ? "解锁轨道" : "锁定轨道"} className="nle-track-lock" disabled={busy} aria-pressed={track.locked} onClick={() => onTrackLocked(track.id, !track.locked)}>{track.locked ? <Lock size={14}/> : <Unlock size={14}/>}</IconButton>
            <IconButton label={track.enabled ? "停用轨道" : "启用轨道"} disabled={busy} onClick={() => onTrackEnabled(track.id, !track.enabled)}>{track.enabled ? <Volume2 size={14}/> : <VolumeX size={14}/>}</IconButton></span></div>
          <div className="nle-track-content" data-nle-drop={track.id} style={{ width }}>
            <AnimatePresence initial={false}>{track.items.map(item => { const current = draft?.id === item.id ? draft : { start: item.startFrame, duration: item.durationFrames }; const kind = clipClass(item, track); const preview = item.display.layers.find(layer => layer.kind === "preview" && layer.state === "ready"); const text = item.display.layers.find(layer => layer.kind === "text"); const projectItem = composition.tracks.flatMap(track => track.items).find(candidate => candidate.id === item.id); const menuIds = editableSelection(scene, selection.includes(item.id) ? selection : [item.id]); const split = selectionAtFrame(scene, menuIds, frame, "split"), left = selectionAtFrame(scene, menuIds, frame, "trimStart"), right = selectionAtFrame(scene, menuIds, frame, "trimEnd"); return <ClipMenu key={item.id} disabled={busy || track.locked} canSplit={split.length > 0} canTrimStart={left.length > 0} canTrimEnd={right.length > 0} onSelect={() => onSelect(menuIds)} onSplit={() => onSplit(split, frame)} onTrimStart={() => onTrimSelection(left, "start", frame)} onTrimEnd={() => onTrimSelection(right, "end", frame)} onRemove={() => onRemove()} onRippleRemove={() => onRippleRemove(menuIds)} {...(projectItem?.kind === "present" && projectItem.source === "composition" ? { onOpen: () => onComposition(projectItem.composition), onDuplicate: () => onDuplicateCompound(item.id), onUnpack: () => onUnpackCompound(item.id) } : {})}><motion.div {...fadeMotion(reduced)} data-clip-id={item.id} role="button" tabIndex={0} aria-label={item.display.title} aria-pressed={selection.includes(item.id)} className={`nle-clip ${kind}${selection.includes(item.id) ? " selected" : ""}${itemGesture.gesture?.ids.includes(item.id) ? " drag-origin" : ""}`} style={{ left: current.start * pixels, width: Math.max(8, current.duration * pixels) }} onPointerDown={event => begin(event, item, "move", track)} onDoubleClick={() => { if (projectItem?.kind === "present" && projectItem.source === "composition") onComposition(projectItem.composition); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onSelect(editableSelection(scene, [item.id])); } }} onPointerMove={event => {
              if (tool !== "cut" || busy || track.locked) return; const at = item.startFrame + Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels); setCutCursor(item.affordances.split && at > item.startFrame && at < item.startFrame + item.durationFrames ? { track: track.id, frame: at } : undefined);
            }} onPointerLeave={() => setCutCursor(undefined)}>
              <span className="nle-clip-title"><span className="nle-clip-chip">{item.group && <Group size={11}/>} {composition.mattes.some(matte => matte.content === item.id || matte.matte === item.id) && <Link2 size={11}/>} {item.source === "composition" && <Layers size={11}/>} {item.display.title}</span>{kind !== "text" && <span className="nle-clip-chip">{timecode(current.duration, fps)}</span>}</span>
              {preview?.kind === "preview" && preview.state === "ready" && <span className="nle-clip-thumbnails"><img src={preview.resource} style={{ left: 0, width: "100%" }}/></span>}
              {text?.kind === "text" && <span className="nle-clip-text">{text.text}</span>}
              {item.affordances.trimStart && <div className="nle-trim start" aria-label="裁剪开头" onPointerDown={event => begin(event, item, "trim-start", track)}/>} {item.affordances.trimEnd && <div className="nle-trim end" aria-label="裁剪结尾" onPointerDown={event => begin(event, item, "trim-end", track)}/>}<div className={`nle-cut-line${tool === "cut" && cutCursor?.track === track.id && cutCursor.frame >= item.startFrame && cutCursor.frame <= item.startFrame + item.durationFrames ? " visible" : ""}`} style={{ left: ((cutCursor?.frame ?? item.startFrame) - item.startFrame) * pixels }}/>
            </motion.div></ClipMenu>; })}</AnimatePresence>
            <AnimatePresence initial={false}>{composition.transitions.flatMap(transition => {
              const outgoing = sceneItems.get(transition.outgoing), incoming = sceneItems.get(transition.incoming);
              if (outgoing?.track !== track.id || incoming === undefined) return [];
              const start = incoming.startFrame, end = outgoing.startFrame + outgoing.durationFrames;
              return end <= start ? [] : [<motion.button {...fadeMotion(reduced)} key={transition.id} className={`nle-transition-block${selectedTransition === transition.id ? " selected" : ""}`} style={{ left: start * pixels, width: Math.max(10, (end - start) * pixels) }} title={transition.operator.symbol} onPointerDown={event => event.stopPropagation()} onClick={() => { onSelect([transition.outgoing, transition.incoming]); onSeek(Math.floor((start + end) / 2)); onSelectTransition(transition.id); }}><Blend size={12}/></motion.button>];
            })}</AnimatePresence>
            <div className={`nle-clip nle-clip-ghost studio-media-drop ${track.kind === "audio" ? "audio" : "visual"}${drop?.track === track.id ? " visible" : ""}`} style={{ left: (drop?.frame ?? 0) * pixels, width: Math.max(8, (draggedMedia?.durationFrames ?? fps * 5) * pixels) }}><span className="nle-clip-title">{draggedMedia?.name}</span></div>
          </div>
        </motion.div></TrackMenu>)}</AnimatePresence>
        <div className="nle-track-space-row"><div className="nle-track-label empty"/><div className="nle-track-space" data-nle-drop="" style={{ width }}/></div>
        <div className={`nle-timeline-empty${rows.length === 0 ? " visible" : ""}`} style={{ left: labelWidth, width, height: trackPadding }}>从素材区拖入文件，开始剪辑</div>
        <div className={`nle-marquee${marquee.box?.visible ? " visible" : ""}`} style={marquee.box ?? { width: 0, height: 0 }}/>
        <div className={`nle-track-insertion${reorder.position || itemGesture.gesture?.insertionTop !== undefined ? " visible" : ""}`} style={{ top: reorder.position?.top ?? itemGesture.gesture?.insertionTop ?? 0 }}/>
        {itemGesture.gesture?.snapFrame !== undefined && <div className="nle-snap-line" style={{ left: labelWidth + itemGesture.gesture.snapFrame * pixels }}/>}
        <div className="nle-playhead" style={{ left: labelWidth + frame * pixels }}/><div className="nle-playhead-control" style={{ left: labelWidth + frame * pixels }}><button className={seek.active ? "active" : ""} aria-label="播放头" onPointerDown={seek.start}/></div>
      </div>
    </div>
    {itemGesture.gesture?.floating.map(item => <div key={item.id} className="nle-floating-preview" style={{ position: "fixed", left: item.left, top: item.top, width: item.width, height: item.height, pointerEvents: "none" }}><div className={`nle-clip nle-clip-ghost ${item.kind}`} style={{ inset: 0, height: item.height }}><span className="nle-clip-title"><span className="nle-clip-chip">{item.title}</span></span></div></div>)}
  </motion.section>;
}
