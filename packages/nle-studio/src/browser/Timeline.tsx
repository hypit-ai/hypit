import { applyNleTransaction, type NleCommand } from "@hypit/nle";
import type { NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/view";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import {
  ArrowLeft, AudioLines, Blend, Captions, CircleMinus, CirclePlus, Film, Group, Layers, Link2, Lock, Magnet, Music, Snowflake,
  PanelLeftClose, PanelRightClose, Plus, Redo2, Scan, Scissors, SlidersHorizontal, Trash2, Type, Undo2, Unlock,
  Volume2, VolumeX,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { enterMotion, fadeMotion, softEase } from "./motion.js";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { NleStudioMediaEntry, NleStudioSession } from "../protocol.js";
import { CompositionActions } from "./CompositionActions.js";
import { CompoundMenu } from "./CompoundMenu.js";
import { TrackMenu } from "./TrackMenu.js";
import { createTrimConstraint, frameOf, magneticEdit, moveItemEditPlan, trackGaps, trimItemCommand } from "./editPlans.js";
import { ClipMenu } from "./ClipMenu.js";
import { ClipFilmstrip, ClipWaveform, CompoundFilmstrip } from "./ClipMedia.js";
import { clipMediaEntry } from "./clipMediaData.js";
import { IconButton } from "./common.js";
import { timecode } from "./timecode.js";
import { compactRowHeight, componentTrackRole, defaultMaxZoom, emptyTimelineMinZoom, labelWidth, rowHeight, rowSize, rulerHeight, snapTimelineEdges, timelineEndPadding, timelineRows, timelineSnapBoundaries } from "./timelineGeometry.js";
import { ToolSelector, type TimelineTool } from "./ToolSelector.js";
import { useTimelineSeek } from "./useTimelineSeek.js";
import { useTimelineZoom } from "./useTimelineZoom.js";
import { useTrackReorder } from "./useTrackReorder.js";
import { useItemGesture, type ItemMovePlan } from "./useItemGesture.js";
import { directionalSelection, editableSelection, selectionAtFrame } from "./selection.js";
import { useMarqueeSelection } from "./useMarqueeSelection.js";
import { useTimelineViewport } from "./useTimelineViewport.js";
import { componentFitsTrack, mediaFitsTrack, type MediaDrop } from "./mediaDrag.js";
import { catalogDragId } from "./catalogDrag.js";

type Gesture = {
  readonly item: NleTimelineSceneItem;
  readonly mode: "trim-start" | "trim-end";
  readonly pointer: number;
  readonly startX: number;
  readonly originStart: number;
  readonly originDuration: number;
  readonly element: HTMLElement;
};

/** Ruler labels: `m:ss` on whole seconds, `m:ss:ff` once steps fall below a second. */
function rulerLabel(frame: number, rate: number, frames: boolean): string {
  const totalSeconds = Math.floor(frame / rate), hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60, seconds = String(totalSeconds % 60).padStart(2, "0");
  const clock = hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
  return frames ? `${clock}:${String(frame % rate).padStart(2, "0")}` : clock;
}

const transitionNames: Readonly<Record<string, string>> = { CrossDissolve: "交叉溶解" };
/** Room left for the music icon at the head of an audio clip; the waveform starts after it. */
const waveformInset = 36;

function clipClass(item: NleTimelineSceneItem, track: NleTimelineSceneTrack): string {
  if (item.role === "adjust") return "effect";
  if (track.kind === "audio") return "audio";
  if (track.role === "subtitle") return "text";
  if (item.source === "composition") return "compound";
  return item.display.layers.some(layer => layer.kind === "text") ? "text" : "visual";
}

export function Timeline({ session, frame, selection, busy, onSeek, onSelect, onMove, onTrim, onSplit, onRemove, onFreeze, canFreeze,
  compositionParents, onEnterComposition, onReturnComposition, mediaDurationForItem,
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
  readonly mediaDurationForItem: (id: string) => ExactTemporalValue | undefined;
  readonly onSplit: (items: readonly NleTimelineSceneItem[], atFrame: number) => void;
  readonly onTrimSelection: (items: readonly NleTimelineSceneItem[], edge: "start" | "end", atFrame: number) => void;
  readonly onRemove: () => void;
  readonly onTrackEnabled: (track: string, enabled: boolean) => void;
  readonly onTrackLocked: (track: string, locked: boolean) => void;
  readonly onTrackMove: (track: string, before: string | undefined, displayOrder: readonly string[]) => void;
  readonly onComposition: (composition: string) => void;
  readonly compositionParents: readonly string[];
  readonly onEnterComposition: (composition: string) => void;
  readonly onReturnComposition: (composition: string) => void;
  readonly canFreeze: boolean;
  readonly onFreeze: () => void;
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
  const lastClipEnd = useMemo(() => scene.tracks.reduce((latest, track) => track.items.reduce(
    (end, item) => Math.max(end, item.startFrame + item.durationFrames), latest), 0), [scene.tracks]);
  const minZoom = lastClipEnd > 0 ? Math.max(1, viewport.width - timelineEndPadding) * fps / (4 * lastClipEnd) : emptyTimelineMinZoom;
  const maxZoom = Math.max(defaultMaxZoom, 4 * minZoom);
  const { zoom, zoomPosition, changeZoom, changeZoomPosition, stepZoom } = useTimelineZoom(scroller, labelWidth,
    `${session.open.project.project.id}/${session.projectDocument.path}/${scene.composition}`, minZoom, maxZoom);
  const pixels = zoom / fps;
  const [snap, setSnap] = useState(true), [tool, setTool] = useState<TimelineTool>("select");
  const [draft, setDraft] = useState<{ readonly id: string; readonly edge: "start" | "end"; readonly start: number; readonly duration: number; readonly snapFrame?: number }>();
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
  const width = Math.max(viewport.width, (scene.maximumFrame + Math.ceil(fps * 15)) * pixels + timelineEndPadding);
  const endFrame = Math.floor((width - timelineEndPadding) / pixels);
  const snapBoundaries = useMemo(() => timelineSnapBoundaries(scene), [scene]);
  const seek = useTimelineSeek(scroller, pixels, labelWidth, frame, endFrame, snap ? snapBoundaries : undefined, onSeek);
  const marquee = useMarqueeSelection(scene, scroller, selection, onSelect, busy, pixels);
  const reorder = useTrackReorder(scroller, scene.tracks, rows, session.open.status.projectRevision, busy, onTrackMove);
  const itemGesture = useItemGesture({ scene, rows, scroller, pixels, frame, snap, busy, selection, onSelect, onMove });
  const itemDrag = itemGesture.gesture;
  const movePlan = itemDrag?.plan;
  const editPreview = useMemo(() => {
    try {
      const commands: readonly NleCommand[] | undefined = movePlan ? moveItemEditPlan(session, movePlan).commands
        : primaryTrack && draft ? [trimItemCommand(session, draft.id, draft.edge,
          draft.edge === "start" ? draft.start : draft.start + draft.duration)] : undefined;
      if (commands === undefined) return undefined;
      const project = applyNleTransaction(session.open.project.project, { commands: magneticEdit(session, commands, primaryTrack) });
      const tracks = project.compositions.find(value => value.id === scene.composition)?.tracks;
      return { magneticFrames: primaryTrack ? new Map(tracks?.flatMap(track =>
        track.items.map(item => [item.id, { track: track.id, start: frameOf(session, item.start), duration: frameOf(session, item.duration) }] as const))) : undefined };
    } catch {
      return undefined;
    }
  }, [session, scene.composition, primaryTrack, movePlan, draft]);
  const magneticFrames = editPreview?.magneticFrames;
  const itemDropAccepted = movePlan !== undefined && editPreview !== undefined;
  const mediaTrack = scene.tracks.find(track => track.id === drop?.track);
  const mediaEntry = session.media.entries.find(entry => entry.id === draggedMedia?.id);
  const componentEntry = session.catalog.components.find(entry => catalogDragId({ kind: "component", entry }) === draggedMedia?.id);
  const acceptsDrop = drop && mediaTrack && !mediaTrack.locked && (mediaEntry
    ? mediaFitsTrack(mediaTrack, mediaEntry.kind, drop.frame, mediaEntry.durationFrames ?? Math.max(1, Math.round(fps * 5)))
    : componentEntry ? componentFitsTrack(session, mediaTrack, drop.frame, componentEntry.duration, componentTrackRole(componentEntry.category))
    : (mediaTrack.role === "effect" || drop.item !== undefined)
      && session.catalog.adjusts.some(entry => catalogDragId({ kind: "effect", entry }) === draggedMedia?.id));
  const highlightedTrack = acceptsDrop ? mediaTrack.id : itemDropAccepted ? itemDrag?.dropTrack : itemDrag?.sourceTrack;
  const insertionTop = reorder.position?.top ?? (itemDropAccepted ? itemDrag?.insertionTop : undefined);
  const snapFrame = (itemDropAccepted ? itemDrag?.snapFrame : undefined) ?? draft?.snapFrame ?? drop?.snapFrame;
  const snappedToPlayhead = snapFrame === frame;
  const playheadSnapClass = snappedToPlayhead || seek.snapped ? " adsorbed" : "";
  const rowFade = fadeMotion(reduced);
  const rowTransition = { ...rowFade.transition, layout: { duration: reduced ? 0 : .22, ease: softEase } };
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
  const frameRate = Math.max(1, Math.round(fps));
  // Labelled steps reach single frames when zoomed in; seconds and minutes otherwise.
  const stepCandidates = [...[1, 2, 5, 10, 15].filter(value => value < frameRate), ...[1, 2, 5, 10, 30, 60, 120, 300, 600, 1200].map(value => value * frameRate)];
  // Long programmes keep growing the labelled step in ten-minute multiples.
  const stepFrames = stepCandidates.find(value => value * pixels >= 78) ?? Math.ceil(78 / pixels / (600 * frameRate)) * 600 * frameRate;
  // Unlabelled subdivisions: as many as fit at 6px or more, on whole frames when the step is shorter than a second.
  const minorCount = [10, 6, 5, 4, 3, 2].find(count => stepFrames * pixels / count >= 6 && (stepFrames >= frameRate || stepFrames % count === 0)) ?? 1;
  const ticks = useMemo(() => Array.from({ length: Math.floor(endFrame / stepFrames) + 1 }, (_, index) => index * stepFrames), [endFrame, stepFrames]);
  const compositions = session.open.project.project.compositions;
  const parent = compositions.find(value => value.id === compositionParents.at(-1));

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || (event.target as Element | null)?.closest("input,textarea,[role=combobox],[contenteditable=true]") || document.querySelector("[role=dialog],[role=menu],[role=listbox]")) return;
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
    const constraint = createTrimConstraint(session, item, mode === "trim-start" ? "start" : "end", mediaDurationForItem(item.id), primaryTrack);
    const boundaries = timelineSnapBoundaries(scene, new Set([item.id]));
    const move = (next: PointerEvent) => {
      const current = gesture.current; if (!current || next.pointerId !== current.pointer) return;
      const trimmingStart = current.mode === "trim-start";
      const end = current.originStart + current.originDuration;
      const originalEdge = trimmingStart ? current.originStart : end;
      const delta = Math.round((next.clientX - current.startX) / pixels);
      const requested = delta === 0 ? originalEdge : Math.round(originalEdge + delta);
      const proposed = constraint.clamp(requested);
      const aligned = snap && !next.altKey && proposed === requested && proposed !== originalEdge
        ? snapTimelineEdges([proposed], frame, boundaries, pixels, correction => constraint.allows(proposed + correction)) : undefined;
      const edge = aligned?.frame ?? proposed;
      draftRef.current = {
        id: item.id, edge: trimmingStart ? "start" : "end",
        start: trimmingStart ? edge : current.originStart,
        duration: trimmingStart ? end - edge : edge - current.originStart,
        ...(aligned ? { snapFrame: aligned.frame } : {}),
      };
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
      if (!accepted || (accepted.start === current.originStart && accepted.duration === current.originDuration)) return;
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
    const update = (clientX: number) => changeZoomPosition(Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)));
    event.preventDefault(); update(event.clientX);
    const move = (next: PointerEvent) => update(next.clientX);
    const finish = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish);
  };

  return <motion.section ref={ref} className="nle-timeline" {...enterMotion(reduced)}>
    <div className="nle-timeline-tabbar">
      <AnimatePresence initial={false}>{parent && <motion.div {...fadeMotion(reduced)} className="studio-composition-back">
        <IconButton label={`返回 ${parent.name}`} disabled={busy} onClick={() => onReturnComposition(parent.id)}><ArrowLeft size={15}/></IconButton>
      </motion.div>}</AnimatePresence>
      <div className="nle-timeline-tabs" role="tablist"><AnimatePresence initial={false}>{compositions.map(composition => <motion.div {...fadeMotion(reduced)} className={`nle-timeline-tab${composition.id === scene.composition ? " current" : ""}`} key={composition.id}><button type="button" role="tab" aria-selected={composition.id === scene.composition} title={composition.name} onClick={() => onComposition(composition.id)}>{composition.name}</button></motion.div>)}</AnimatePresence></div><CompositionActions composition={composition} disabled={busy} root={session.open.project.project.rootComposition === scene.composition} referenced={compositions.some(value => value.tracks.some(track => track.items.some(item => item.kind === "present" && item.source === "composition" && item.composition === scene.composition)))} onCreate={onCompositionCreate} onEdit={onCompositionEdit} onRoot={onCompositionRoot} onRemove={onCompositionRemove}/></div>
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
      <IconButton label="在播放头创建定格" disabled={busy || !canFreeze} onClick={onFreeze}><Snowflake size={18} strokeWidth={1.6}/></IconButton>
      <CompoundMenu disabled={busy || !editableSelection(scene, selection).length} selected={selection.length > 0} nested={Boolean(nestedComposition) && selection.length === 1} onCreate={onCreateCompound} onOpen={() => nestedComposition && onEnterComposition(nestedComposition)} onDuplicate={() => selected && onDuplicateCompound(selected.id)} onUnpack={() => selected && onUnpackCompound(selected.id)}/>
      <IconButton label={grouped ? "取消组合" : "组合"} className={grouped ? "active" : ""} disabled={busy || !canToggleGroup} onClick={onToggleGroup}><Group size={18} strokeWidth={1.6}/></IconButton><span className="nle-toolbar-space"/>
      <IconButton label="吸附" className={snap ? "active" : ""} onClick={() => setSnap(value => !value)}><Magnet size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="适合时间线" onClick={() => changeZoom((viewport.width - 40) / (lastClipEnd > 0 ? lastClipEnd / fps : 1), true)}><Scan size={18} strokeWidth={1.6}/></IconButton>
      <div className="nle-zoom">
        <IconButton label="缩小" disabled={zoom <= minZoom} onClick={() => stepZoom(-1)}><CircleMinus size={18} strokeWidth={1.6}/></IconButton>
        <div className="nle-zoom-slider" onPointerDown={startZoomDrag}>
          <span className="nle-zoom-rail" aria-hidden="true" style={{ "--fill": `${zoomPosition * 100}%` } as React.CSSProperties}/>
          <input type="range" aria-label="时间线缩放" min="0" max="100" step="any" value={zoomPosition * 100} onChange={event => changeZoomPosition(Number(event.target.value) / 100)}/>
        </div>
        <IconButton label="放大" disabled={zoom >= maxZoom} onClick={() => stepZoom(1)}><CirclePlus size={18} strokeWidth={1.6}/></IconButton>
      </div>
    </div>
    <motion.div layoutScroll className={`nle-timeline-scroll${tool === "cut" ? " cut-mode" : tool === "left" || tool === "right" ? " direction-mode" : ""}`} ref={scroller} onPointerDown={event => {
      if (tool === "select") marquee.start(event);
      else if ((tool === "left" || tool === "right") && !(event.target as Element).closest(".nle-clip,.nle-track-label,.nle-ruler,button")) {
        const bounds = event.currentTarget.getBoundingClientRect(); onSelect(directionalSelection(scene, Math.max(0, Math.round((event.clientX - bounds.left - labelWidth + event.currentTarget.scrollLeft) / pixels)), tool));
      }
    }} onPointerLeave={() => setCutCursor(undefined)} data-frame-pixels={pixels} data-snap={snap}>
      <div className="nle-tracks" style={{ width: labelWidth + width, minHeight: Math.max(viewport.height, rulerHeight + tracksHeight + trackPadding * 2), "--nle-track-padding": `${trackPadding}px` } as React.CSSProperties}>
        <div className="nle-ruler"><div className="nle-ruler-label"/><div className="nle-ruler-scale" style={{ width }} onPointerDown={seek.start}>{ticks.map(value => <span key={value} style={{ left: value * pixels, "--half": minorCount % 2 === 0 ? `${stepFrames * pixels / 2}px` : "-100px" } as React.CSSProperties}>{rulerLabel(value, frameRate, stepFrames < frameRate)}</span>)}<b className="nle-ruler-minor" style={{ "--minor-step": `${stepFrames * pixels / minorCount}px` } as React.CSSProperties} aria-hidden="true"/><i className={`nle-ruler-frame${pixels >= 8 ? " visible" : ""}`} style={{ left: frame * pixels, width: pixels }}/></div></div>
        <div className="nle-track-top"><div className="nle-track-label empty"/><div className="nle-track-space" data-nle-drop="" style={{ width }}/></div>
        <AnimatePresence initial={false} mode="popLayout">{rows.map(track => <motion.div {...rowFade} layout={reduced ? false : "position"} transition={rowTransition} className={`nle-track${rowSize(track) <= compactRowHeight ? " compact" : ""}${primaryTrack === track.id ? " main" : ""}${track.locked ? " locked" : ""}`} data-track-id={track.id} key={track.id} style={{ height: rowSize(track) }}>
          <TrackMenu name={track.name} primary={primaryTrack === track.id} picture={track.kind === "picture" && track.role === undefined} onMagnet={() => onTrackMagnet(track.id)} disabled={busy || track.locked} pixels={pixels} gaps={trackGaps(composition.tracks.find(value => value.id === track.id)!).map(range => ({ start: frameOf(session, range.start), end: frameOf(session, range.end) }))} onCloseGaps={at => onCloseGaps(track.id, at)} onRename={name => onTrackRename(track.id, name)} onRemove={() => onTrackRemove(track.id)} onHeight={track.role === undefined ? height => onTrackHeight(track.id, height) : undefined}>
          <div className={`nle-track-label${reorder.position?.trackId === track.id ? " reordering" : ""}`} data-reorderable={!track.locked && !busy} title={primaryTrack === track.id ? `${track.name} / 主轨道` : track.name} data-primary={primaryTrack === track.id || undefined} onPointerDown={event => reorder.start(event, track)}><span className="nle-track-icons"><span className="nle-track-kind">{primaryTrack === track.id ? <Magnet size={14}/> : track.role === "subtitle" ? <Captions size={14}/> : track.items.every(item => item.role === "adjust") ? <Layers size={14}/> : track.kind === "audio" ? <AudioLines size={14}/> : track.items.some(item => item.display.layers.some(layer => layer.kind === "text")) ? <Type size={14}/> : <Film size={14}/>}</span>
            <IconButton label={track.locked ? "解锁轨道" : "锁定轨道"} className="nle-track-lock" disabled={busy} aria-pressed={track.locked} onClick={() => onTrackLocked(track.id, !track.locked)}>{track.locked ? <Lock size={14}/> : <Unlock size={14}/>}</IconButton>
            <IconButton label={track.enabled ? "停用轨道" : "启用轨道"} disabled={busy} onClick={() => onTrackEnabled(track.id, !track.enabled)}>{track.enabled ? <Volume2 size={14}/> : <VolumeX size={14}/>}</IconButton></span></div>
          <div className="nle-track-content" data-nle-drop={track.id} data-drop-target={highlightedTrack === track.id || undefined} style={{ width }}>
            <AnimatePresence initial={false}>{track.items.map(item => { const previewFrame = magneticFrames?.get(item.id);
              const current = previewFrame?.track === track.id ? previewFrame
                : draft?.id === item.id ? draft : { start: item.startFrame, duration: item.durationFrames }; const kind = clipClass(item, track); const textRole = kind === "text" ? track.role === "subtitle" ? " is-subtitle" : " is-title" : ""; const preview = item.display.layers.find(layer => layer.kind === "preview" && layer.state === "ready"); const text = item.display.layers.find(layer => layer.kind === "text"); const projectItem = composition.tracks.flatMap(track => track.items).find(candidate => candidate.id === item.id); const parameterTitle = projectItem?.kind === "present" && projectItem.source === "component" ? projectItem.parameters.title : undefined; const label = kind !== "text" ? item.display.title : typeof parameterTitle === "string" && parameterTitle.trim() ? parameterTitle : text?.kind === "text" && text.text.trim() ? text.text : item.display.title; const menuIds = editableSelection(scene, selection.includes(item.id) ? selection : [item.id]); const split = selectionAtFrame(scene, menuIds, frame, "split"), left = selectionAtFrame(scene, menuIds, frame, "trimStart"), right = selectionAtFrame(scene, menuIds, frame, "trimEnd"); return <ClipMenu key={item.id} disabled={busy || track.locked} canSplit={split.length > 0} canTrimStart={left.length > 0} canTrimEnd={right.length > 0} onSelect={() => onSelect(menuIds)} onSplit={() => onSplit(split, frame)} onTrimStart={() => onTrimSelection(left, "start", frame)} onTrimEnd={() => onTrimSelection(right, "end", frame)} onRemove={() => onRemove()} onRippleRemove={() => onRippleRemove(menuIds)} {...(projectItem?.kind === "present" && projectItem.source === "composition" ? { onOpen: () => onEnterComposition(projectItem.composition), onDuplicate: () => onDuplicateCompound(item.id), onUnpack: () => onUnpackCompound(item.id) } : {})}><motion.div {...fadeMotion(reduced)} data-clip-id={item.id} role="button" tabIndex={0} aria-label={item.display.title} aria-pressed={selection.includes(item.id)} className={`nle-clip ${kind}${textRole}${selection.includes(item.id) ? " selected" : ""}${itemGesture.gesture?.ids.includes(item.id) ? " drag-origin" : ""}`} style={{ left: current.start * pixels, width: Math.max(8, current.duration * pixels) }} onPointerDown={event => begin(event, item, "move", track)} onDoubleClick={() => { if (projectItem?.kind === "present" && projectItem.source === "composition") onEnterComposition(projectItem.composition); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onSelect(editableSelection(scene, [item.id])); } }} onPointerMove={event => {
              if (tool !== "cut" || busy || track.locked) return; const at = item.startFrame + Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels); setCutCursor(item.affordances.split && at > item.startFrame && at < item.startFrame + item.durationFrames ? { track: track.id, frame: at } : undefined);
            }} onPointerLeave={() => setCutCursor(undefined)}>
              <span className="nle-clip-title">{kind !== "visual" && <span className="nle-clip-icon">{kind === "text" ? track.role === "subtitle" ? <Captions size={13}/> : <Type size={13}/> : kind === "effect" ? <SlidersHorizontal size={13}/> : kind === "compound" ? <Layers size={13}/> : <Music size={13}/>}</span>}<span className="nle-clip-chip">{item.group && <Group size={11}/>} {composition.mattes.some(matte => matte.content === item.id || matte.matte === item.id) && <Link2 size={11}/>} {label}</span>{kind !== "text" && <span className="nle-clip-chip">{timecode(current.duration, fps)}</span>}</span>
              {preview?.kind === "preview" && preview.state === "ready" && <span className="nle-clip-thumbnails"><img src={preview.resource} style={{ left: 0, width: "100%" }}/></span>}
              {text?.kind === "text" && <span className="nle-clip-text">{text.text}</span>}
              {kind === "compound" && projectItem && <CompoundFilmstrip session={session} item={projectItem} width={current.duration * pixels} height={rowSize(track) - 12} pixels={pixels} fps={fps}/>}
              {projectItem?.kind === "present" && projectItem.source === "media" && (kind === "visual" || kind === "audio") && (() => { const entry = clipMediaEntry(session, projectItem); if (!entry?.resource || entry.state !== "available") return null; return kind === "audio" ? <ClipWaveform item={projectItem} entry={entry} width={current.duration * pixels} inset={waveformInset} pixels={pixels} fps={fps}/> : <ClipFilmstrip item={projectItem} entry={entry} width={current.duration * pixels} height={rowSize(track) - 12} pixels={pixels} fps={fps}/>; })()}
              {item.affordances.trimStart && <div className="nle-trim start" aria-label="裁剪开头" onPointerDown={event => begin(event, item, "trim-start", track)}/>} {item.affordances.trimEnd && <div className="nle-trim end" aria-label="裁剪结尾" onPointerDown={event => begin(event, item, "trim-end", track)}/>}<div className={`nle-cut-line${tool === "cut" && cutCursor?.track === track.id && cutCursor.frame >= item.startFrame && cutCursor.frame <= item.startFrame + item.durationFrames ? " visible" : ""}`} style={{ left: ((cutCursor?.frame ?? item.startFrame) - item.startFrame) * pixels }}/>
            </motion.div></ClipMenu>; })}</AnimatePresence>
            <AnimatePresence initial={false}>{composition.transitions.flatMap(transition => {
              const outgoing = sceneItems.get(transition.outgoing), incoming = sceneItems.get(transition.incoming);
              if (outgoing?.track !== track.id || incoming === undefined) return [];
              const start = incoming.startFrame, end = outgoing.startFrame + outgoing.durationFrames;
              const name = transitionNames[transition.operator.symbol] ?? transition.operator.symbol;
              return end <= start ? [] : [<motion.button {...fadeMotion(reduced)} key={transition.id} aria-label={name} className={`nle-transition-block${selectedTransition === transition.id ? " selected" : ""}`} style={{ left: start * pixels, width: Math.max(6, (end - start) * pixels) }} title={name} onPointerDown={event => event.stopPropagation()} onClick={() => { onSelect([transition.outgoing, transition.incoming]); onSeek(Math.floor((start + end) / 2)); onSelectTransition(transition.id); }}/>];
            })}</AnimatePresence>
            <AnimatePresence initial={false}>{drop?.track === track.id && drop.transitionCut && <motion.div {...fadeMotion(reduced)}
              className="nle-snap-line" style={{ left: drop.frame * pixels }} aria-hidden="true"/>}</AnimatePresence>
            <div className={`nle-clip nle-clip-ghost studio-media-drop ${track.role === "subtitle" ? "text" : track.kind === "audio" ? "audio" : "visual"}${drop?.track === track.id && !drop.transitionCut ? " visible" : ""}`} style={{ left: (drop?.frame ?? 0) * pixels, width: Math.max(8, (draggedMedia?.durationFrames ?? fps * 5) * pixels) }}><span className="nle-clip-title">{draggedMedia?.name}</span></div>
          </div>
          </TrackMenu>
        </motion.div>)}</AnimatePresence>
        <div className="nle-track-space-row"><div className="nle-track-label empty"/><div className="nle-track-space" data-nle-drop="" style={{ width }}/></div>
        <div className={`nle-timeline-empty${rows.length === 0 ? " visible" : ""}`} style={{ left: labelWidth, width, height: trackPadding }}>从素材区拖入文件，开始剪辑</div>
        <div className={`nle-marquee${marquee.box?.visible ? " visible" : ""}`} style={marquee.box ?? { width: 0, height: 0 }}/>
        <AnimatePresence initial={false}>{insertionTop !== undefined && <motion.div {...fadeMotion(reduced)} className="nle-track-insertion" style={{ top: insertionTop }}/>}</AnimatePresence>
        {snapFrame !== undefined && !snappedToPlayhead && <div className="nle-snap-line" style={{ left: labelWidth + snapFrame * pixels }}/>}
        <div className={`nle-playhead${playheadSnapClass}`} style={{ left: labelWidth + frame * pixels }}/>
        <div className={`nle-playhead-control${playheadSnapClass}`} style={{ left: labelWidth + frame * pixels }}>
          <button className={seek.active ? "active" : ""} aria-label="播放头" onPointerDown={seek.start}/>
        </div>
      </div>
    </motion.div>
    <AnimatePresence>{itemGesture.gesture?.floating.map(item => <motion.div {...fadeMotion(reduced)} key={item.id} className="nle-floating-preview" style={{ position: "fixed", left: item.left, top: item.top, width: item.width, height: item.height, pointerEvents: "none" }}><div className={`nle-clip nle-clip-ghost ${item.kind}`} style={{ inset: 0, height: item.height }}><span className="nle-clip-title"><span className="nle-clip-chip">{item.title}</span></span></div></motion.div>)}</AnimatePresence>
  </motion.section>;
}
