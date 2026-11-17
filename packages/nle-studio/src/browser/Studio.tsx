import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import type { NleInspectorScene } from "@hypit/nle/view";
import { Blend, Captions, Images, Maximize2, Minimize2, Pause, Play, Redo2, Save, StepBack, StepForward, Type, Undo2, Volume2, VolumeX, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  NleStudioAdjustCatalogEntry,
  NleStudioComponentCatalogEntry,
  NleStudioMediaEntry,
  NleStudioSession,
  NleStudioTransitionCatalogEntry,
} from "../protocol.js";
import {
  materializeAdjust,
  materializeComponent,
  materializeTransition,
  importMedia,
  placeMedia,
  readInspector,
  readSession,
  reloadSession,
  saveSession,
  sendCommand,
} from "./api.js";
import { CanvasControls } from "./CanvasControls.js";
import { IconButton } from "./common.js";
import { Inspector } from "./Inspector.js";
import { PanelResizeHandle, defaultPanelWidths, type PanelSide } from "./PanelResizeHandle.js";
import { StudioBin, type BinTab } from "./StudioBin.js";
import { Timeline } from "./Timeline.js";
import { timecode } from "./timecode.js";
import { editableSelection, linkedSelection, selectionAtFrame } from "./selection.js";
import { SourcePreview } from "./SourcePreview.js";
import type { MediaDrop } from "./mediaDrag.js";
import { copyItems, pasteItems, type ItemClipboard } from "./clipboard.js";
import { useClipClipboard } from "./useClipClipboard.js";
import { useAssetDrag } from "./useAssetDrag.js";
import { AnimatePresence, motion } from "motion/react";

function exactFrame(frame: number, session: NleStudioSession): ExactTemporalValue {
  const rate = session.open.timeline.editRate;
  return { ticks: String(frame * rate.denominator), timeBase: { numerator: 1, denominator: rate.numerator } };
}

function readPanelWidths(): typeof defaultPanelWidths {
  try {
    const saved = JSON.parse(localStorage.getItem("hypit:nle:panel-sizes") ?? "null") as Partial<typeof defaultPanelWidths> | null;
    return Object.fromEntries(Object.entries(defaultPanelWidths).map(([side, fallback]) => {
      const value = saved?.[side as PanelSide];
      return [side, Number.isFinite(value) ? Math.max(180, Math.min(900, value!)) : fallback];
    })) as typeof defaultPanelWidths;
  } catch { return defaultPanelWidths; }
}

export function Studio() {
  const [session, setSession] = useState<NleStudioSession>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [inspector, setInspector] = useState<NleInspectorScene>();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [binTab, setBinTab] = useState<BinTab>("assets");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [panelWidths, setPanelWidths] = useState(readPanelWidths);
  const [source, setSource] = useState<NleStudioMediaEntry>();
  const workspace = useRef<HTMLDivElement>(null);
  const placeFromDrag = useRef<(drop: MediaDrop) => void>(() => undefined);
  const assetDrag = useAssetDrag(session?.open.timeline, workspace, frame, busy, drop => placeFromDrag.current(drop), entry => { setPlaying(false); setSource(entry); });
  const inflight = useRef(false);
  const clipboard = useRef(new Map<string, ItemClipboard>());

  const resizePanel = (side: PanelSide, width: number, save: boolean) => {
    setPanelWidths(previous => {
      const next = { ...previous, [side]: width };
      if (save) localStorage.setItem("hypit:nle:panel-sizes", JSON.stringify(next));
      return next;
    });
  };

  const perform = useCallback(async (operation: () => Promise<void>) => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true); setFailure(undefined); setPlaying(false);
    try { await operation(); }
    catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
    finally { inflight.current = false; setBusy(false); }
  }, []);

  useEffect(() => { void perform(async () => setSession(await readSession())); }, []);

  const select = useCallback((ids: readonly string[]) => {
    setSelection(session === undefined ? [] : linkedSelection(session.open.timeline, ids));
    setSource(undefined); setPlaying(false);
  }, [session]);

  useEffect(() => {
    const item = selection[0];
    if (item === undefined || !session?.open.timeline.tracks.some(track => track.items.some(candidate => candidate.id === item))) {
      setInspector(undefined); return;
    }
    let disposed = false;
    void readInspector(item).then(value => { if (!disposed) setInspector(value.inspector); }, error => {
      if (!disposed) { setInspector(undefined); setFailure(error instanceof Error ? error.message : String(error)); }
    });
    return () => { disposed = true; };
  }, [selection[0], session?.open.status.projectRevision, session?.open.status.viewRevision]);

  const command = useCallback((value: NleEditingSurfaceCommand, afterSelection?: readonly string[]) => void perform(async () => {
    const next = await sendCommand(value, session?.open.status.viewRevision);
    setSession(next);
    setSelection(previous => (afterSelection ?? previous).filter(id => next.open.timeline.tracks.some(track => track.items.some(item => item.id === id))));
  }), [perform, session?.open.status.viewRevision]);

  const transact = useCallback((commands: Extract<NleEditingSurfaceCommand, { kind: "project.transact" }>["commands"], afterSelection?: readonly string[]) => {
    if (session === undefined || commands.length === 0) return;
    command({ kind: "project.transact", expectedProjectRevision: session.open.status.projectRevision,
      expectedViewRevision: session.open.status.viewRevision, commands }, afterSelection);
  }, [command, session]);

  useClipClipboard({
    available: session !== undefined && !busy && source === undefined,
    canCopy: session !== undefined && editableSelection(session.open.timeline, selection).length > 0,
    copy: (token, cut) => {
      if (!session) return;
      clipboard.current.set(token, copyItems(session, selection));
      while (clipboard.current.size > 10) clipboard.current.delete(clipboard.current.keys().next().value!);
      if (cut) transact([{ kind: "item.remove", ids: editableSelection(session.open.timeline, selection) }], []);
    },
    paste: token => {
      if (!session) return;
      const content = clipboard.current.get(token);
      if (!content) return;
      try { const plan = pasteItems(session, content, frame); transact(plan.commands, plan.selection); }
      catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
    },
  });

  const viewTransact = useCallback((commands: Extract<NleEditingSurfaceCommand, { kind: "view.transact" }>["commands"]) => {
    if (session === undefined) return;
    command({ kind: "view.transact", expectedProjectRevision: session.open.status.projectRevision,
      expectedViewRevision: session.open.status.viewRevision, commands });
  }, [command, session]);

  useEffect(() => {
    if (!playing || session === undefined) return;
    const fps = session.open.timeline.editRate.numerator / session.open.timeline.editRate.denominator;
    const startFrame = frame >= session.open.timeline.maximumFrame - 1 ? 0 : frame;
    const started = performance.now(); let animation = 0;
    const tick = (now: number) => {
      const next = startFrame + Math.floor((now - started) * fps / 1000);
      if (next >= session.open.timeline.maximumFrame) { setFrame(session.open.timeline.maximumFrame); setPlaying(false); return; }
      setFrame(next); animation = requestAnimationFrame(tick);
    };
    setFrame(startFrame); animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || session === undefined || (event.target as Element | null)?.closest("input,textarea,select,[contenteditable=true]") || document.querySelector("[role=dialog],[role=menu]")) return;
      if (event.metaKey || event.ctrlKey) {
        if (event.code === "KeyA") { event.preventDefault(); select(editableSelection(session.open.timeline, session.open.timeline.tracks.flatMap(track => track.items.map(item => item.id)))); }
        if (event.code === "KeyB" && !busy) { event.preventDefault(); const items = selectionAtFrame(session.open.timeline, selection, frame, "split"); if (items.length) transact(items.map(item => ({ kind: "item.split", id: item.id, at: exactFrame(frame, session), rightId: `split-${crypto.randomUUID()}` }))); }
        if (event.code === "KeyZ" && !busy) {
          event.preventDefault();
          const direction = event.shiftKey ? "redo" : "undo";
          if (session.open.status.projectHistory[direction === "redo" ? "canRedo" : "canUndo"]) command({ kind: direction === "redo" ? "project.redo" : "project.undo", expectedProjectRevision: session.open.status.projectRevision });
        }
        if (event.code === "KeyS") { event.preventDefault(); void perform(async () => setSession(await saveSession())); }
        return;
      }
      if (event.code === "Space" && source === undefined) { event.preventDefault(); setPlaying(value => !value); }
      if (event.key === "Escape") { setSource(undefined); setPreviewExpanded(false); }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && source === undefined) {
        event.preventDefault(); setPlaying(false); const delta = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1);
        setFrame(value => Math.max(0, Math.min(session.open.timeline.maximumFrame, value + delta)));
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selection.length > 0) {
        event.preventDefault(); const ids = editableSelection(session.open.timeline, selection);
        if (ids.length && !busy) transact([{ kind: "item.remove", ids }]);
      }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [selection, select, transact, session, frame, busy, source, command, perform]);

  const activeItems = useMemo(() => new Set(session?.open.timeline.tracks.flatMap(track => track.items)
    .filter(item => frame >= item.startFrame && frame < item.startFrame + item.durationFrames && item.enabled)
    .map(item => item.id) ?? []), [frame, session]);

  if (session === undefined) return <div className="nle-editor nle-loading">{failure ?? "正在打开 NLE Studio…"}</div>;
  const scene = session.open.timeline;
  const fps = scene.editRate.numerator / scene.editRate.denominator;
  const activeComposition = session.open.project.project.compositions.find(composition => composition.id === scene.composition)!;
  const projectItems = new Map(activeComposition.tracks.flatMap(track => track.items.map(item => [item.id, item] as const)));
  const mediaByPath = new Map(session.media.entries.map(entry => [entry.id, entry] as const));
  const mediaForItem = (itemId: string) => {
    const item = projectItems.get(itemId);
    if (item?.kind !== "present" || item.source !== "media") return undefined;
    const base = new URL(session.projectDocument.path, "https://hypit.invalid/");
    const path = decodeURIComponent(new URL(item.asset.path, base).pathname.slice(1));
    return mediaByPath.get(path);
  };
  const selectedProjectItem = activeComposition.tracks.flatMap(track => track.items).find(item => item.id === selection[0]);
  const selectedGroups = scene.groups.filter(group => group.items.some(item => selection.includes(item)));
  const grouped = selectedGroups.length === 1 && selectedGroups[0]!.items.every(item => selection.includes(item))
    && selection.every(item => selectedGroups[0]!.items.includes(item));
  const canToggleGroup = selection.length > 1 || selectedGroups.length > 0;
  const canDetachAudio = selection.length === 1 && selectedProjectItem?.kind === "present"
    && selectedProjectItem.picture !== undefined && selectedProjectItem.audio !== undefined;
  const icons = { assets: Images, text: Type, subtitles: Captions, transitions: Blend, effects: Wand2 } as const;
  const tabNames = { assets: "素材", text: "文本", subtitles: "字幕", transitions: "转场", effects: "效果" } as const;
  const classes = `nle-editor${previewExpanded ? " nle-preview-expanded" : ""}`;
  const projectName = session.open.project.project.name;
  const inspectorEdit = (section: string, field: string, value: string | number | boolean) => {
    if (selection[0] === undefined) return;
    command({ kind: "inspector.edit", expectedProjectRevision: session.open.status.projectRevision,
      expectedViewRevision: session.open.status.viewRevision, item: selection[0], section, field, value });
  };
  const materialize = (entry: NleStudioComponentCatalogEntry) => void perform(async () => {
    const destination = scene.tracks.find(track => track.kind === "picture" && !track.locked);
    if (destination === undefined) throw new Error("当前 Composition 没有可写的画面轨道。");
    const item = `component-${crypto.randomUUID()}`;
    const next = await materializeComponent({
      expectedProjectRevision: session.open.status.projectRevision,
      expectedViewRevision: session.open.status.viewRevision,
      package: entry.package,
      offering: entry.offering,
      item,
      composition: scene.composition,
      track: destination.id,
      atFrame: frame,
    });
    setSession(next);
    setSelection([item]);
    setInspector((await readInspector(item)).inspector);
  });
  const placeProjectMedia = (entry: NleStudioMediaEntry, drop?: MediaDrop) => void perform(async () => {
    if (entry.state !== "available") throw new Error(entry.diagnostic ?? "这个项目媒体当前不可用。");
    const trackKind = entry.kind === "audio" ? "audio" : "picture";
    const durationFrames = entry.durationFrames ?? Math.max(1, Math.round(fps * 5));
    const atFrame = drop?.frame ?? frame;
    const fits = (track: NleStudioSession["open"]["timeline"]["tracks"][number]) => track.kind === trackKind
      && !track.locked && track.items.every(item => item.role !== "adjust"
        && (atFrame + durationFrames <= item.startFrame || atFrame >= item.startFrame + item.durationFrames));
    let current = session;
    let destination = scene.tracks.find(track => track.id === drop?.track && fits(track)) ?? scene.tracks.find(track => fits(track));
    if (destination === undefined) {
      const track = `track-${crypto.randomUUID().slice(0, 8)}`;
      current = await sendCommand({
        kind: "project.transact",
        expectedProjectRevision: current.open.status.projectRevision,
        expectedViewRevision: current.open.status.viewRevision,
        commands: [{
          kind: "track.add",
          composition: scene.composition,
          track: { id: track, name: trackKind === "audio" ? "音频轨道" : "视频轨道", kind: trackKind,
            enabled: true, items: [] },
          ...(trackKind === "picture" && activeComposition.tracks.find(candidate => candidate.kind === "audio") !== undefined
            ? { before: activeComposition.tracks.find(candidate => candidate.kind === "audio")!.id } : {}),
        }],
      });
      destination = current.open.timeline.tracks.find(candidate => candidate.id === track);
      if (destination === undefined) throw new Error("新建的媒体轨道没有出现在当前时间线中。");
    }
    const item = `media-${crypto.randomUUID()}`;
    const next = await placeMedia({
      expectedProjectRevision: current.open.status.projectRevision,
      expectedViewRevision: current.open.status.viewRevision,
      item,
      reference: { path: entry.id },
      composition: scene.composition,
      track: destination.id,
      atFrame,
      durationFrames,
      includeAudio: entry.kind === "audiovisual",
    });
    setSession(next);
    setSource(undefined); setFrame(atFrame);
    setSelection([item]);
    setInspector((await readInspector(item)).inspector);
  });
  placeFromDrag.current = drop => { const entry = session.media.entries.find(entry => entry.id === drop.id); if (entry) placeProjectMedia(entry, drop); };
  const importProjectMedia = (files: readonly File[]) => void perform(async () => {
    let next = session;
    for (const file of files) {
      next = await importMedia(file);
      setSession(next);
    }
  });
  const materializeEffect = (entry: NleStudioAdjustCatalogEntry) => void perform(async () => {
    const compatible = scene.tracks.filter(track => track.kind === entry.medium && !track.locked);
    const destination = entry.medium === "picture" ? compatible.at(-1) : compatible[0];
    if (destination === undefined) throw new Error(`当前 Composition 没有可写的${entry.medium === "picture" ? "画面" : "音频"}轨道。`);
    const item = `adjust-${crypto.randomUUID()}`;
    const next = await materializeAdjust({
      expectedProjectRevision: session.open.status.projectRevision,
      expectedViewRevision: session.open.status.viewRevision,
      package: entry.package,
      offering: entry.offering,
      item,
      composition: scene.composition,
      track: destination.id,
      atFrame: frame,
    });
    setSession(next);
    setSelection([item]);
    setInspector((await readInspector(item)).inspector);
  });
  const materializeSelectedTransition = (entry: NleStudioTransitionCatalogEntry) => void perform(async () => {
    if (selection.length !== 2) throw new Error("添加转场前需要选择同一画面轨道上直接相接的两个片段。");
    const items = activeComposition.tracks.flatMap(track => track.items.map(item => ({ track, item })))
      .filter(candidate => selection.includes(candidate.item.id));
    if (items.length !== 2 || items[0]!.track.id !== items[1]!.track.id || items[0]!.track.kind !== "picture") {
      throw new Error("转场需要同一画面轨道上的两个片段。");
    }
    const ordered = [...items].sort((left, right) => {
      const editFps = scene.editRate.numerator / scene.editRate.denominator;
      const frameOf = (value: ExactTemporalValue) => Number(value.ticks) * value.timeBase.numerator
        / value.timeBase.denominator * editFps;
      return frameOf(left.item.start) - frameOf(right.item.start);
    });
    const transition = `transition-${crypto.randomUUID()}`;
    const next = await materializeTransition({
      expectedProjectRevision: session.open.status.projectRevision,
      expectedViewRevision: session.open.status.viewRevision,
      package: entry.package,
      offering: entry.offering,
      transition,
      composition: scene.composition,
      outgoing: ordered[0]!.item.id,
      incoming: ordered[1]!.item.id,
    });
    setSession(next);
  });

  return <div ref={workspace} className="nle-workspace nle-active"><div className={classes} style={{
    "--nle-bin-preferred": `${panelWidths.bin}px`,
    "--nle-properties-preferred": `${panelWidths.properties}px`,
  } as React.CSSProperties}>
      <div className="nle-titlebar"><div className="nle-titlebar-side"><small>{session.open.status.projectDirty || session.open.status.viewDirty ? "未保存" : "已保存"}</small></div><strong>{projectName}</strong><div className="nle-titlebar-side end"><div className="nle-toolbar-actions">
        <IconButton label="撤销" disabled={busy || !session.open.status.projectHistory.canUndo} onClick={() => command({ kind: "project.undo", expectedProjectRevision: session.open.status.projectRevision })}><Undo2 size={16}/></IconButton>
        <IconButton label="重做" disabled={busy || !session.open.status.projectHistory.canRedo} onClick={() => command({ kind: "project.redo", expectedProjectRevision: session.open.status.projectRevision })}><Redo2 size={16}/></IconButton>
        <button className="button" disabled={busy} onClick={() => void perform(async () => { setSession(await reloadSession()); select([]); })}>重载</button>
        <button className="button primary" disabled={busy || !session.open.status.projectDirty && !session.open.status.viewDirty} onClick={() => void perform(async () => setSession(await saveSession()))}><Save size={14}/>保存</button>
      </div></div></div>
      {failure !== undefined && <div className="studio-error">{failure}</div>}
      <div className="nle-upper">
        <aside className="nle-bin"><div className="nle-bin-tabs" role="tablist">{(Object.keys(icons) as BinTab[]).map(id => { const Icon = icons[id]; return <button type="button" role="tab" aria-selected={binTab === id} key={id} onClick={() => setBinTab(id)}><Icon size={18} strokeWidth={1.6}/><span>{tabNames[id]}</span></button>; })}</div><div className="nle-bin-body"><StudioBin tab={binTab} catalog={session.catalog} media={session.media} disabled={busy} onImportMedia={importProjectMedia} onPlaceMedia={placeProjectMedia} selectedMedia={source?.id} onPreviewMedia={entry => { setPlaying(false); setSource(entry); }} onBeginMediaDrag={assetDrag.start} onMaterialize={materialize} onMaterializeAdjust={materializeEffect} onMaterializeTransition={materializeSelectedTransition}/></div></aside>
        <PanelResizeHandle side="bin" label="调整素材面板宽度" width={panelWidths.bin} onResize={(width, save) => resizePanel("bin", width, save)}/>
        <section className="nle-monitor"><div className="nle-panel-header nle-monitor-title"><span>{projectName}</span><IconButton label={previewExpanded ? "恢复预览" : "放大预览"} onClick={() => setPreviewExpanded(value => !value)}>{previewExpanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</IconButton></div>
          <div className="nle-stage"><SourcePreview entry={source} onClose={() => setSource(undefined)}/><div className="nle-editable-preview" style={{ "--canvas-ratio": session.open.canvas.canvas.width / session.open.canvas.canvas.height } as React.CSSProperties}><div className="studio-canvas">
            {session.preview.state === "ready" && <img className="studio-preview-frame" src={session.preview.resource}/>}
            {session.preview.state !== "ready" && session.open.canvas.layers.filter(layer => activeItems.has(layer.id) && layer.layout !== undefined).map(layer => { const layout = layer.layout!; const canvas = session.open.canvas.canvas; const media = mediaForItem(layer.id); return <button type="button" key={layer.id} className={`studio-canvas-layer${selection.includes(layer.id) ? " selected" : ""}`} onClick={() => select([layer.id])} style={{ left: `${layout.x / canvas.width * 100}%`, top: `${layout.y / canvas.height * 100}%`, width: `${layout.width / canvas.width * 100}%`, height: `${layout.height / canvas.height * 100}%` }}>{media?.resource && media.mediaType?.startsWith("image/") ? <img src={media.resource} style={{ objectFit: layout.fit }}/> : media?.resource && media.mediaType?.startsWith("video/") ? <video src={media.resource} muted playsInline style={{ objectFit: layout.fit }}/> : undefined}<span>{layer.title}</span></button>; })}
            {session.preview.state !== "ready" && <CanvasControls scene={session.open.canvas} active={activeItems} selection={selection} disabled={busy} onSelect={select}
              onTranslate={(item, deltaX, deltaY) => command({ kind: "spatial.edit", expectedProjectRevision: session.open.status.projectRevision, expectedViewRevision: session.open.status.viewRevision, item, edit: { kind: "frame.translate", deltaX, deltaY } })}
              onResize={(item, next) => command({ kind: "spatial.edit", expectedProjectRevision: session.open.status.projectRevision, expectedViewRevision: session.open.status.viewRevision, item, edit: { kind: "frame.resize", frame: next } })}/>}
            {session.preview.state !== "ready" && <small className="studio-preview-state">剪辑布局</small>}
          </div></div></div>
          <div className="nle-transport"><span className="nle-transport-time"><span className="current">{timecode(frame, fps)}</span><span className="separator">/</span><span className="total">{timecode(scene.maximumFrame, fps)}</span></span><button className="nle-play" aria-label={playing ? "暂停" : "播放"} onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><span className="nle-transport-actions"><IconButton label="上一帧" onClick={() => { setPlaying(false); setFrame(value => Math.max(0, value - 1)); }}><StepBack size={15}/></IconButton><IconButton label="下一帧" onClick={() => { setPlaying(false); setFrame(value => Math.min(scene.maximumFrame, value + 1)); }}><StepForward size={15}/></IconButton><IconButton label="静音" onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={15}/> : <Volume2 size={15}/>}</IconButton></span></div>
        </section>
        <PanelResizeHandle side="properties" label="调整属性面板宽度" width={panelWidths.properties} onResize={(width, save) => resizePanel("properties", width, save)}/>
        <aside className="nle-properties"><div className="nle-properties-tabs" role="tablist"><button role="tab" aria-selected="true">属性</button></div><div className="nle-panel-body"><Inspector scene={inspector} disabled={busy} onEdit={inspectorEdit}/></div></aside>
      </div>
      <Timeline key={`${session.projectDocument.path}/${scene.composition}`} session={session} frame={frame} selection={selection} busy={busy} onSeek={value => { setPlaying(false); setSource(undefined); setFrame(value); }} onSelect={select}
        draggedMedia={assetDrag.drag?.entry} mediaDrop={assetDrag.drag?.drop}
        onMove={plan => transact([
          ...plan.additions.map(addition => ({ kind: "track.add" as const, composition: scene.composition,
            track: { id: addition.id, name: addition.name, kind: addition.kind, enabled: true, items: [] },
            ...(addition.before === undefined ? {} : { before: addition.before }) })),
          { kind: "item.move", ids: plan.ids, delta: exactFrame(plan.deltaFrames, session),
            ...(plan.destinations.length === 0 ? {} : { destinations: plan.destinations }) },
        ])}
        onTrim={(item, edge, atFrame) => transact([{ kind: "item.trim", id: item.id, edge, at: exactFrame(atFrame, session) }])}
        onTrimSelection={(items, edge, atFrame) => transact(items.map(item => ({ kind: "item.trim", id: item.id, edge, at: exactFrame(atFrame, session) })))}
        onSplit={(items, atFrame) => transact(items.map(item => ({ kind: "item.split", id: item.id, at: exactFrame(atFrame, session), rightId: `split-${crypto.randomUUID()}` })))}
        onRemove={() => { const ids = editableSelection(scene, selection); if (ids.length) transact([{ kind: "item.remove", ids }]); }}
        onTrackEnabled={(track, enabled) => transact([{ kind: "track.update", id: track, enabled }])}
        onTrackLocked={(track, locked) => viewTransact([{ kind: "track-lock.set", composition: scene.composition, track, locked }])}
        onTrackMove={(track, before) => transact([{ kind: "track.move", id: track, ...(before === undefined ? {} : { before }) }])}
        onComposition={composition => viewTransact([{ kind: "view.update", activeComposition: composition }])}
        onAddTrack={() => transact([{ kind: "track.add", composition: scene.composition, track: { id: `track-${crypto.randomUUID().slice(0, 8)}`, name: "新轨道", kind: "picture", enabled: true, items: [] } }])}
        canToggleGroup={canToggleGroup} grouped={grouped} onToggleGroup={() => {
          if (!canToggleGroup) return;
          if (grouped) {
            viewTransact([{ kind: "group.remove", composition: scene.composition, id: selectedGroups[0]!.id }]);
            return;
          }
          const members = [...new Set([...selection, ...selectedGroups.flatMap(group => group.items)])];
          viewTransact([
            ...selectedGroups.map(group => ({ kind: "group.remove" as const, composition: scene.composition, id: group.id })),
            { kind: "group.add", composition: scene.composition, group: { id: `group-${crypto.randomUUID().slice(0, 8)}`, name: "组合", items: members } },
          ]);
        }}
        canDetachAudio={canDetachAudio} onDetachAudio={() => {
          if (!canDetachAudio || selectedProjectItem === undefined) return;
          const existing = scene.tracks.find(track => track.kind === "audio" && !track.locked);
          const track = existing?.id ?? `audio-${crypto.randomUUID().slice(0, 8)}`;
          transact([
            ...(existing === undefined ? [{ kind: "track.add" as const, composition: scene.composition,
              track: { id: track, name: "音频轨道", kind: "audio" as const, enabled: true, items: [] } }] : []),
            { kind: "item.detach-audio", id: selectedProjectItem.id,
              audioItemId: `audio-item-${crypto.randomUUID().slice(0, 8)}`, track },
          ]);
        }}
        onUndo={() => command({ kind: "project.undo", expectedProjectRevision: session.open.status.projectRevision })}
        onRedo={() => command({ kind: "project.redo", expectedProjectRevision: session.open.status.projectRevision })}/>
    </div><AnimatePresence>{assetDrag.drag && <motion.div className="studio-asset-floating" initial={{ opacity: 0 }} animate={{ opacity: assetDrag.drag.drop ? 1 : .6 }} exit={{ opacity: 0 }} style={{ left: assetDrag.drag.x + 12, top: assetDrag.drag.y + 12 }}>{assetDrag.drag.entry.name}</motion.div>}</AnimatePresence></div>;
}
