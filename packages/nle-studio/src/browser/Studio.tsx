import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import { nleCompositionDuration, nleLinearTimeMapping, type NleCommand, type NleItem, type NleTrack } from "@hypit/nle";
import type { NleInspectorScene, NleViewCommand } from "@hypit/nle/view";
import { Dialog } from "@base-ui/react/dialog";
import { Blend, Captions, Images, Maximize2, Minimize2, Pause, Play, Redo2, StepBack, StepForward, Type, Undo2, Volume2, VolumeX, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import type {
  NleStudioAdjustCatalogEntry,
  NleStudioComponentCatalogEntry,
  NleStudioConflict,
  NleStudioMediaEntry,
  NleStudioSession,
  NleStudioTransitionCatalogEntry,
} from "../protocol.js";
import {
  checkSessionDocuments,
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
  StudioConflictError,
} from "./api.js";
import { CanvasControls, type CanvasDraft } from "./CanvasControls.js";
import { TimelineMedia } from "./TimelineMedia.js";
import { PictureAlignment } from "./PictureAlignment.js";
import { TimelineTextList } from "./TimelineTextList.js";
import { IconButton } from "./common.js";
import { Inspector } from "./Inspector.js";
import { PanelResizeHandle, defaultPanelWidths, type PanelSide } from "./PanelResizeHandle.js";
import { StudioBin, type BinTab } from "./StudioBin.js";
import { Timeline } from "./Timeline.js";
import { timecode } from "./timecode.js";
import { editableSelection, linkedSelection, selectionAtFrame } from "./selection.js";
import { SourcePreview } from "./SourcePreview.js";
import { componentFitsTrack, mediaFitsTrack, mediaTrackCompatible, type MediaDrop } from "./mediaDrag.js";
import { copyItems, pasteItems, type ItemClipboard } from "./clipboard.js";
import { useClipClipboard } from "./useClipClipboard.js";
import { useAssetDrag } from "./useAssetDrag.js";
import { componentTrackRole, inferStudioTrackRole, studioTrackName } from "./timelineGeometry.js";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ErrorNotice } from "./ErrorNotice.js";
import { enterMotion } from "./motion.js";
import { useEditorPosition } from "./useEditorPosition.js";
import { EditingHistory, type EditorFocus } from "./editingHistory.js";
import { activeComposition as compositionOf, canFreezeItem, changeSpeed, closeTrackGaps, createCompound, duplicateCompound, editTransitionDuration, frameOf, frameTime, freezeItem, identity, magneticEdit, moveItemEditPlan, removeItems, reverseItems, rippleRemove, slipItems, trimItemCommand, unpackCompound, type EditPlan } from "./editPlans.js";
import { TransitionInspector } from "./TransitionInspector.js";
import { transitionCutAt, transitionCuts } from "./transitionCuts.js";
import { TemporalInspector } from "./TemporalInspector.js";
import { ProcessInspector } from "./ProcessInspector.js";
import { catalogDragId, type CatalogDrag } from "./catalogDrag.js";
import { EditorDialog } from "./EditorDialog.js";

const localSaveTime = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

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
  const reduced = useReducedMotion();
  const [session, updateSession] = useState<NleStudioSession>();
  const sessionRef = useRef<NleStudioSession | undefined>(undefined);
  const history = useRef(new EditingHistory());
  const legacyTrackRoles = useRef(new Map<string, NleTrack["role"]>());
  const setSession = useCallback((next: NleStudioSession) => {
    const timeline = next.open.timeline;
    const tracks = timeline.tracks.map(track => {
      if (track.role !== undefined) return track;
      const key = `${next.projectDocument.path}/${timeline.composition}/${track.id}`;
      if (!legacyTrackRoles.current.has(key)) legacyTrackRoles.current.set(key, inferStudioTrackRole(track));
      const role = legacyTrackRoles.current.get(key);
      return role === undefined ? track : { ...track, role };
    });
    const resolved = { ...next, open: { ...next.open, timeline: { ...timeline, tracks } } };
    history.current.observe(sessionRef.current, resolved);
    sessionRef.current = resolved;
    updateSession(resolved);
  }, []);
  const [failure, setFailure] = useState<string>();
  const [conflict, setConflict] = useState<NleStudioConflict>();
  const [conflictOpen, setConflictOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selection, updateSelection] = useState<readonly string[]>([]);
  const selectionRef = useRef<readonly string[]>([]);
  const setSelection = useCallback((value: SetStateAction<readonly string[]>) => { const next = typeof value === "function" ? value(selectionRef.current) : value; selectionRef.current = next; updateSelection(next); }, []);
  const [transitionId, setTransitionId] = useState<string>();
  const [inspector, setInspector] = useState<NleInspectorScene>();
  const [frame, updateFrame] = useState(0);
  const frameRef = useRef(0);
  const setFrame = useCallback((value: SetStateAction<number>) => { const next = typeof value === "function" ? value(frameRef.current) : value; frameRef.current = next; updateFrame(next); }, []);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { const hide = () => { if (document.hidden) setPlaying(false); }; document.addEventListener("visibilitychange", hide); return () => document.removeEventListener("visibilitychange", hide); }, []);
  const [muted, setMuted] = useState(false);
  const [primaryTrack, setPrimaryTrack] = useState<string>();
  const primaryKey = session ? `hypit:nle:primary:${session.open.project.project.id}/${session.projectDocument.path}/${session.open.timeline.composition}` : undefined;
  useEffect(() => { try { setPrimaryTrack(primaryKey ? localStorage.getItem(primaryKey) ?? undefined : undefined); } catch { setPrimaryTrack(undefined); } }, [primaryKey]);
  const [renameProject, setRenameProject] = useState(false);
  const [binTab, setBinTab] = useState<BinTab>("assets");
  const [propertiesTab, setPropertiesTab] = useState<"properties" | "text">("properties");
  const [compositionParents, setCompositionParents] = useState<readonly string[]>([]);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [panelWidths, setPanelWidths] = useState(readPanelWidths);
  const [source, setSource] = useState<NleStudioMediaEntry>();
  const [canvasDraft, setCanvasDraft] = useState<CanvasDraft>();
  const workspace = useRef<HTMLDivElement>(null);
  const placeFromDrag = useRef<(drop: MediaDrop) => void>(() => undefined);
  const selectFromDrag = useRef<(entry: NleStudioMediaEntry) => void>(() => undefined);
  const assetDrag = useAssetDrag(session?.open.timeline, workspace, frame, busy, drop => placeFromDrag.current(drop), entry => selectFromDrag.current(entry));
  useEditorPosition(session, { frame, selection, previewExpanded }, position => { setFrame(position.frame); setSelection(position.selection); setPreviewExpanded(position.previewExpanded); });
  const inflight = useRef(false);
  const clipboard = useRef(new Map<string, ItemClipboard>());

  const resizePanel = (side: PanelSide, width: number, save: boolean) => {
    setPanelWidths(previous => {
      const next = { ...previous, [side]: width };
      if (save) localStorage.setItem("hypit:nle:panel-sizes", JSON.stringify(next));
      return next;
    });
  };

  const focus = useCallback((): EditorFocus | undefined => sessionRef.current ? { composition: sessionRef.current.open.timeline.composition, frame: frameRef.current, selection: selectionRef.current } : undefined, []);
  const perform = useCallback(async (operation: () => Promise<void>, recordHistory = true, autosave = true) => {
    if (inflight.current) return;
    inflight.current = true;
    if (recordHistory) history.current.begin(focus());
    setBusy(true); setFailure(undefined); setPlaying(false);
    try {
      if (autosave && sessionRef.current) {
        await checkSessionDocuments();
        setConflict(undefined);
        setConflictOpen(false);
      }
      await operation();
      const status = sessionRef.current?.open.status;
      if (autosave && (status?.projectDirty || status?.viewDirty)) setSession(await saveSession());
    } catch (error) {
      if (error instanceof StudioConflictError) {
        setConflict(error.conflict);
        setConflictOpen(true);
      } else {
        setFailure(error instanceof Error ? error.message : String(error));
      }
    }
    finally { if (recordHistory) history.current.finish(focus()); inflight.current = false; setBusy(false); }
  }, [focus, setSession]);

  useEffect(() => { void perform(async () => setSession(await readSession()), false, false); }, []);
  const replayHistory = useCallback((direction: "undo" | "redo") => void perform(async () => {
    const current = sessionRef.current;
    if (!current || !history.current.available(current, direction)) return;
    const restored = await history.current.replay(direction, current, sendCommand, setSession);
    const next = sessionRef.current!;
    if (next.open.timeline.composition !== current.open.timeline.composition) setCompositionParents([]);
    if (restored && restored.composition === next.open.timeline.composition) { setFrame(restored.frame); setSelection(editableSelection(next.open.timeline, restored.selection)); }
    else setSelection(previous => editableSelection(next.open.timeline, previous));
  }, false), [perform, setSession, setFrame, setSelection]);

  const select = useCallback((ids: readonly string[]) => {
    setSelection(session === undefined ? [] : linkedSelection(session.open.timeline, ids));
    setSource(undefined); setPlaying(false); setTransitionId(undefined);
  }, [session]);

  useEffect(() => {
    if (busy) return;
    const item = selection[0];
    if (item === undefined || !session?.open.timeline.tracks.some(track => track.items.some(candidate => candidate.id === item))) {
      setInspector(undefined); return;
    }
    let disposed = false;
    void readInspector(item).then(value => { if (!disposed) setInspector(value.inspector); }, error => {
      if (!disposed) { setInspector(undefined); setFailure(error instanceof Error ? error.message : String(error)); }
    });
    return () => { disposed = true; };
  }, [selection[0], session?.open.status.projectRevision, session?.open.status.viewRevision, busy]);

  const command = useCallback((value: NleEditingSurfaceCommand, afterSelection?: readonly string[]) => perform(async () => {
    const next = await sendCommand(value, session?.open.status.viewRevision);
    setSession(next);
    setSelection(previous => (afterSelection ?? previous).filter(id => next.open.timeline.tracks.some(track => track.items.some(item => item.id === id))));
  }), [perform, session?.open.status.viewRevision]);

  const transact = useCallback((commands: readonly NleCommand[], afterSelection?: readonly string[], viewCommands?: readonly NleViewCommand[]) => {
    if (session === undefined || commands.length === 0) return;
    try {
      command({ kind: "project.transact", expectedProjectRevision: session.open.status.projectRevision,
        expectedViewRevision: session.open.status.viewRevision, commands: magneticEdit(session, commands, primaryTrack),
        ...(viewCommands === undefined ? {} : { viewCommands }) }, afterSelection);
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  }, [command, session, primaryTrack]);

  const applyPlan = useCallback((build: () => EditPlan) => void perform(async () => {
    const plan = build(); let current = sessionRef.current!;
    if (plan.commands.length) {
      current = await sendCommand({ kind: "project.transact", expectedProjectRevision: current.open.status.projectRevision, expectedViewRevision: current.open.status.viewRevision, commands: magneticEdit(current, plan.commands, primaryTrack) }, current.open.status.viewRevision);
      setSession(current);
    }
    if (plan.viewCommands?.length) {
      current = await sendCommand({ kind: "view.transact", expectedProjectRevision: current.open.status.projectRevision, expectedViewRevision: current.open.status.viewRevision, commands: plan.viewCommands }); setSession(current);
    }
    setSelection(previous => editableSelection(current.open.timeline, plan.selection ?? previous));
  }), [perform, primaryTrack, setSession, setSelection]);

  useClipClipboard({
    available: session !== undefined && !busy && source === undefined,
    canCopy: session !== undefined && editableSelection(session.open.timeline, selection).length > 0,
    copy: (token, cut) => {
      if (!session) return;
      clipboard.current.set(token, copyItems(session, selection));
      while (clipboard.current.size > 10) clipboard.current.delete(clipboard.current.keys().next().value!);
      if (cut) transact(removeItems(session, selection), []);
    },
    paste: token => {
      if (!session) return;
      const content = clipboard.current.get(token);
      if (!content) return;
      applyPlan(() => pasteItems(session, content, frame));
    },
  });

  const viewTransact = useCallback((commands: Extract<NleEditingSurfaceCommand, { kind: "view.transact" }>["commands"]) => {
    if (session === undefined) return;
    command({ kind: "view.transact", expectedProjectRevision: session.open.status.projectRevision,
      expectedViewRevision: session.open.status.viewRevision, commands });
  }, [command, session]);

  const groupSelection = useCallback((remove = false) => {
    if (!session || busy) return;
    const scene = session.open.timeline;
    const ids = editableSelection(scene, selection);
    const groups = scene.groups.filter(group => group.items.some(id => ids.includes(id)));
    const commands: Extract<NleEditingSurfaceCommand, { kind: "view.transact" }>["commands"][number][] = groups.map(group => ({ kind: "group.remove", composition: scene.composition, id: group.id }));
    if (!remove && ids.length > 1) commands.push({ kind: "group.add", composition: scene.composition,
      group: { id: `group-${crypto.randomUUID()}`, name: "组合", items: [...new Set([...ids, ...groups.flatMap(group => group.items)])] } });
    if (commands.length) viewTransact(commands);
  }, [session, busy, selection, viewTransact]);

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
      if (event.defaultPrevented || session === undefined || (event.target as Element | null)?.closest("input,textarea,[role=combobox],[contenteditable=true]") || document.querySelector("[role=dialog],[role=menu],[role=listbox]")) return;
      if (source !== undefined) { if (event.key === "Escape") setSource(undefined); return; }
      if (event.metaKey || event.ctrlKey) {
        if (event.code === "KeyA") { event.preventDefault(); select(editableSelection(session.open.timeline, session.open.timeline.tracks.flatMap(track => track.items.map(item => item.id)))); }
        if (event.code === "KeyG" && !busy) { event.preventDefault(); groupSelection(event.shiftKey); }
        if (event.code === "KeyB" && !busy) { event.preventDefault(); const items = selectionAtFrame(session.open.timeline, selection, frame, "split"); if (items.length) transact(items.map(item => ({ kind: "item.split", id: item.id, at: exactFrame(frame, session), rightId: `split-${crypto.randomUUID()}` }))); }
        if (event.code === "KeyZ" && !busy) {
          event.preventDefault();
          const direction = event.shiftKey ? "redo" : "undo";
          replayHistory(direction);
        }
        if (event.code === "KeyS") event.preventDefault();
        return;
      }
      if (event.code === "Space" && source === undefined) { event.preventDefault(); if (!event.repeat) setPlaying(value => !value); }
      if (event.key === "Escape") { setSource(undefined); setPreviewExpanded(false); }
      if (event.key === "Home" || event.key === "End") { event.preventDefault(); setPlaying(false); setFrame(event.key === "Home" ? 0 : Math.max(0, session.open.timeline.maximumFrame - 1)); }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault(); setPlaying(false);
        const points = [...new Set([0, session.open.timeline.maximumFrame, ...session.open.timeline.tracks.flatMap(track => track.items.flatMap(item => [item.startFrame, item.startFrame + item.durationFrames]))])].sort((a, b) => a - b);
        setFrame(event.key === "ArrowUp" ? points.findLast(value => value < frame) ?? 0 : points.find(value => value > frame) ?? frame);
      }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && source === undefined) {
        event.preventDefault(); setPlaying(false); const delta = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1);
        setFrame(value => Math.max(0, Math.min(session.open.timeline.maximumFrame, value + delta)));
      }
      if ((event.key === "Delete" || event.key === "Backspace") && transitionId) {
        event.preventDefault(); if (!busy) { try { transact(editTransitionDuration(session, transitionId, undefined).commands); setTransitionId(undefined); } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); } } return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selection.length > 0) {
        event.preventDefault(); const ids = editableSelection(session.open.timeline, selection);
        if (ids.length && !busy) transact(removeItems(session, ids));
      }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [selection, select, transact, session, frame, busy, source, command, perform, groupSelection, replayHistory, transitionId]);

  const activeItems = useMemo(() => new Set(session?.open.timeline.tracks.filter(track => track.enabled).flatMap(track => track.items)
    .filter(item => frame >= item.startFrame && frame < item.startFrame + item.durationFrames && item.enabled)
    .map(item => item.id) ?? []), [frame, session]);

  if (session === undefined) return <div className="nle-editor nle-loading">
    {failure ? <button type="button" className="button" onClick={() => void perform(async () => setSession(await readSession()), false, false)}>重新打开</button> : <span role="status">正在打开 NLE Studio…</span>}
    <ErrorNotice message={failure} onClose={() => undefined}/>
  </div>;
  const scene = session.open.timeline;
  const dirty = session.open.status.projectDirty || session.open.status.viewDirty;
  const savedAt = session.lastSavedAt ? localSaveTime.format(new Date(session.lastSavedAt)) : undefined;
  const saveStatus = dirty ? busy ? "正在自动保存" : "有未保存的修改" : savedAt ? `${savedAt} 已自动保存` : "已自动保存";
  const reload = () => void perform(async () => {
    setSession(await reloadSession());
    history.current.reset();
    setCompositionParents([]);
    select([]);
    setConflict(undefined);
    setConflictOpen(false);
  }, false, false);
  const fps = scene.editRate.numerator / scene.editRate.denominator;
  const openComposition = (id: string, navigation: "tab" | "enter" | "back") => {
    if (id === scene.composition) return;
    const parents = navigation === "enter" ? [...compositionParents, scene.composition]
      : navigation === "back" ? compositionParents.slice(0, compositionParents.lastIndexOf(id)) : [];
    void perform(async () => {
      const next = await sendCommand({ kind: "view.transact", expectedProjectRevision: session.open.status.projectRevision,
        expectedViewRevision: session.open.status.viewRevision, commands: [{ kind: "view.update", activeComposition: id }] });
      setCompositionParents(parents);
      setSource(undefined);
      setTransitionId(undefined);
      setSession(next);
    });
  };
  const activeComposition = session.open.project.project.compositions.find(composition => composition.id === scene.composition)!;
  const projectItems = new Map(activeComposition.tracks.flatMap(track => track.items.map(item => [item.id, item] as const)));
  const textItems = new Set([...projectItems.values()].filter(item => item.kind === "present" && item.source === "component"
    && session.catalog.components.some(entry => entry.category !== "graphic" && entry.component.package === item.component.package
      && entry.component.symbol === item.component.symbol)).map(item => item.id));
  const mediaByPath = new Map(session.media.entries.map(entry => [entry.id, entry] as const));
  const mediaForItem = (item: NleItem) => {
    if (item.kind !== "present" || item.source !== "media") return undefined;
    const base = new URL(session.projectDocument.path, "https://hypit.invalid/");
    const path = decodeURIComponent(new URL(item.asset.path, base).pathname.slice(1));
    return mediaByPath.get(path);
  };
  const previewTime = frameTime(session, frame);
  const previewPlaying = playing && source === undefined;
  const selectedProjectItem = activeComposition.tracks.flatMap(track => track.items).find(item => item.id === selection[0]);
  const selectedLayer = session.open.canvas.layers.find(layer => layer.id === selection[0]);
  const translatePicture = (item: string, deltaX: number, deltaY: number) => command({
    kind: "spatial.edit", expectedProjectRevision: session.open.status.projectRevision,
    expectedViewRevision: session.open.status.viewRevision, item, edit: { kind: "frame.translate", deltaX, deltaY },
  });
  const selectedGroups = scene.groups.filter(group => group.items.some(item => selection.includes(item)));
  const grouped = selectedGroups.length === 1 && selectedGroups[0]!.items.every(item => selection.includes(item))
    && selection.every(item => selectedGroups[0]!.items.includes(item));
  const writableSelection = editableSelection(scene, selection);
  const canToggleGroup = writableSelection.length > 1 || writableSelection.length > 0 && selectedGroups.length > 0;
  const canDetachAudio = selection.length === 1 && writableSelection.length === 1 && selectedProjectItem?.kind === "present"
    && selectedProjectItem.picture !== undefined && selectedProjectItem.audio !== undefined;
  const icons = { assets: Images, text: Type, subtitles: Captions, transitions: Blend, effects: Wand2 } as const;
  const tabNames = { assets: "素材", text: "文本", subtitles: "字幕", transitions: "转场", effects: "效果" } as const;
  const classes = `nle-editor${previewExpanded ? " nle-preview-expanded" : ""}`;
  const projectName = session.open.project.project.name;
  const canUndo = history.current.available(session, "undo"), canRedo = history.current.available(session, "redo");
  const selectedTransition = activeComposition.transitions.find(value => value.id === transitionId);
  const selectedSceneItem = scene.tracks.flatMap(track => track.items).find(item => item.id === selection[0]);
  const selectionLocked = scene.tracks.some(track => track.locked && track.items.some(item => selection.includes(item.id)));
  const slipTargets = writableSelection.map(id => {
    const item = projectItems.get(id)!;
    const nested = item.kind === "present" && item.source === "composition"
      ? session.open.project.project.compositions.find(value => value.id === item.composition) : undefined;
    return { item, sourceDuration: nested ? nleCompositionDuration(nested) : mediaForItem(item)?.duration };
  });
  const slipEarlier = slipItems(slipTargets, frameTime(session, -1));
  const slipLater = slipItems(slipTargets, frameTime(session, 1));
  const canFreeze = selection.length === 1 && !selectionLocked && !!selectedProjectItem && canFreezeItem(session, selectedProjectItem, frame);
  const freezeSelection = () => {
    if (canFreeze && selectedProjectItem) applyPlan(() => freezeItem(session, selectedProjectItem, frame));
  };
  const editInspectorItem = (item: string | undefined, section: string, field: string, value: string | number | boolean) => {
    if (item === undefined) return;
    command({ kind: "inspector.edit", expectedProjectRevision: session.open.status.projectRevision,
      expectedViewRevision: session.open.status.viewRevision, item, section, field, value });
  };
  const ensureTrack = async (medium: "picture" | "audio", drop?: MediaDrop, componentDuration?: ExactTemporalValue, role?: NleTrack["role"]) => {
    let current = sessionRef.current!;
    const timeline = current.open.timeline, composition = compositionOf(current);
    const fits = (track: typeof timeline.tracks[number]) => componentDuration === undefined
      ? !track.locked && track.kind === medium && track.role === role
      : componentFitsTrack(current, track, drop?.frame ?? frame, componentDuration, role);
    let destination = timeline.tracks.find(track => track.id === drop?.track && fits(track)) ?? (!drop?.track ? timeline.tracks.find(fits) : undefined);
    if (!destination) {
      const track = identity("track"), targetIndex = composition.tracks.findIndex(track => track.id === drop?.track);
      const before = targetIndex >= 0 ? composition.tracks[targetIndex + 1]?.id
        : role === "subtitle" ? composition.tracks[composition.tracks.findLastIndex(track => track.kind === "picture") + 1]?.id
        : medium === "picture" ? composition.tracks.find(track => track.kind === "audio")?.id : undefined;
      current = await sendCommand({ kind: "project.transact", expectedProjectRevision: current.open.status.projectRevision, expectedViewRevision: current.open.status.viewRevision,
        commands: [{ kind: "track.add", composition: timeline.composition, track: { id: track, name: studioTrackName(medium, role), kind: medium, ...(role === undefined ? {} : { role }), enabled: true, items: [] }, ...(before ? { before } : {}) }] });
      setSession(current); destination = current.open.timeline.tracks.find(value => value.id === track)!;
    }
    return { current, destination };
  };
  const materialize = (entry: NleStudioComponentCatalogEntry, drop?: MediaDrop) => void perform(async () => {
    const { current, destination } = await ensureTrack("picture", drop, entry.duration, componentTrackRole(entry.category)), item = identity("component");
    const next = await materializeComponent({ expectedProjectRevision: current.open.status.projectRevision, expectedViewRevision: current.open.status.viewRevision,
      package: entry.package, offering: entry.offering, item, composition: current.open.timeline.composition, track: destination.id, atFrame: drop?.frame ?? frame });
    setSession(next); setSelection([item]); setSource(undefined); setTransitionId(undefined); setFrame(drop?.frame ?? frame);
    if (entry.category !== "graphic") setPropertiesTab("text");
    setInspector((await readInspector(item)).inspector);
  });
  const placeProjectMedia = (entry: NleStudioMediaEntry, drop?: MediaDrop) => void perform(async () => {
    if (entry.state !== "available") throw new Error(entry.diagnostic ?? "这个项目媒体当前不可用。");
    const trackKind = entry.kind === "audio" ? "audio" : "picture";
    const durationFrames = entry.durationFrames ?? Math.max(1, Math.round(fps * 5));
    const atFrame = drop?.frame ?? frame;
    const compatible = scene.tracks.filter(track => mediaTrackCompatible(track, entry.kind));
    const selectedTrack = compatible.find(track => track.items.some(item => selection.includes(item.id)));
    const fits = (track: NleStudioSession["open"]["timeline"]["tracks"][number]) => mediaFitsTrack(track, entry.kind, atFrame, durationFrames);
    let current = session;
    let destination = drop
      ? compatible.find(track => track.id === drop.track && fits(track)) ?? compatible.find(fits)
      : selectedTrack ?? compatible.find(track => track.id === primaryTrack) ?? compatible[0];
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
      setSession(current);
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
      insert: drop === undefined,
      includeAudio: entry.kind === "audiovisual",
    });
    setSession(next);
    const placed = next.open.timeline.tracks.flatMap(track => track.items).find(candidate => candidate.id === item);
    setSource(undefined); setTransitionId(undefined); setFrame(placed?.startFrame ?? atFrame);
    setSelection([item]);
    setInspector((await readInspector(item)).inspector);
  });
  const importProjectMedia = (files: readonly File[]) => void perform(async () => {
    let next = session;
    for (const file of files) {
      next = await importMedia(file);
      setSession(next);
    }
  });
  const materializeEffect = (entry: NleStudioAdjustCatalogEntry, drop?: MediaDrop) => void perform(async () => {
    const currentComposition = compositionOf(sessionRef.current!);
    const targetIds = drop?.item ? editableSelection(scene, [drop.item]) : drop ? [] : editableSelection(scene, selection);
    const targets = currentComposition.tracks.flatMap(track => track.items.map(item => ({ track, item }))).filter(({ track, item }) => targetIds.includes(item.id) && (item.kind === "adjust" ? track.kind === entry.medium : Boolean(item[entry.medium])));
    const targetTrack = scene.tracks.find(track => track.id === targets[0]?.track.id && track.kind === entry.medium && track.role !== "subtitle");
    const { current, destination } = targetTrack ? { current: sessionRef.current!, destination: targetTrack }
      : await ensureTrack(entry.medium, drop, undefined, "effect");
    const item = identity("adjust");
    let next = await materializeAdjust({ expectedProjectRevision: current.open.status.projectRevision, expectedViewRevision: current.open.status.viewRevision,
      package: entry.package, offering: entry.offering, item, composition: current.open.timeline.composition, track: destination.id, atFrame: drop?.frame ?? frame });
    setSession(next);
    if (targets.length) {
      const effect = compositionOf(next).tracks.flatMap(track => track.items).find(value => value.id === item);
      if (effect?.kind !== "adjust") throw new Error("效果创建结果未包含调整项目。");
      const commands: NleCommand[] = targets.map(({ item: target }) => target.kind === "adjust"
        ? { kind: "item.replace", item: { ...target, operator: effect.operator, parameters: structuredClone(effect.parameters), controlTime: nleLinearTimeMapping(target.duration) } }
        : { kind: "process.add", item: target.id, medium: entry.medium, process: { id: identity("process"), operator: effect.operator, parameters: structuredClone(effect.parameters), enabled: true, controlTime: nleLinearTimeMapping(target.duration) } });
      commands.push({ kind: "item.remove", ids: [item] });
      next = await sendCommand({ kind: "project.transact", expectedProjectRevision: next.open.status.projectRevision, expectedViewRevision: next.open.status.viewRevision, commands }, next.open.status.viewRevision);
      setSession(next); setSelection(targets.map(({ item }) => item.id));
    } else setSelection([item]);
    setSource(undefined);
  });
  const materializeSelectedTransition = (entry: NleStudioTransitionCatalogEntry, drop?: MediaDrop) => void perform(async () => {
    const cuts = drop === undefined ? transitionCuts(session) : [];
    const selectedCuts = cuts.filter(cut => selection.includes(cut.outgoing) || selection.includes(cut.incoming));
    const existing = transitionId === undefined ? undefined : cuts.find(cut => cut.overlap?.id === transitionId);
    const target = drop?.transitionCut ?? existing
      ?? selectedCuts.find(cut => selection.length === 2 && selection.includes(cut.outgoing) && selection.includes(cut.incoming))
      ?? transitionCutAt(selectedCuts.length ? selectedCuts : cuts, frame);
    if (!target) throw new Error("请先将两个画面片段相邻放置，或选择已有转场。");
    const transition = target.overlap?.id ?? identity("transition");
    const next = await materializeTransition({
      expectedProjectRevision: session.open.status.projectRevision,
      expectedViewRevision: session.open.status.viewRevision,
      package: entry.package,
      offering: entry.offering,
      transition,
      composition: scene.composition,
      outgoing: target.outgoing,
      incoming: target.incoming,
    });
    setSession(next);
    setSelection([target.outgoing, target.incoming]);
    setSource(undefined);
    setTransitionId(transition);
    setPropertiesTab("properties");
  });

  const catalogDrags: CatalogDrag[] = [...session.catalog.components.map(entry => ({ kind: "component" as const, entry })), ...session.catalog.adjusts.map(entry => ({ kind: "effect" as const, entry })), ...session.catalog.transitions.map(entry => ({ kind: "transition" as const, entry }))];
  const placeCatalog = (value: CatalogDrag, drop?: MediaDrop) => { if (value.kind === "component") materialize(value.entry, drop); else if (value.kind === "effect") materializeEffect(value.entry, drop); else materializeSelectedTransition(value.entry, drop); };
  placeFromDrag.current = drop => { const catalog = catalogDrags.find(value => catalogDragId(value) === drop.id); if (catalog) placeCatalog(catalog, drop); else { const entry = session.media.entries.find(entry => entry.id === drop.id); if (entry) placeProjectMedia(entry, drop); } };
  selectFromDrag.current = entry => { const catalog = catalogDrags.find(value => catalogDragId(value) === entry.id); if (catalog) placeCatalog(catalog); else { setPlaying(false); setSource(entry); } };
  return <motion.div ref={workspace} className="nle-workspace nle-active" {...enterMotion(reduced)}
      onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
      onDrop={event => { if (!event.defaultPrevented && event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); importProjectMedia(Array.from(event.dataTransfer.files)); } }}><div className={classes} style={{
    "--nle-bin-preferred": `${panelWidths.bin}px`,
    "--nle-properties-preferred": `${panelWidths.properties}px`,
  } as React.CSSProperties}>
      <div className="nle-titlebar"><div className="nle-titlebar-side">{conflict
        ? <button type="button" className="button" onClick={() => setConflictOpen(true)}>自动保存暂停</button>
        : <small>{saveStatus}</small>}</div><button type="button" className="nle-titlebar-name" disabled={busy} onClick={() => setRenameProject(true)} title="重命名项目">{projectName}</button><div className="nle-titlebar-side end"><div className="nle-toolbar-actions">
        <IconButton label="撤销" disabled={busy || !canUndo} onClick={() => replayHistory("undo")}><Undo2 size={16}/></IconButton>
        <IconButton label="重做" disabled={busy || !canRedo} onClick={() => replayHistory("redo")}><Redo2 size={16}/></IconButton>
        <button className="button" disabled={busy} onClick={() => { if (dirty && conflict) setConflictOpen(true); else reload(); }}>重载</button>
      </div></div></div>
      <Dialog.Root open={conflictOpen} onOpenChange={setConflictOpen}>
        <Dialog.Portal><Dialog.Backdrop className="studio-dialog-backdrop"/><Dialog.Popup className="studio-dialog modal">
          <Dialog.Title>检测到编辑冲突</Dialog.Title>
          <Dialog.Description>{conflict?.kind === "document" ? `磁盘上的 ${conflict.path} 已被外部修改。` : "项目状态已在另一处更新。"}{dirty ? "重载会丢弃 Studio 中尚未保存的修改。" : "重载后可继续编辑。"} </Dialog.Description>
          {failure && <p role="alert">{failure}</p>}
          <footer><button type="button" className="button" disabled={busy} onClick={() => setConflictOpen(false)}>暂不处理</button><button type="button" className="button primary" disabled={busy} onClick={reload}>重载磁盘版本</button></footer>
        </Dialog.Popup></Dialog.Portal>
      </Dialog.Root>
      <ErrorNotice message={failure} onClose={() => setFailure(undefined)}/>{renameProject && <EditorDialog title="重命名项目" initialName={projectName} onClose={() => setRenameProject(false)} onSubmit={name => transact([{ kind: "project.update", name }])}/>}
      <div className="nle-upper">
        <aside className="nle-bin"><div className="nle-bin-tabs" role="tablist">{(Object.keys(icons) as BinTab[]).map(id => { const Icon = icons[id]; return <button type="button" role="tab" aria-selected={binTab === id} key={id} onClick={() => setBinTab(id)}><Icon size={18} strokeWidth={1.6}/><span>{tabNames[id]}</span></button>; })}</div><AnimatePresence mode="popLayout" initial={false}><motion.div key={binTab} className="nle-bin-body" {...enterMotion(reduced)}><StudioBin tab={binTab} catalog={session.catalog} media={session.media} disabled={busy} onImportMedia={importProjectMedia} onPlaceMedia={placeProjectMedia} selectedMedia={source?.id} onPreviewMedia={entry => { setPlaying(false); setSource(entry); }} onBeginMediaDrag={assetDrag.start} onBeginPresetDrag={(event, value) => assetDrag.start(event, {
          id: catalogDragId(value), name: value.entry.title, kind: value.kind === "effect" && value.entry.medium === "audio" ? "audio" : "picture", state: "available",
          ...(value.kind === "component" ? { durationFrames: frameOf(session, value.entry.duration) } : {}),
        }, {
          ...(value.kind === "transition" ? { cuts: transitionCuts(session) } : {}),
          ...(value.kind === "component" && value.entry.category !== "graphic" ? { role: value.entry.category } : {}),
          ...(value.kind === "effect" ? { role: "effect" } : {}),
        })} onMaterialize={materialize} onMaterializeAdjust={materializeEffect} onMaterializeTransition={materializeSelectedTransition}/></motion.div></AnimatePresence></aside>
        <PanelResizeHandle side="bin" label="调整素材面板宽度" width={panelWidths.bin} onResize={(width, save) => resizePanel("bin", width, save)}/>
        <section className="nle-monitor"><div className="nle-panel-header nle-monitor-title"><span>{projectName}</span><IconButton label={previewExpanded ? "恢复预览" : "放大预览"} onClick={() => setPreviewExpanded(value => !value)}>{previewExpanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</IconButton></div>
          <SourcePreview entry={source} fps={fps} muted={muted} onMute={() => setMuted(value => !value)} onClose={() => setSource(undefined)}/><div className="nle-stage"><div className="nle-editable-preview" style={{ "--canvas-ratio": session.open.canvas.canvas.width / session.open.canvas.canvas.height } as React.CSSProperties}><div className="studio-canvas">
            {session.preview.state === "ready" && <img className="studio-preview-frame" src={session.preview.resource}/>}
            {session.preview.state !== "ready" && session.open.canvas.layers.map(layer => {
              if (!activeItems.has(layer.id) || layer.layout === undefined) return null;
              const item = projectItems.get(layer.id);
              if (item?.kind !== "present" || item.source !== "media") return null;
              const media = mediaForItem(item);
              if (!media?.resource || !media.mediaType) return null;
              const layout = canvasDraft?.id === layer.id ? { ...layer.layout, ...canvasDraft.frame } : layer.layout;
              const canvas = session.open.canvas.canvas;
              return <button type="button" key={layer.id} className="studio-canvas-layer" aria-label={layer.title}
                onClick={() => select([layer.id])} style={{ left: `${layout.x / canvas.width * 100}%`, top: `${layout.y / canvas.height * 100}%`,
                  width: `${layout.width / canvas.width * 100}%`, height: `${layout.height / canvas.height * 100}%` }}>
                <TimelineMedia item={item} resource={media.resource} mediaType={media.mediaType} at={previewTime} playing={previewPlaying} muted={muted} layout={layout}/>
              </button>;
            })}
            {session.preview.state !== "ready" && [...projectItems.values()].map(item => {
              if (item.kind !== "present" || item.source !== "media" || item.picture || !item.audio || !activeItems.has(item.id)) return null;
              const media = mediaForItem(item);
              return media?.resource && media.mediaType ? <TimelineMedia key={item.id} item={item} resource={media.resource} mediaType={media.mediaType}
                at={previewTime} playing={previewPlaying} muted={muted}/> : null;
            })}
            {session.preview.state !== "ready" && <CanvasControls scene={session.open.canvas} active={activeItems} selection={selection} disabled={busy} draft={canvasDraft} onDraft={setCanvasDraft} onSelect={select}
              onTranslate={translatePicture}
              onResize={(item, next) => command({ kind: "spatial.edit", expectedProjectRevision: session.open.status.projectRevision, expectedViewRevision: session.open.status.viewRevision, item, edit: { kind: "frame.resize", frame: next } })}/>}
          </div></div></div>
          <div className="nle-transport"><span className="nle-transport-time"><span className="current">{timecode(frame, fps)}</span><span className="separator">/</span><span className="total">{timecode(scene.maximumFrame, fps)}</span></span><button className="nle-play" aria-label={playing ? "暂停" : "播放"} onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><span className="nle-transport-actions"><IconButton label="上一帧" onClick={() => { setPlaying(false); setFrame(value => Math.max(0, value - 1)); }}><StepBack size={15}/></IconButton><IconButton label="下一帧" onClick={() => { setPlaying(false); setFrame(value => Math.min(scene.maximumFrame, value + 1)); }}><StepForward size={15}/></IconButton><IconButton label="静音" onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={15}/> : <Volume2 size={15}/>}</IconButton></span></div>
        </section>
        <PanelResizeHandle side="properties" label="调整属性面板宽度" width={panelWidths.properties} onResize={(width, save) => resizePanel("properties", width, save)}/>
        <aside className="nle-properties"><div className="nle-properties-tabs" role="tablist">
          <button role="tab" aria-selected={propertiesTab === "properties"} onClick={() => setPropertiesTab("properties")}>属性</button>
          <button role="tab" aria-selected={propertiesTab === "text"} onClick={() => setPropertiesTab("text")}>文本与字幕</button>
        </div><AnimatePresence mode="popLayout" initial={false}>{propertiesTab === "text"
          ? <motion.div key="text-list" className="nle-panel-body" {...enterMotion(reduced)}>
            <TimelineTextList scene={scene} selection={selection} textItems={textItems} inspector={inspector} disabled={busy}
              onSelect={item => { select([item.id]); setFrame(item.startFrame); }} onEdit={editInspectorItem}/>
          </motion.div>
          : <motion.div key={transitionId ?? selection[0] ?? "empty"} className="nle-panel-body" {...enterMotion(reduced)}>{selectedTransition ? <TransitionInspector duration={Math.round(frameOf(session, projectItems.get(selectedTransition.outgoing)!.duration) + frameOf(session, projectItems.get(selectedTransition.outgoing)!.start) - frameOf(session, projectItems.get(selectedTransition.incoming)!.start))} disabled={busy || selectionLocked} onDuration={value => applyPlan(() => editTransitionDuration(session, selectedTransition.id, value))} onRemove={() => { applyPlan(() => editTransitionDuration(session, selectedTransition.id, undefined)); setTransitionId(undefined); }}/>
            : <Inspector scene={inspector} disabled={busy} onEdit={(section, field, value) => editInspectorItem(inspector?.item, section, field, value)}/>}
          {!selectedTransition && selection.length === 1 && selectedLayer?.layout && <PictureAlignment
            canvas={session.open.canvas.canvas} frame={canvasDraft?.id === selectedLayer.id ? canvasDraft.frame : selectedLayer.layout}
            disabled={busy || !selectedLayer.affordances.translate}
            onTranslate={(x, y) => void translatePicture(selectedLayer.id, x, y)}/>}
          {!selectedTransition && selectedProjectItem && selectedSceneItem && <><TemporalInspector item={selectedProjectItem} start={selectedSceneItem.startFrame} duration={selectedSceneItem.durationFrames} disabled={busy || selectionLocked}
            onStart={value => transact([{ kind: "item.move", ids: editableSelection(scene, selection), delta: frameTime(session, value - selectedSceneItem.startFrame) }])}
            onDuration={value => transact([{ kind: "item.trim", id: selectedProjectItem.id, edge: "end", at: frameTime(session, selectedSceneItem.startFrame + value) }])}
            onSpeed={value => applyPlan(() => changeSpeed(session, selection, value))} onReverse={() => applyPlan(() => reverseItems(session, selection))}
            onSlipEarlier={slipEarlier && (() => transact(slipEarlier))}
            onSlipLater={slipLater && (() => transact(slipLater))}
            canFreeze={canFreeze} onFreeze={freezeSelection}/><ProcessInspector item={selectedProjectItem} disabled={busy || selectionLocked} onEdit={transact}/></>}</motion.div>}</AnimatePresence></aside>
      </div>
      <AnimatePresence mode="popLayout" initial={false}><Timeline key={`${session.projectDocument.path}/${scene.composition}`} session={session} frame={frame} selection={selection} busy={busy} onSelectTransition={id => { setTransitionId(id); setPropertiesTab("properties"); }} selectedTransition={transitionId} onSeek={value => { setPlaying(false); setSource(undefined); setFrame(value); }} onSelect={select}
        draggedMedia={assetDrag.drag?.entry} mediaDrop={assetDrag.drag?.drop}
        mediaDurationForItem={id => { const item = projectItems.get(id); return item && mediaForItem(item)?.duration; }}
        onMove={move => {
          const plan = moveItemEditPlan(session, move);
          transact(plan.commands, undefined, plan.viewCommands);
        }}
        onTrim={(item, edge, atFrame) => transact([trimItemCommand(session, item.id, edge, atFrame)])}
        onTrimSelection={(items, edge, atFrame) => transact(items.map(item => trimItemCommand(session, item.id, edge, atFrame)))}
        onSplit={(items, atFrame) => transact(items.map(item => ({ kind: "item.split", id: item.id, at: exactFrame(atFrame, session), rightId: `split-${crypto.randomUUID()}` })))}
        onRemove={() => { const ids = editableSelection(scene, selection); if (ids.length) transact(removeItems(session, ids)); }}
        onTrackEnabled={(track, enabled) => transact([{ kind: "track.update", id: track, enabled }])}
        onTrackLocked={(track, locked) => viewTransact([{ kind: "track-lock.set", composition: scene.composition, track, locked }])}
        onTrackMove={(track, before, displayOrder) => {
          const order = session.open.view.view.compositions.find(state => state.composition === scene.composition)?.trackOrder;
          transact([{ kind: "track.move", id: track, ...(before === undefined ? {} : { before }) }], undefined,
            order === undefined ? undefined : [{ kind: "track-order.set", composition: scene.composition, tracks: displayOrder }]);
        }}
        onComposition={composition => openComposition(composition, "tab")}
        compositionParents={compositionParents}
        onEnterComposition={composition => openComposition(composition, "enter")}
        onReturnComposition={composition => openComposition(composition, "back")}
        onAddTrack={() => transact([{ kind: "track.add", composition: scene.composition, track: { id: `track-${crypto.randomUUID().slice(0, 8)}`, name: "新轨道", kind: "picture", enabled: true, items: [] } }])}
        canToggleGroup={canToggleGroup} grouped={grouped} onToggleGroup={() => groupSelection(grouped)}
        canFreeze={canFreeze} onFreeze={freezeSelection}
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
        primaryTrack={primaryTrack} onTrackMagnet={track => {
          const next = primaryTrack === track ? undefined : track;
          if (next) applyPlan(() => closeTrackGaps(session, next));
          setPrimaryTrack(next); try { if (primaryKey) { if (next) localStorage.setItem(primaryKey, next); else localStorage.removeItem(primaryKey); } } catch {}
        }}
        canUndo={canUndo} canRedo={canRedo} onUndo={() => replayHistory("undo")} onRedo={() => replayHistory("redo")}
        onCompositionCreate={(name, canvas) => void perform(async () => {
          const id = identity("composition"); let current = sessionRef.current!;
          current = await sendCommand({ kind: "project.transact", expectedProjectRevision: current.open.status.projectRevision, expectedViewRevision: current.open.status.viewRevision, commands: [{ kind: "composition.add", composition: { id, name, canvas, tracks: [], transitions: [], mattes: [] } }] }); setSession(current);
          current = await sendCommand({ kind: "view.transact", expectedProjectRevision: current.open.status.projectRevision, expectedViewRevision: current.open.status.viewRevision, commands: [{ kind: "view.update", activeComposition: id }] }); setCompositionParents([]); setSession(current); setSelection([]); setFrame(0);
        })}
        onCompositionEdit={(name, canvas) => transact([{ kind: "composition.update", id: scene.composition, name, canvas }])}
        onCompositionRoot={() => transact([{ kind: "project.update", rootComposition: scene.composition }])}
        onCompositionRemove={() => transact([{ kind: "composition.remove", id: scene.composition }], [])}
        onCreateCompound={() => applyPlan(() => createCompound(session, selection, "复合片段"))}
        onDuplicateCompound={id => { const item = projectItems.get(id); if (item) applyPlan(() => duplicateCompound(session, item, frame)); }}
        onUnpackCompound={id => { const item = projectItems.get(id); if (item) applyPlan(() => unpackCompound(session, item)); }}
        onRippleRemove={ids => applyPlan(() => rippleRemove(session, ids))}
        onCloseGaps={(track, at) => applyPlan(() => closeTrackGaps(session, track, at))}
        onTrackRename={(id, name) => transact([{ kind: "track.update", id, name }])}
        onTrackRemove={id => { const track = activeComposition.tracks.find(track => track.id === id); if (track) transact([...removeItems(session, track.items.map(item => item.id)), { kind: "track.remove", id }]); }}
        onTrackHeight={(track, heightPx) => viewTransact([{ kind: "track-height.set", composition: scene.composition, track, heightPx }])}/></AnimatePresence>
    </div><AnimatePresence>{assetDrag.drag && <motion.div className="studio-asset-floating" initial={{ opacity: 0 }} animate={{ opacity: assetDrag.drag.drop ? 1 : .6 }} exit={{ opacity: 0 }} style={{ left: assetDrag.drag.x + 12, top: assetDrag.drag.y + 12 }}>{assetDrag.drag.entry.name}</motion.div>}</AnimatePresence></motion.div>;
}
