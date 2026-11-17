import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import { Blend, Captions, Images, Maximize2, Minimize2, Pause, Play, Redo2, Save, StepBack, StepForward, Type, Undo2, Volume2, VolumeX, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  NleStudioAdjustCatalogEntry,
  NleStudioComponentCatalogEntry,
  NleStudioInvalidation,
  NleStudioMediaEntry,
  NleStudioOpenProjection,
  NleStudioOperation,
  NleStudioOperationReceipt,
  NleStudioProcessCatalogEntry,
  NleStudioTransitionCatalogEntry,
} from "../protocol.js";
import {
  connectStudioEvents,
  importMedia,
  operate,
  readInspector,
  readOpen,
  readTransitionInspector,
  refreshOpen,
  reloadSession,
  saveSession,
  sendCommand,
} from "./api.js";
import { CanvasControls } from "./CanvasControls.js";
import { IconButton } from "./common.js";
import { Inspector, TransitionInspector } from "./Inspector.js";
import { PanelResizeHandle, defaultPanelWidths, type PanelSide } from "./PanelResizeHandle.js";
import { StudioBin, type BinTab } from "./StudioBin.js";
import { Timeline } from "./Timeline.js";
import { timecode } from "./timecode.js";
import { usePreview } from "./usePreview.js";

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
  const [session, setSession] = useState<NleStudioOpenProjection>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [inspector, setInspector] = useState<Awaited<ReturnType<typeof readInspector>>>();
  const [transitionInspector, setTransitionInspector] = useState<Awaited<ReturnType<typeof readTransitionInspector>>>();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewFrom, setPreviewFrom] = useState(0);
  const [muted, setMuted] = useState(false);
  const [binTab, setBinTab] = useState<BinTab>("assets");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [panelWidths, setPanelWidths] = useState(readPanelWidths);
  const sessionRef = useRef<NleStudioOpenProjection | undefined>(undefined);
  const selectionRef = useRef<readonly string[]>([]);
  const work = useRef<Promise<void>>(Promise.resolve());
  const busyRef = useRef(false);
  const activeTransition = selection.length === 2 ? session?.timeline.scene.transitions.find(value =>
    selection.includes(value.outgoing) && selection.includes(value.incoming))?.id : undefined;
  const projectRevision = session?.status.projectRevision;
  const viewRevision = session?.status.viewRevision;
  const preview = usePreview({
    session, atFrame: previewFrom, playing,
    blocked: busy || session?.status.viewCompatibility === "stale",
  });

  useEffect(() => { if (!playing) setPreviewFrom(frame); }, [frame, playing]);
  useEffect(() => {
    setTransitionInspector(undefined);
    if (activeTransition === undefined) return;
    let active = true;
    void readTransitionInspector(activeTransition).then(value => {
      if (active) setTransitionInspector(value);
    }).catch((error: unknown) => {
      if (active) setFailure(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, [activeTransition, projectRevision, viewRevision]);

  const storeSession = useCallback((next: NleStudioOpenProjection) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const enqueue = useCallback((operation: () => Promise<void>) => {
    const result = work.current.then(operation);
    work.current = result.catch((error: unknown) =>
      setFailure(error instanceof Error ? error.message : String(error)));
    return work.current;
  }, []);

  const selectItems = useCallback((ids: readonly string[]) => {
    selectionRef.current = ids;
    setSelection(ids);
    setInspector(undefined);
  }, []);

  const refreshInspector = useCallback(async (current: NleStudioOpenProjection) => {
    const item = selectionRef.current[0];
    if (item === undefined) return;
    if (!current.timeline.scene.tracks.some(track => track.items.some(entry => entry.id === item))) {
      selectItems([]);
      return;
    }
    const next = await readInspector(item);
    if (selectionRef.current[0] === item) setInspector(next);
  }, [selectItems]);

  const resizePanel = (side: PanelSide, width: number, save: boolean) => {
    setPanelWidths(previous => {
      const next = { ...previous, [side]: width };
      if (save) localStorage.setItem("hypit:nle:panel-sizes", JSON.stringify(next));
      return next;
    });
  };

  const perform = useCallback(async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setFailure(undefined); setPlaying(false);
    try { await enqueue(operation); }
    finally { busyRef.current = false; setBusy(false); }
  }, [enqueue]);

  useEffect(() => {
    let active = true;
    let scheduled = false;
    let open = false;
    const pending = new Set<NleStudioInvalidation>();
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      void enqueue(async () => {
        scheduled = false;
        if (!active) return;
        const invalidated = [...pending];
        pending.clear();
        const reread = open || sessionRef.current === undefined;
        open = false;
        const projection = reread ? await readOpen() : await refreshOpen(sessionRef.current!, { invalidated });
        if (!active) return;
        storeSession(projection);
        if (reread || invalidated.includes("inspector")) await refreshInspector(projection);
      });
    };
    const disconnect = connectStudioEvents({
      ready: () => { setFailure(undefined); open = true; schedule(); },
      change: event => {
        if (event.scope === "action") return;
        for (const projection of event.invalidated) pending.add(projection);
        schedule();
      },
      invalid: error => setFailure(error.message),
    });
    return () => { active = false; disconnect(); };
  }, [enqueue, refreshInspector, storeSession]);

  const select = useCallback((ids: readonly string[]) => {
    selectItems(ids);
    if (ids.length > 0) void enqueue(async () => {
      if (sessionRef.current !== undefined) await refreshInspector(sessionRef.current);
    });
  }, [enqueue, refreshInspector, selectItems]);

  const acceptReceipt = useCallback(async (receipt: NleStudioOperationReceipt, item?: string) => {
    const current = sessionRef.current;
    if (current === undefined) return;
    const next = await refreshOpen(current, receipt);
    storeSession(next);
    if (item !== undefined) selectItems([item]);
    if (item !== undefined || receipt.invalidated.includes("inspector")) await refreshInspector(next);
  }, [refreshInspector, selectItems, storeSession]);

  const command = useCallback((value: NleEditingSurfaceCommand) => void perform(async () => {
    await acceptReceipt(await sendCommand(value));
  }), [acceptReceipt, perform]);

  const transact = useCallback((commands: Extract<NleEditingSurfaceCommand, { kind: "project.transact" }>["commands"]) => {
    if (session === undefined) return;
    command({ kind: "project.transact", expectedProjectRevision: session.status.projectRevision,
      expectedViewRevision: session.status.viewRevision, commands });
  }, [command, session]);

  const viewTransact = useCallback((commands: Extract<NleEditingSurfaceCommand, { kind: "view.transact" }>["commands"]) => {
    if (session === undefined) return;
    command({ kind: "view.transact", expectedProjectRevision: session.status.projectRevision,
      expectedViewRevision: session.status.viewRevision, commands });
  }, [command, session]);

  const removeSelection = useCallback(() => {
    if (selection.length === 0 || session?.status.viewCompatibility !== "compatible") return;
    void perform(async () => {
      await acceptReceipt(await operate({
        kind: "timeline.remove", composition: session.timeline.scene.composition,
        expectedProjectRevision: session.status.projectRevision, expectedViewRevision: session.status.viewRevision,
        items: selection,
      }));
      selectItems([]);
    });
  }, [acceptReceipt, perform, selection, selectItems, session]);

  const editClipboard = useCallback((kind: "clipboard.copy" | "clipboard.cut" | "clipboard.paste" | "clipboard.apply-groups") => {
    if (session?.status.viewCompatibility !== "compatible") return;
    const target = {
      composition: session.timeline.scene.composition,
      expectedProjectRevision: session.status.projectRevision,
      expectedViewRevision: session.status.viewRevision,
    };
    void perform(async () => {
      if (kind === "clipboard.paste") {
        const receipt = await operate({ ...target, kind, atFrame: frame });
        const item = receipt.result?.item;
        await acceptReceipt(receipt, typeof item === "string" ? item : undefined);
      } else if (kind === "clipboard.apply-groups") {
        await acceptReceipt(await operate({ ...target, kind }));
      } else {
        await acceptReceipt(await operate({ ...target, kind, items: selection }));
        if (kind === "clipboard.cut") selectItems([]);
      }
    });
  }, [acceptReceipt, frame, perform, selection, selectItems, session]);

  const togglePlayback = useCallback(() => {
    if (playing) { setPlaying(false); return; }
    const maximum = session?.timeline.scene.maximumFrame ?? 0;
    if (busyRef.current || maximum < 1) return;
    const start = frame >= maximum ? 0 : frame;
    setFrame(start);
    setPreviewFrom(start);
    setPlaying(true);
  }, [frame, playing, session]);

  useEffect(() => {
    if (!playing || session === undefined || preview.playback) return;
    const fps = session.timeline.scene.editRate.numerator / session.timeline.scene.editRate.denominator;
    const startFrame = frame >= session.timeline.scene.maximumFrame - 1 ? 0 : frame;
    const started = performance.now(); let animation = 0;
    const tick = (now: number) => {
      const next = startFrame + Math.floor((now - started) * fps / 1000);
      if (next >= session.timeline.scene.maximumFrame) { setFrame(session.timeline.scene.maximumFrame); setPlaying(false); return; }
      setFrame(next); animation = requestAnimationFrame(tick);
    };
    setFrame(startFrame); animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, preview.playback]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as Element | null)?.closest("input,textarea,select,[contenteditable=true]")) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.repeat) {
        const key = event.key.toLowerCase();
        if ((key === "c" || key === "x") && selection.length > 0) {
          event.preventDefault();
          editClipboard(key === "c" ? "clipboard.copy" : "clipboard.cut");
        } else if (key === "v" && (session?.clipboard.items ?? 0) > 0) {
          event.preventDefault();
          editClipboard("clipboard.paste");
        }
      }
      if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
      if ((event.key === "Delete" || event.key === "Backspace") && selection.length > 0) {
        event.preventDefault();
        removeSelection();
      }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [selection, removeSelection, editClipboard, session?.clipboard.items, togglePlayback]);

  const activeItems = useMemo(() => new Set(session?.timeline.scene.tracks.flatMap(track => track.items)
    .filter(item => frame >= item.startFrame && frame < item.startFrame + item.durationFrames && item.enabled)
    .map(item => item.id) ?? []), [frame, session]);

  if (session === undefined) return <div className="nle-editor nle-loading">{failure ?? "正在打开 NLE Studio…"}</div>;
  const scene = session.timeline.scene;
  const staleView = session.status.viewCompatibility === "stale";
  const editingDisabled = busy || staleView;
  const fps = scene.editRate.numerator / scene.editRate.denominator;
  const renderedPreview = preview.state?.state === "complete" ? preview.state.result : undefined;
  const previewDiagnostic = preview.state?.state === "failed" ? preview.state.diagnostic : preview.failure;
  const mediaByPath = new Map(session.media.entries.map(entry => [entry.id, entry] as const));
  const mediaByItem = new Map(session.timeline.itemMedia.map(entry => [entry.item, entry.media] as const));
  const mediaForItem = (itemId: string) => mediaByPath.get(mediaByItem.get(itemId) ?? "");
  const selectedProjectItem = scene.tracks.flatMap(track => track.items).find(item => item.id === selection[0]);
  const selectedGroups = scene.groups.filter(group => group.items.some(item => selection.includes(item)));
  const grouped = selectedGroups.length === 1 && selectedGroups[0]!.items.every(item => selection.includes(item))
    && selection.every(item => selectedGroups[0]!.items.includes(item));
  const canToggleGroup = selection.length > 1 || selectedGroups.length > 0;
  const canDetachAudio = selection.length === 1 && selectedProjectItem?.role === "present"
    && selectedProjectItem.signals.picture && selectedProjectItem.signals.audio;
  const icons = { assets: Images, text: Type, subtitles: Captions, transitions: Blend, effects: Wand2 } as const;
  const tabNames = { assets: "素材", text: "文本", subtitles: "字幕", transitions: "转场", effects: "效果" } as const;
  const classes = `nle-editor${previewExpanded ? " nle-preview-expanded" : ""}`;
  const projectName = session.project.name;
  const inspectorEdit = (section: string, field: string, value: string | number | boolean) => {
    if (selection[0] === undefined) return;
    command({ kind: "inspector.edit", expectedProjectRevision: session.status.projectRevision,
      expectedViewRevision: session.status.viewRevision, item: selection[0], section, field, value });
  };
  const operationContext = {
    composition: scene.composition,
    expectedProjectRevision: session.status.projectRevision,
    expectedViewRevision: session.status.viewRevision,
  };
  const place = (operation: NleStudioOperation) => void perform(async () => {
    const receipt = await operate(operation);
    await acceptReceipt(receipt, typeof receipt.result?.item === "string" ? receipt.result.item : undefined);
  });
  const navigate = (operation: NleStudioOperation) => void perform(async () => {
    const receipt = await operate(operation);
    await acceptReceipt(receipt);
    if (typeof receipt.result?.frame === "number") {
      setFrame(Math.min(receipt.result.frame, sessionRef.current?.timeline.scene.maximumFrame ?? 0));
      selectItems([]);
    }
  });
  const materialize = (entry: NleStudioComponentCatalogEntry) => place({
    ...operationContext, kind: "component.materialize", package: entry.package, offering: entry.offering, atFrame: frame,
  });
  const placeProjectMedia = (entry: NleStudioMediaEntry) => place({
    ...operationContext, kind: "media.materialize", media: entry.id, atFrame: frame,
  });
  const importProjectMedia = (files: readonly File[]) => void perform(async () => {
    for (const file of files) await acceptReceipt(await importMedia(file));
  });
  const materializeEffect = (entry: NleStudioAdjustCatalogEntry) => place({
    ...operationContext, kind: "adjust.materialize", package: entry.package, offering: entry.offering, atFrame: frame,
  });
  const materializeProcess = (entry: NleStudioProcessCatalogEntry) => void perform(async () => {
    if (selection.length !== 1 || selectedProjectItem?.role !== "present") return;
    await acceptReceipt(await operate({
      ...operationContext, kind: "process.materialize", package: entry.package, offering: entry.offering, item: selectedProjectItem.id,
    }));
  });
  const materializeSelectedTransition = (entry: NleStudioTransitionCatalogEntry) => void perform(async () => {
    if (selection.length !== 2) throw new Error("添加转场前需要选择两个直接相接的片段。");
    const offering = { ...operationContext, package: entry.package, offering: entry.offering };
    await acceptReceipt(await operate(activeTransition === undefined
      ? { ...offering, kind: "transition.materialize", items: [selection[0]!, selection[1]!] }
      : { ...offering, kind: "transition.replace", transition: activeTransition }));
  });

  return <div className="nle-workspace nle-active"><div className={classes} style={{
    "--nle-bin-preferred": `${panelWidths.bin}px`,
    "--nle-properties-preferred": `${panelWidths.properties}px`,
  } as React.CSSProperties}>
      <div className="nle-titlebar"><div className="nle-titlebar-side"><small>{session.status.projectDirty ? "未保存" : "已保存"}</small></div><strong>{projectName}</strong><div className="nle-titlebar-side end"><div className="nle-toolbar-actions">
        <IconButton label="撤销" disabled={busy || !session.status.projectHistory.canUndo} onClick={() => command({ kind: "project.undo", expectedProjectRevision: session.status.projectRevision })}><Undo2 size={16}/></IconButton>
        <IconButton label="重做" disabled={busy || !session.status.projectHistory.canRedo} onClick={() => command({ kind: "project.redo", expectedProjectRevision: session.status.projectRevision })}><Redo2 size={16}/></IconButton>
        <button className="button" disabled={busy} onClick={() => void perform(async () => { await acceptReceipt(await reloadSession()); select([]); })}>重载</button>
        <button className="button primary" disabled={busy || !session.status.projectDirty && !session.status.viewDirty} onClick={() => void perform(async () => acceptReceipt(await saveSession()))}><Save size={14}/>保存</button>
      </div></div></div>
      {failure !== undefined && <div className="studio-error">{failure}</div>}
      {staleView && <div className="studio-error">当前 View 有失效引用。 <button className="button" disabled={busy}
        onClick={() => command({ kind: "view.reconcile", expectedProjectRevision: session.status.projectRevision,
          expectedViewRevision: session.status.viewRevision })}>整理 View 引用</button></div>}
      <div className="nle-upper">
        <aside className="nle-bin"><div className="nle-bin-tabs" role="tablist">{(Object.keys(icons) as BinTab[]).map(id => { const Icon = icons[id]; return <button type="button" role="tab" aria-selected={binTab === id} key={id} onClick={() => setBinTab(id)}><Icon size={18} strokeWidth={1.6}/><span>{tabNames[id]}</span></button>; })}</div><div className="nle-bin-body"><StudioBin tab={binTab} catalog={session.catalog} media={session.media} disabled={editingDisabled}
          processSignals={selection.length === 1 && selectedProjectItem?.role === "present"
            && scene.tracks.find(track => track.id === selectedProjectItem.track)?.locked === false ? selectedProjectItem.signals : undefined}
          onImportMedia={importProjectMedia} onPlaceMedia={placeProjectMedia} onMaterialize={materialize}
          onMaterializeAdjust={materializeEffect} onMaterializeProcess={materializeProcess} onMaterializeTransition={materializeSelectedTransition}/></div></aside>
        <PanelResizeHandle side="bin" label="调整素材面板宽度" width={panelWidths.bin} onResize={(width, save) => resizePanel("bin", width, save)}/>
        <section className="nle-monitor"><div className="nle-panel-header nle-monitor-title"><span>{projectName}</span><IconButton label={previewExpanded ? "恢复预览" : "放大预览"} onClick={() => setPreviewExpanded(value => !value)}>{previewExpanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</IconButton></div>
          <div className="nle-stage"><div className="nle-editable-preview" style={{ "--canvas-ratio": session.canvas.canvas.width / session.canvas.canvas.height } as React.CSSProperties}><div className="studio-canvas">
            {renderedPreview?.mediaType === "image/png" && <img className="studio-preview-frame" src={renderedPreview.resource}/>}
            {renderedPreview?.mediaType === "video/mp4" && playing && <video className="studio-preview-frame"
              key={renderedPreview.resource} src={renderedPreview.resource} muted={muted} autoPlay playsInline
              onTimeUpdate={event => setFrame(Math.min(scene.maximumFrame, previewFrom + Math.floor(event.currentTarget.currentTime * fps)))}
              onEnded={() => {
                const next = previewFrom + (renderedPreview.frameCount ?? 1);
                setFrame(Math.min(next, scene.maximumFrame));
                if (next >= scene.maximumFrame) setPlaying(false);
                else setPreviewFrom(next);
              }}/>}
            {renderedPreview === undefined && session.canvas.layers.filter(layer => activeItems.has(layer.id) && layer.layout !== undefined).map(layer => { const layout = layer.layout!; const canvas = session.canvas.canvas; const media = mediaForItem(layer.id); return <button type="button" key={layer.id} className={`studio-canvas-layer${selection.includes(layer.id) ? " selected" : ""}`} onClick={() => select([layer.id])} style={{ left: `${layout.x / canvas.width * 100}%`, top: `${layout.y / canvas.height * 100}%`, width: `${layout.width / canvas.width * 100}%`, height: `${layout.height / canvas.height * 100}%` }}>{media?.resource && media.mediaType?.startsWith("image/") ? <img src={media.resource} style={{ objectFit: layout.fit }}/> : media?.resource && media.mediaType?.startsWith("video/") ? <video src={media.resource} muted playsInline style={{ objectFit: layout.fit }}/> : undefined}<span>{layer.title}</span></button>; })}
            {!playing && <CanvasControls scene={session.canvas} active={activeItems} selection={selection} disabled={editingDisabled} onSelect={select}
              onTranslate={(item, deltaX, deltaY) => command({ kind: "spatial.edit", expectedProjectRevision: session.status.projectRevision, expectedViewRevision: session.status.viewRevision, item, edit: { kind: "frame.translate", deltaX, deltaY } })}
              onResize={(item, next) => command({ kind: "spatial.edit", expectedProjectRevision: session.status.projectRevision, expectedViewRevision: session.status.viewRevision, item, edit: { kind: "frame.resize", frame: next } })}/>}
            {previewDiagnostic !== undefined && <small title={previewDiagnostic} className="studio-preview-state">预览渲染失败</small>}
            {previewDiagnostic === undefined && renderedPreview === undefined && <small className="studio-preview-state">
              {session.preview.state === "unavailable" ? "结构画布" : preview.state?.state === "running" ? "正在渲染预览" : "预览待就绪"}
            </small>}
          </div></div></div>
          <div className="nle-transport"><span className="nle-transport-time"><span className="current">{timecode(frame, fps)}</span><span className="separator">/</span><span className="total">{timecode(scene.maximumFrame, fps)}</span></span><button className="nle-play" aria-label={playing ? "暂停" : "播放"} onClick={togglePlayback}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><span className="nle-transport-actions"><IconButton label="上一帧" onClick={() => { setPlaying(false); setFrame(value => Math.max(0, value - 1)); }}><StepBack size={15}/></IconButton><IconButton label="下一帧" onClick={() => { setPlaying(false); setFrame(value => Math.min(scene.maximumFrame, value + 1)); }}><StepForward size={15}/></IconButton><IconButton label="静音" onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={15}/> : <Volume2 size={15}/>}</IconButton></span></div>
        </section>
        <PanelResizeHandle side="properties" label="调整属性面板宽度" width={panelWidths.properties} onResize={(width, save) => resizePanel("properties", width, save)}/>
        <aside className="nle-properties"><div className="nle-properties-tabs" role="tablist"><button role="tab" aria-selected="true">属性</button></div><div className="nle-panel-body">{activeTransition !== undefined
          ? <TransitionInspector scene={transitionInspector?.id === activeTransition ? transitionInspector : undefined} disabled={editingDisabled}
            onEdit={(section, field, value) => command({ kind: "transition-inspector.edit", transition: activeTransition,
              section, field, value, expectedProjectRevision: session.status.projectRevision,
              expectedViewRevision: session.status.viewRevision })}
            onResize={durationFrames => place({ ...operationContext, kind: "transition.resize", transition: activeTransition, durationFrames })}
            onRemove={() => place({ ...operationContext, kind: "transition.remove", transition: activeTransition })}/>
          : <Inspector scene={inspector?.scene} component={inspector?.component} media={session.media.entries}
          disabled={editingDisabled} onEdit={inspectorEdit}
          onInvoke={(item, section, collection, row, action) => command({
            kind: "inspector.invoke", item, section, collection, row, action,
            expectedProjectRevision: session.status.projectRevision, expectedViewRevision: session.status.viewRevision,
          })} onMedia={(item, slot, media) => void perform(async () => {
            await acceptReceipt(await operate(media === ""
              ? { ...operationContext, kind: "component-media.unbind", item, slot }
              : { ...operationContext, kind: "component-media.bind", item, slot, media }));
          })} onProcessEdit={edit => void perform(async () => acceptReceipt(await operate({ ...operationContext, ...edit })))}/>}</div></aside>
      </div>
      <Timeline session={session} frame={frame} selection={selection} busy={editingDisabled} onSeek={value => { setPlaying(false); setFrame(value); }} onSelect={select}
        onMove={intent => void perform(async () => acceptReceipt(await operate({
          ...operationContext, kind: "timeline.drop", ...intent,
        })))}
        onTrim={(item, edge, atFrame) => void perform(async () => acceptReceipt(await operate({
          ...operationContext, kind: "timeline.trim", item: item.id, edge, atFrame,
        })))}
        onSplit={(items, atFrame) => void perform(async () => acceptReceipt(await operate({
          ...operationContext, kind: "timeline.split", items, atFrame,
        })))}
        onRemove={removeSelection}
        onApplyPastedGroups={() => editClipboard("clipboard.apply-groups")}
        onTrackEnabled={(track, enabled) => transact([{ kind: "track.update", id: track, enabled }])}
        onTrackLocked={(track, locked) => viewTransact([{ kind: "track-lock.set", composition: scene.composition, track, locked }])}
        onTrackMove={(track, before) => transact([{ kind: "track.move", id: track, ...(before === undefined ? {} : { before }) }])}
        onComposition={target => navigate({ ...operationContext, kind: "composition.select", target })}
        onEnterComposition={item => navigate({ ...operationContext, kind: "composition.enter", item, atFrame: frame })}
        onReturnComposition={() => navigate({ ...operationContext, kind: "composition.return" })}
        onCompound={() => place({ ...operationContext, kind: "composition.compound", items: selection, name: "复合片段" })}
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
        canDetachAudio={canDetachAudio} onDetachAudio={() => void perform(async () => {
          if (!canDetachAudio || selectedProjectItem === undefined) return;
          await acceptReceipt(await operate({ ...operationContext, kind: "audio.detach", item: selectedProjectItem.id }));
        })}
        onUndo={() => command({ kind: "project.undo", expectedProjectRevision: session.status.projectRevision })}
        onRedo={() => command({ kind: "project.redo", expectedProjectRevision: session.status.projectRevision })}/>
    </div></div>;
}
