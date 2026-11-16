import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import type { NleInspectorScene } from "@hypit/nle/view";
import { Blend, Captions, Images, Maximize2, Minimize2, Pause, Play, Redo2, Save, StepBack, StepForward, Type, Undo2, Volume2, VolumeX, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { NleStudioSession } from "../protocol.js";
import { readInspector, readSession, reloadSession, saveSession, sendCommand } from "./api.js";
import { CanvasControls } from "./CanvasControls.js";
import { IconButton } from "./common.js";
import { Inspector } from "./Inspector.js";
import { PanelResizeHandle, defaultPanelWidths, type PanelSide } from "./PanelResizeHandle.js";
import { StudioBin, type BinTab } from "./StudioBin.js";
import { Timeline } from "./Timeline.js";
import { timecode } from "./timecode.js";

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

  const resizePanel = (side: PanelSide, width: number, save: boolean) => {
    setPanelWidths(previous => {
      const next = { ...previous, [side]: width };
      if (save) localStorage.setItem("hypit:nle:panel-sizes", JSON.stringify(next));
      return next;
    });
  };

  const perform = useCallback(async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setFailure(undefined); setPlaying(false);
    try { await operation(); }
    catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }, [busy]);

  useEffect(() => { void perform(async () => setSession(await readSession())); }, []);

  const select = useCallback((ids: readonly string[]) => {
    setSelection(ids);
    if (ids.length === 0) { setInspector(undefined); return; }
    void perform(async () => setInspector((await readInspector(ids[0]!)).inspector));
  }, [perform]);

  const command = useCallback((value: NleEditingSurfaceCommand) => void perform(async () => {
    const next = await sendCommand(value);
    setSession(next);
    if (selection[0] !== undefined) setInspector((await readInspector(selection[0])).inspector);
  }), [perform, selection]);

  const transact = useCallback((commands: Extract<NleEditingSurfaceCommand, { kind: "project.transact" }>["commands"]) => {
    if (session === undefined) return;
    command({ kind: "project.transact", expectedProjectRevision: session.open.status.projectRevision,
      expectedViewRevision: session.open.status.viewRevision, commands });
  }, [command, session]);

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
      if ((event.target as Element | null)?.closest("input,textarea,select,[contenteditable=true]")) return;
      if (event.code === "Space") { event.preventDefault(); setPlaying(value => !value); }
      if ((event.key === "Delete" || event.key === "Backspace") && selection.length > 0) {
        event.preventDefault(); transact([{ kind: "item.remove", ids: selection }]); select([]);
      }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [selection, select, transact]);

  const activeItems = useMemo(() => new Set(session?.open.timeline.tracks.flatMap(track => track.items)
    .filter(item => frame >= item.startFrame && frame < item.startFrame + item.durationFrames && item.enabled)
    .map(item => item.id) ?? []), [frame, session]);

  if (session === undefined) return <div className="nle-editor nle-loading">{failure ?? "正在打开 NLE Studio…"}</div>;
  const scene = session.open.timeline;
  const activeComposition = session.open.project.project.compositions.find(composition => composition.id === scene.composition)!;
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

  const fps = scene.editRate.numerator / scene.editRate.denominator;
  return <div className="nle-workspace nle-active"><div className={classes} style={{
    "--nle-bin-preferred": `${panelWidths.bin}px`,
    "--nle-properties-preferred": `${panelWidths.properties}px`,
  } as React.CSSProperties}>
      <div className="nle-titlebar"><div className="nle-titlebar-side"><small>{session.open.status.projectDirty ? "未保存" : "已保存"}</small></div><strong>{projectName}</strong><div className="nle-titlebar-side end"><div className="nle-toolbar-actions">
        <IconButton label="撤销" disabled={busy || !session.open.status.projectHistory.canUndo} onClick={() => command({ kind: "project.undo", expectedProjectRevision: session.open.status.projectRevision })}><Undo2 size={16}/></IconButton>
        <IconButton label="重做" disabled={busy || !session.open.status.projectHistory.canRedo} onClick={() => command({ kind: "project.redo", expectedProjectRevision: session.open.status.projectRevision })}><Redo2 size={16}/></IconButton>
        <button className="button" disabled={busy} onClick={() => void perform(async () => { setSession(await reloadSession()); select([]); })}>重载</button>
        <button className="button primary" disabled={busy || !session.open.status.projectDirty && !session.open.status.viewDirty} onClick={() => void perform(async () => setSession(await saveSession()))}><Save size={14}/>保存</button>
      </div></div></div>
      {failure !== undefined && <div className="studio-error">{failure}</div>}
      <div className="nle-upper">
        <aside className="nle-bin"><div className="nle-bin-tabs" role="tablist">{(Object.keys(icons) as BinTab[]).map(id => { const Icon = icons[id]; return <button type="button" role="tab" aria-selected={binTab === id} key={id} onClick={() => setBinTab(id)}><Icon size={18} strokeWidth={1.6}/><span>{tabNames[id]}</span></button>; })}</div><div className="nle-bin-body"><StudioBin tab={binTab} project={session.open.project.project} media={session.media} onSelect={id => select([id])}/></div></aside>
        <PanelResizeHandle side="bin" label="调整素材面板宽度" width={panelWidths.bin} onResize={(width, save) => resizePanel("bin", width, save)}/>
        <section className="nle-monitor"><div className="nle-panel-header nle-monitor-title"><span>{projectName}</span><IconButton label={previewExpanded ? "恢复预览" : "放大预览"} onClick={() => setPreviewExpanded(value => !value)}>{previewExpanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</IconButton></div>
          <div className="nle-stage"><div className="nle-editable-preview" style={{ "--canvas-ratio": session.open.canvas.canvas.width / session.open.canvas.canvas.height } as React.CSSProperties}><div className="studio-canvas">
            {session.preview.state === "ready" && <img className="studio-preview-frame" src={session.preview.resource}/>}
            {session.preview.state !== "ready" && session.open.canvas.layers.filter(layer => activeItems.has(layer.id) && layer.layout !== undefined).map(layer => { const layout = layer.layout!; const canvas = session.open.canvas.canvas; return <button type="button" key={layer.id} className={`studio-canvas-layer${selection.includes(layer.id) ? " selected" : ""}`} onClick={() => select([layer.id])} style={{ left: `${layout.x / canvas.width * 100}%`, top: `${layout.y / canvas.height * 100}%`, width: `${layout.width / canvas.width * 100}%`, height: `${layout.height / canvas.height * 100}%` }}><span>{layer.title}</span></button>; })}
            {session.preview.state !== "ready" && <CanvasControls scene={session.open.canvas} active={activeItems} selection={selection} disabled={busy} onSelect={select}
              onTranslate={(item, deltaX, deltaY) => command({ kind: "spatial.edit", expectedProjectRevision: session.open.status.projectRevision, expectedViewRevision: session.open.status.viewRevision, item, edit: { kind: "frame.translate", deltaX, deltaY } })}
              onResize={(item, next) => command({ kind: "spatial.edit", expectedProjectRevision: session.open.status.projectRevision, expectedViewRevision: session.open.status.viewRevision, item, edit: { kind: "frame.resize", frame: next } })}/>}
            {session.preview.state !== "ready" && <small className="studio-preview-state">结构画布 · Preview Executor 未连接</small>}
          </div></div></div>
          <div className="nle-transport"><span className="nle-transport-time"><span className="current">{timecode(frame, fps)}</span><span className="separator">/</span><span className="total">{timecode(scene.maximumFrame, fps)}</span></span><button className="nle-play" aria-label={playing ? "暂停" : "播放"} onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><span className="nle-transport-actions"><IconButton label="上一帧" onClick={() => { setPlaying(false); setFrame(value => Math.max(0, value - 1)); }}><StepBack size={15}/></IconButton><IconButton label="下一帧" onClick={() => { setPlaying(false); setFrame(value => Math.min(scene.maximumFrame, value + 1)); }}><StepForward size={15}/></IconButton><IconButton label="静音" onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={15}/> : <Volume2 size={15}/>}</IconButton></span></div>
        </section>
        <PanelResizeHandle side="properties" label="调整属性面板宽度" width={panelWidths.properties} onResize={(width, save) => resizePanel("properties", width, save)}/>
        <aside className="nle-properties"><div className="nle-properties-tabs" role="tablist"><button role="tab" aria-selected="true">属性</button></div><div className="nle-panel-body"><Inspector scene={inspector} disabled={busy} onEdit={inspectorEdit}/></div></aside>
      </div>
      <Timeline session={session} frame={frame} selection={selection} busy={busy} onSeek={value => { setPlaying(false); setFrame(value); }} onSelect={select}
        onMove={plan => transact([
          ...plan.additions.map(addition => ({ kind: "track.add" as const, composition: scene.composition,
            track: { id: addition.id, name: addition.name, kind: addition.kind, enabled: true, items: [] },
            ...(addition.before === undefined ? {} : { before: addition.before }) })),
          { kind: "item.move", ids: plan.ids, delta: exactFrame(plan.deltaFrames, session),
            ...(plan.destinations.length === 0 ? {} : { destinations: plan.destinations }) },
        ])}
        onTrim={(item, edge, atFrame) => transact([{ kind: "item.trim", id: item.id, edge, at: exactFrame(atFrame, session) }])}
        onSplit={(item, atFrame) => transact([{ kind: "item.split", id: item.id, at: exactFrame(atFrame, session), rightId: `${item.id}-split-${crypto.randomUUID().slice(0, 8)}` }])}
        onRemove={() => { if (selection.length > 0) { transact([{ kind: "item.remove", ids: selection }]); select([]); } }}
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
    </div></div>;
}
