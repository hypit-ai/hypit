import type { NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/view";
import {
  AudioLines, BetweenHorizontalStart, Blend, CircleMinus, CirclePlus, Crop, Film, Group, Layers, Link2, Lock, Magnet,
  PanelLeftClose, PanelRightClose, Plus, Redo2, Scan, Scissors, Snowflake, Trash2, Type, Undo2, Unlock,
  Volume2, VolumeX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NleStudioSession } from "../protocol.js";
import { IconButton } from "./common.js";
import { timecode } from "./timecode.js";
import { labelWidth, maxZoom, minZoom, rowSize } from "./timelineGeometry.js";
import { ToolSelector, type TimelineTool } from "./ToolSelector.js";
import { useTimelineSeek } from "./useTimelineSeek.js";
import { useTimelineZoom } from "./useTimelineZoom.js";
import { useTrackReorder } from "./useTrackReorder.js";
import { useItemGesture, type ItemMovePlan } from "./useItemGesture.js";

type Gesture = {
  readonly item: NleTimelineSceneItem;
  readonly mode: "trim-start" | "trim-end";
  readonly pointer: number;
  readonly startX: number;
  readonly originStart: number;
  readonly originDuration: number;
  readonly element: HTMLElement;
};

type MarqueeBox = { readonly left: number; readonly top: number; readonly width: number; readonly height: number; readonly visible: boolean };

function clipClass(item: NleTimelineSceneItem, track: NleTimelineSceneTrack): string {
  if (item.role === "adjust") return "effect";
  if (track.kind === "audio") return "audio";
  if (item.source === "composition") return "compound";
  return item.display.layers.some(layer => layer.kind === "text") ? "text" : "visual";
}

function useMarquee(scroller: React.RefObject<HTMLDivElement | null>, selection: readonly string[], onSelect: (ids: readonly string[]) => void) {
  const [box, setBox] = useState<MarqueeBox>();
  const start = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest(".nle-clip,.nle-track-label,.nle-ruler,button")) return;
    const tracks = scroller.current?.querySelector<HTMLElement>(".nle-tracks");
    if (!tracks) return;
    event.preventDefault();
    const bounds = tracks.getBoundingClientRect(), originX = event.clientX - bounds.left, originY = event.clientY - bounds.top;
    const original = event.metaKey || event.ctrlKey ? [...selection] : [];
    let moved = false;
    const move = (next: PointerEvent) => {
      const x = next.clientX - bounds.left, y = next.clientY - bounds.top;
      const current = { left: Math.min(originX, x), top: Math.min(originY, y), width: Math.abs(x - originX), height: Math.abs(y - originY), visible: true };
      moved ||= current.width > 3 || current.height > 3;
      setBox(current);
      if (!moved) return;
      const right = current.left + current.width, bottom = current.top + current.height;
      const hit = Array.from(tracks.querySelectorAll<HTMLElement>("[data-clip-id]")).filter(element => {
        const rect = element.getBoundingClientRect(), left = rect.left - bounds.left, top = rect.top - bounds.top;
        return left < right && left + rect.width > current.left && top < bottom && top + rect.height > current.top;
      }).map(element => element.dataset.clipId!);
      onSelect([...new Set([...original, ...hit])]);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish);
      setBox(undefined); if (!moved && original.length === 0) onSelect([]);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish);
  };
  return { box, start };
}

export function Timeline({ session, frame, selection, busy, onSeek, onSelect, onMove, onTrim, onSplit, onRemove,
  onTrackEnabled, onTrackLocked, onTrackMove, onComposition, onAddTrack, onToggleGroup, canToggleGroup, grouped,
  onDetachAudio, canDetachAudio, onUndo, onRedo }: {
  readonly session: NleStudioSession;
  readonly frame: number;
  readonly selection: readonly string[];
  readonly busy: boolean;
  readonly onSeek: (frame: number) => void;
  readonly onSelect: (ids: readonly string[]) => void;
  readonly onMove: (plan: ItemMovePlan) => void;
  readonly onTrim: (item: NleTimelineSceneItem, edge: "start" | "end", atFrame: number) => void;
  readonly onSplit: (item: NleTimelineSceneItem, atFrame: number) => void;
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
}) {
  const scene = session.open.timeline, fps = scene.editRate.numerator / scene.editRate.denominator;
  const scroller = useRef<HTMLDivElement>(null);
  const { zoom, changeZoom } = useTimelineZoom(scroller, labelWidth, scene.composition);
  const pixels = zoom / fps;
  const [snap, setSnap] = useState(true), [tool, setTool] = useState<TimelineTool>("select");
  const [draft, setDraft] = useState<{ readonly id: string; readonly start: number; readonly duration: number }>();
  const [cutCursor, setCutCursor] = useState<{ readonly track: string; readonly frame: number }>();
  const draftRef = useRef<typeof draft>(undefined), gesture = useRef<Gesture | undefined>(undefined);
  const seek = useTimelineSeek(scroller, pixels, labelWidth, frame, onSeek);
  const marquee = useMarquee(scroller, selection, onSelect);
  const reorder = useTrackReorder(scroller, scene.tracks, session.open.status.projectRevision, busy, onTrackMove);
  const itemGesture = useItemGesture({ scene, scroller, pixels, frame, snap, busy, selection, onSelect, onMove });
  const width = Math.max(900, (Math.max(scene.maximumFrame, frame) / fps + 10) * zoom);
  const selected = scene.tracks.flatMap(track => track.items).find(item => selection.includes(item.id));
  const composition = session.open.project.project.compositions.find(value => value.id === scene.composition)!;
  const projectSelected = composition.tracks.flatMap(track => track.items).find(item => item.id === selected?.id);
  const nestedComposition = projectSelected?.kind === "present" && projectSelected.source === "composition"
    ? projectSelected.composition : undefined;
  const sceneItems = new Map(scene.tracks.flatMap(track => track.items.map(item => [item.id, item] as const)));
  const splitFrame = selected === undefined ? frame : Math.max(selected.startFrame + 1, Math.min(selected.startFrame + selected.durationFrames - 1, frame));
  const canSplit = selected?.affordances.split === true && splitFrame > selected.startFrame && splitFrame < selected.startFrame + selected.durationFrames;
  const stepFrames = Math.max(1, Math.round(([1, 2, 5, 10, 30, 60, 120, 300, 600].find(value => value * zoom >= 78) ?? 1200) * fps));
  const ticks = useMemo(() => Array.from({ length: Math.ceil(width / (stepFrames * pixels)) + 1 }, (_, index) => index * stepFrames), [width, stepFrames, pixels]);
  const zoomPosition = Math.log(zoom / minZoom) / Math.log(maxZoom / minZoom) * 100;
  const compositions = session.open.project.project.compositions;

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as Element | null)?.closest("input,textarea,select,[contenteditable=true]")) return;
      const next: TimelineTool | undefined = event.key.toLowerCase() === "a" ? "select" : event.key.toLowerCase() === "b" ? "cut" : event.key === "[" ? "left" : event.key === "]" ? "right" : undefined;
      if (next) { event.preventDefault(); setTool(next); setCutCursor(undefined); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);

  const directionalSelection = (at: number, direction: "left" | "right") => {
    const ids = scene.tracks.flatMap(track => track.items).filter(item => direction === "left"
      ? item.startFrame < at : item.startFrame + item.durationFrames > at).map(item => item.id);
    onSelect(ids);
  };

  const begin = (event: React.PointerEvent<HTMLElement>, item: NleTimelineSceneItem, mode: "move" | Gesture["mode"], track: NleTimelineSceneTrack) => {
    if (busy || event.button !== 0) return;
    event.stopPropagation();
    const localFrame = item.startFrame + Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels);
    if (tool === "cut") {
      if (!track.locked && item.affordances.split && localFrame > item.startFrame && localFrame < item.startFrame + item.durationFrames) onSplit(item, localFrame);
      return;
    }
    if (tool === "left" || tool === "right") { directionalSelection(localFrame, tool); return; }
    if (mode === "move") { itemGesture.start(event, item, track); return; }
    onSelect(event.metaKey || event.ctrlKey ? [...new Set([...selection, item.id])] : [item.id]);
    if (track.locked || (mode === "trim-start" && !item.affordances.trimStart) || (mode === "trim-end" && !item.affordances.trimEnd)) return;
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    gesture.current = { item, mode, pointer: event.pointerId, startX: event.clientX, originStart: item.startFrame, originDuration: item.durationFrames, element };
    const move = (next: PointerEvent) => {
      const current = gesture.current; if (!current || next.pointerId !== current.pointer) return;
      let delta = Math.round((next.clientX - current.startX) / pixels);
      if (snap) { const unit = Math.max(1, Math.round(fps / 2)); delta = Math.round(delta / unit) * unit; }
      if (current.mode === "trim-start") {
        const start = Math.max(0, Math.min(current.originStart + current.originDuration - 1, current.originStart + delta));
        draftRef.current = { id: item.id, start, duration: current.originDuration + current.originStart - start };
      } else draftRef.current = { id: item.id, start: current.originStart, duration: Math.max(1, current.originDuration + delta) };
      setDraft(draftRef.current);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel);
      gesture.current = undefined; draftRef.current = undefined; setDraft(undefined);
    };
    const finish = (next: PointerEvent) => {
      const current = gesture.current; if (!current || next.pointerId !== current.pointer) return;
      const accepted = draftRef.current; if (current.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer); cleanup();
      if (!accepted) return;
      onTrim(current.item, current.mode === "trim-start" ? "start" : "end", current.mode === "trim-start" ? accepted.start : accepted.start + accepted.duration);
    };
    const cancel = () => cleanup();
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", cancel);
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

  return <section className="nle-timeline">
    <div className="nle-timeline-tabbar"><div className="nle-timeline-tabs" role="tablist">{compositions.map(composition => <div className={`nle-timeline-tab${composition.id === scene.composition ? " current" : ""}`} key={composition.id}><button type="button" role="tab" aria-selected={composition.id === scene.composition} title={composition.name} onClick={() => onComposition(composition.id)}>{composition.name}</button></div>)}</div></div>
    <div className="nle-timeline-toolbar">
      <ToolSelector value={tool} onChange={value => { setTool(value); setCutCursor(undefined); }}/>
      <IconButton label="新建轨道" disabled={busy} onClick={onAddTrack}><Plus size={18} strokeWidth={1.6}/></IconButton><span className="nle-toolbar-separator"/>
      <IconButton label="撤销" disabled={busy || !session.open.status.projectHistory.canUndo} onClick={onUndo}><Undo2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="重做" disabled={busy || !session.open.status.projectHistory.canRedo} onClick={onRedo}><Redo2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="分割" disabled={busy || !canSplit} onClick={() => selected && onSplit(selected, splitFrame)}><Scissors size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="向左裁剪" disabled={busy || selected?.affordances.trimStart !== true || frame <= selected.startFrame || frame >= selected.startFrame + selected.durationFrames} onClick={() => selected && onTrim(selected, "start", frame)}><PanelLeftClose size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="向右裁剪" disabled={busy || selected?.affordances.trimEnd !== true || frame <= selected.startFrame || frame >= selected.startFrame + selected.durationFrames} onClick={() => selected && onTrim(selected, "end", frame)}><PanelRightClose size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="删除" disabled={busy || selected === undefined} onClick={onRemove}><Trash2 size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="分离音频" disabled={busy || !canDetachAudio} onClick={onDetachAudio}><AudioLines size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="裁剪画面" disabled><Crop size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="定格" disabled><Snowflake size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label={nestedComposition ? "打开复合片段" : "复合片段"} disabled={busy || nestedComposition === undefined} onClick={() => nestedComposition && onComposition(nestedComposition)}><Layers size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label={grouped ? "取消组合" : "组合"} className={grouped ? "active" : ""} disabled={busy || !canToggleGroup} onClick={onToggleGroup}><Group size={18} strokeWidth={1.6}/></IconButton><span className="nle-toolbar-space"/>
      <IconButton label="主轨道" disabled><BetweenHorizontalStart size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="吸附" className={snap ? "active" : ""} onClick={() => setSnap(value => !value)}><Magnet size={18} strokeWidth={1.6}/></IconButton>
      <IconButton label="适合时间线" onClick={() => changeZoom(((scroller.current?.clientWidth ?? 1000) - labelWidth - 40) / Math.max(1, scene.maximumFrame / fps), true)}><Scan size={18} strokeWidth={1.6}/></IconButton>
      <div className="nle-zoom"><IconButton label="缩小" disabled={zoom <= minZoom} onClick={() => changeZoom(zoom / 1.25)}><CircleMinus size={18} strokeWidth={1.6}/></IconButton><div className="nle-zoom-slider" onPointerDown={startZoomDrag}><span className="nle-zoom-rail" aria-hidden="true" style={{ "--fill": `${zoomPosition}%` } as React.CSSProperties}/><input type="range" aria-label="时间线缩放" min="0" max="100" step="any" value={zoomPosition} onChange={event => changeZoom(minZoom * (maxZoom / minZoom) ** (Number(event.target.value) / 100))}/></div><IconButton label="放大" disabled={zoom >= maxZoom} onClick={() => changeZoom(zoom * 1.25)}><CirclePlus size={18} strokeWidth={1.6}/></IconButton></div>
    </div>
    <div className={`nle-timeline-scroll${tool === "cut" ? " cut-mode" : tool === "left" || tool === "right" ? " direction-mode" : ""}`} ref={scroller} onPointerDown={event => {
      if (tool === "select") marquee.start(event);
      else if ((tool === "left" || tool === "right") && !(event.target as Element).closest(".nle-clip,.nle-track-label,.nle-ruler,button")) {
        const bounds = event.currentTarget.getBoundingClientRect(); directionalSelection(Math.max(0, Math.round((event.clientX - bounds.left - labelWidth + event.currentTarget.scrollLeft) / pixels)), tool);
      }
    }} onPointerLeave={() => setCutCursor(undefined)}>
      <div className="nle-tracks" style={{ width: labelWidth + width, minHeight: "100%" }}>
        <div className="nle-ruler"><div className="nle-ruler-label"/><div className="nle-ruler-scale" style={{ width }} onPointerDown={seek.start}>{ticks.map(value => <span key={value} style={{ left: value * pixels, "--minor": `${stepFrames * pixels / 2}px` } as React.CSSProperties}>{timecode(value, fps)}</span>)}<i className={`nle-ruler-frame${pixels >= 8 ? " visible" : ""}`} style={{ left: frame * pixels, width: pixels }}/></div></div>
        <div className="nle-track-top"><div className="nle-track-label empty"/><div className="nle-track-space" style={{ width }}/></div>
        {scene.tracks.map(track => <div className={`nle-track${rowSize(track) === 36 ? " compact" : ""}${track.locked ? " locked" : ""}`} data-track-id={track.id} key={track.id} style={{ height: rowSize(track) }}>
          <div className={`nle-track-label${reorder.position?.trackId === track.id ? " reordering" : ""}`} data-reorderable={!track.locked && !busy} title={track.name} onPointerDown={event => reorder.start(event, track)}><span className="nle-track-icons"><span className="nle-track-kind">{track.items.every(item => item.role === "adjust") ? <Layers size={14}/> : track.kind === "audio" ? <AudioLines size={14}/> : track.items.some(item => item.display.layers.some(layer => layer.kind === "text")) ? <Type size={14}/> : <Film size={14}/>}</span>
            <IconButton label={track.locked ? "解锁轨道" : "锁定轨道"} className="nle-track-lock" disabled={busy} aria-pressed={track.locked} onClick={() => onTrackLocked(track.id, !track.locked)}>{track.locked ? <Lock size={14}/> : <Unlock size={14}/>}</IconButton>
            <IconButton label={track.enabled ? "停用轨道" : "启用轨道"} disabled={busy} onClick={() => onTrackEnabled(track.id, !track.enabled)}>{track.enabled ? <Volume2 size={14}/> : <VolumeX size={14}/>}</IconButton></span></div>
          <div className="nle-track-content" style={{ width }} onPointerDown={event => { if (event.target === event.currentTarget) seek.start(event); }}>
            {track.items.map(item => { const current = draft?.id === item.id ? draft : { start: item.startFrame, duration: item.durationFrames }; const kind = clipClass(item, track); const preview = item.display.layers.find(layer => layer.kind === "preview" && layer.state === "ready"); const text = item.display.layers.find(layer => layer.kind === "text"); return <div key={item.id} data-clip-id={item.id} className={`nle-clip ${kind}${selection.includes(item.id) ? " selected" : ""}${itemGesture.gesture?.ids.includes(item.id) ? " drag-origin" : ""}`} style={{ left: current.start * pixels, width: Math.max(8, current.duration * pixels) }} onPointerDown={event => begin(event, item, "move", track)} onPointerMove={event => {
              if (tool !== "cut" || busy || track.locked) return; const at = item.startFrame + Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels); setCutCursor(item.affordances.split && at > item.startFrame && at < item.startFrame + item.durationFrames ? { track: track.id, frame: at } : undefined);
            }} onPointerLeave={() => setCutCursor(undefined)}>
              <span className="nle-clip-title"><span className="nle-clip-chip">{item.group && <Group size={11}/>} {composition.mattes.some(matte => matte.content === item.id || matte.matte === item.id) && <Link2 size={11}/>} {item.source === "composition" && <Layers size={11}/>} {item.display.title}</span>{kind !== "text" && <span className="nle-clip-chip">{timecode(current.duration, fps)}</span>}</span>
              {preview?.kind === "preview" && preview.state === "ready" && <span className="nle-clip-thumbnails"><img src={preview.resource} style={{ left: 0, width: "100%" }}/></span>}
              {text?.kind === "text" && <span className="nle-clip-text">{text.text}</span>}
              {item.affordances.trimStart && <div className="nle-trim start" aria-label="裁剪开头" onPointerDown={event => begin(event, item, "trim-start", track)}/>} {item.affordances.trimEnd && <div className="nle-trim end" aria-label="裁剪结尾" onPointerDown={event => begin(event, item, "trim-end", track)}/>}<div className={`nle-cut-line${tool === "cut" && cutCursor?.track === track.id && cutCursor.frame >= item.startFrame && cutCursor.frame <= item.startFrame + item.durationFrames ? " visible" : ""}`} style={{ left: ((cutCursor?.frame ?? item.startFrame) - item.startFrame) * pixels }}/>
            </div>; })}
            {composition.transitions.flatMap(transition => {
              const outgoing = sceneItems.get(transition.outgoing), incoming = sceneItems.get(transition.incoming);
              if (outgoing?.track !== track.id || incoming === undefined) return [];
              const start = incoming.startFrame, end = outgoing.startFrame + outgoing.durationFrames;
              return end <= start ? [] : [<button key={transition.id} className="nle-transition-block" style={{ left: start * pixels, width: Math.max(10, (end - start) * pixels) }} title={transition.operator.symbol} onPointerDown={event => event.stopPropagation()} onClick={() => { onSelect([transition.outgoing, transition.incoming]); onSeek(Math.floor((start + end) / 2)); }}><Blend size={12}/></button>];
            })}
          </div>
        </div>)}
        <div className="nle-track-space-row"><div className="nle-track-label empty"/><div className="nle-track-space" style={{ width }}/></div>
        <div className={`nle-marquee${marquee.box?.visible ? " visible" : ""}`} style={marquee.box ?? { width: 0, height: 0 }}/>
        <div className={`nle-track-insertion${reorder.position || itemGesture.gesture?.insertionTop !== undefined ? " visible" : ""}`} style={{ top: reorder.position?.top ?? itemGesture.gesture?.insertionTop ?? 0 }}/>
        {itemGesture.gesture?.snapFrame !== undefined && <div className="nle-snap-line" style={{ left: labelWidth + itemGesture.gesture.snapFrame * pixels }}/>}
        <div className="nle-playhead" style={{ left: labelWidth + frame * pixels }}/><div className="nle-playhead-control" style={{ left: labelWidth + frame * pixels }}><button className={seek.active ? "active" : ""} aria-label="播放头" onPointerDown={seek.start}/></div>
      </div>
    </div>
    {itemGesture.gesture?.floating.map(item => <div key={item.id} className="nle-floating-preview" style={{ position: "fixed", left: item.left, top: item.top, width: item.width, height: item.height, pointerEvents: "none" }}><div className={`nle-clip nle-clip-ghost ${item.kind}`} style={{ inset: 0, height: item.height }}><span className="nle-clip-title"><span className="nle-clip-chip">{item.title}</span></span></div></div>)}
  </section>;
}
