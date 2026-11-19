import { Dialog } from "@base-ui/react/dialog";
import type { NleCommand } from "@hypit/nle";
import type { NleTimelineSceneItem } from "@hypit/nle/view";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import { Blend, Captions, Images, Maximize2, Minimize2, Pause, Play, StepBack, StepForward, Type, Volume2, VolumeX, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  NleStudioAdjustCatalogEntry,
  NleStudioComponentCatalogEntry,
  NleStudioInvalidation,
  NleStudioMediaEntry,
  NleStudioOpenProjection,
  NleStudioOperation,
  NleStudioOperationReceipt,
  NleStudioProcessAddress,
  NleStudioProcessCatalogEntry,
  NleStudioProcessEdit,
  NleStudioTransitionCatalogEntry,
} from "../protocol.js";
import {
  connectStudioEvents,
  importMedia,
  NleStudioSaveConflict,
  operate,
  readInspector,
  readOpen,
  readTransitionInspector,
  refreshOpen,
  reloadSession,
  saveSession,
  sendCommand,
} from "./api.js";
import { CanvasControls, type CanvasDraft } from "./CanvasControls.js";
import { IconButton } from "./common.js";
import { Inspector, TransitionInspector } from "./Inspector.js";
import { PanelResizeHandle, defaultPanelWidths, type PanelSide } from "./PanelResizeHandle.js";
import { StudioBin, type BinTab } from "./StudioBin.js";
import { Timeline } from "./Timeline.js";
import { NumberField, Row, Section } from "./controls.js";
import { timecode } from "./timecode.js";
import { usePreview } from "./usePreview.js";

import { SourcePreview } from "./SourcePreview.js";
import { PictureAlignment } from "./PictureAlignment.js";
import { EditorDialog } from "./EditorDialog.js";
import { enterMotion, fadeMotion } from "./motion.js";
import { editableSelection, selectionAtFrame } from "./selection.js";
import { useClipClipboard } from "./useClipClipboard.js";
import { ErrorNotice } from "./ErrorNotice.js";
import { MediaThumbnail } from "./MediaThumbnail.js";
import { TimelineTextList } from "./TimelineTextList.js";
import { useAssetDrag } from "./useAssetDrag.js";
import { catalogDragId, type CatalogDrag } from "./catalogDrag.js";
import { mediaTrackCompatible, trackHasRoom, transitionCuts, type MediaDrop } from "./mediaDrag.js";
import { componentTrackRole } from "./timelineGeometry.js";
import { useEditorPosition } from "./useEditorPosition.js";

function readPanelWidths(): typeof defaultPanelWidths {
  try {
    const saved = JSON.parse(localStorage.getItem("hypit:nle:panel-sizes") ?? "null") as Partial<typeof defaultPanelWidths> | null;
    return Object.fromEntries(Object.entries(defaultPanelWidths).map(([side, fallback]) => {
      const value = saved?.[side as PanelSide];
      return [side, Number.isFinite(value) ? Math.max(180, Math.min(900, value!)) : fallback];
    })) as typeof defaultPanelWidths;
  } catch { return defaultPanelWidths; }
}

const saveTime = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
type EditPosition = { readonly frame: number; readonly selection: readonly string[]; readonly transition: string | undefined };
type EditHistoryEntry = {
  readonly steps: readonly NleStudioOperationReceipt["changed"][];
  readonly before: EditPosition;
  readonly after: EditPosition;
};

export function Studio() {
  const reduced = useReducedMotion();
  const history = useRef<{ undo: EditHistoryEntry[]; redo: EditHistoryEntry[] }>({ undo: [], redo: [] });
  const editSteps = useRef<NleStudioOperationReceipt["changed"][]>([]);
  const [session, setSession] = useState<NleStudioOpenProjection>();
  const [failure, setFailure] = useState<string>();
  const [saveConflict, setSaveConflict] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<Date>();
  const [renameProject, setRenameProject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [transition, setTransition] = useState<string>();
  const transitionRef = useRef<string | undefined>(undefined);
  const setTransitionSelection = useCallback((id: string | undefined) => {
    transitionRef.current = id;
    setTransition(id);
  }, []);
  const [processSelection, setProcessSelection] = useState<NleStudioProcessAddress>();
  const [inspector, setInspector] = useState<Awaited<ReturnType<typeof readInspector>>>();
  const [transitionInspector, setTransitionInspector] = useState<Awaited<ReturnType<typeof readTransitionInspector>>>();
  const [frame, updateFrame] = useState(0);
  const frameRef = useRef(0);
  const setFrame = useCallback((value: number | ((previous: number) => number)) => {
    const next = typeof value === "function" ? value(frameRef.current) : value;
    frameRef.current = next;
    updateFrame(next);
  }, []);
  const navigationFrame = useRef<number | undefined>(undefined);
  const clipboardToken = useRef<string | undefined>(undefined);
  const [source, setSource] = useState<NleStudioMediaEntry>();
  const [canvasDraft, setCanvasDraft] = useState<CanvasDraft>();
  const [propertiesTab, setPropertiesTab] = useState<"properties" | "text">("properties");
  const timelineRoot = useRef<HTMLDivElement>(null);
  const dropAsset = useRef<(drop: MediaDrop) => void>(() => {});
  const dragSelect = useRef<(asset: NleStudioMediaEntry) => void>(() => {});
  const assetDrag = useAssetDrag(session?.timeline.scene, timelineRoot, frame, busy,
    drop => dropAsset.current(drop), asset => dragSelect.current(asset));

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
  const activeTransition = session?.timeline.scene.transitions.find(value => value.id === transition)?.id;
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
    if (!next.status.projectDirty && (next.viewDocument.persistence !== "document" || !next.status.viewDirty)) {
      setSaveConflict(false);
    }
  }, []);

  const enqueue = useCallback((operation: () => Promise<void>) => {
    const result = work.current.then(operation);
    work.current = result.catch((error: unknown) => {
      if (error instanceof NleStudioSaveConflict) { setSaveConflict(true); setConflictOpen(true); }
      else setFailure(error instanceof Error ? error.message : String(error));
    });
    return work.current;
  }, []);

  const selectItems = useCallback((ids: readonly string[]) => {
    setTransitionSelection(undefined);
    if (ids.length === selectionRef.current.length && ids.every((id, index) => id === selectionRef.current[index])) return;
    selectionRef.current = ids;
    setSelection(ids);
    setProcessSelection(current => ids.length === 1 && current?.item === ids[0] ? current : undefined);
    setInspector(undefined);
  }, [setTransitionSelection]);

  const refreshInspector = useCallback(async (current: NleStudioOpenProjection) => {
    const item = selectionRef.current[0];
    if (item === undefined || current.status.viewCompatibility === "stale") return;
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

  const perform = useCallback(async (operation: () => Promise<void>, autosave = true) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setFailure(undefined); setPlaying(false);
    try {
      await enqueue(async () => {
        const position = (): EditPosition => ({ frame: frameRef.current, selection: selectionRef.current, transition: transitionRef.current });
        const before = position();
        editSteps.current = [];
        try {
          await operation();
        } finally {
          const steps = editSteps.current;
          editSteps.current = [];
          if (steps.length > 0) {
            history.current.undo.push({ steps, before, after: position() });
            history.current.redo = [];
          }
          const current = sessionRef.current;
          if (autosave && current !== undefined
            && (current.status.projectDirty || current.viewDocument.persistence === "document" && current.status.viewDirty)) {
            storeSession(await refreshOpen(current, await saveSession()));
            setSavedAt(new Date());
          }
        }
      });
    } finally { busyRef.current = false; setBusy(false); }
  }, [enqueue, storeSession]);

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
        const previous = sessionRef.current;
        const reread = open || previous === undefined;
        open = false;
        const projection = reread ? await readOpen() : await refreshOpen(previous!, { invalidated });
        if (!active) return;
        if (previous !== undefined && (projection.status.projectRevision !== previous.status.projectRevision
          || projection.status.viewRevision !== previous.status.viewRevision)) history.current = { undo: [], redo: [] };
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
    const previous = selectionRef.current;
    selectItems(ids);
    if (previous === selectionRef.current) return;
    if (ids.length > 0) void enqueue(async () => {
      if (sessionRef.current !== undefined) await refreshInspector(sessionRef.current);
    });
  }, [enqueue, refreshInspector, selectItems]);

  useEditorPosition(session, { frame, selection, previewExpanded }, navigationFrame, value => {
    setFrame(value.frame); select(value.selection); setPreviewExpanded(value.previewExpanded);
  });

  const acceptReceipt = useCallback(async (receipt: NleStudioOperationReceipt, item?: string, recordHistory = true) => {
    const current = sessionRef.current;
    if (current === undefined) return;
    const next = await refreshOpen(current, receipt);
    if (recordHistory && (receipt.changed.project || receipt.changed.view)) editSteps.current.push(receipt.changed);
    storeSession(next);
    if (item !== undefined) selectItems([item]);
    if (next.status.viewCompatibility === "compatible"
      && (item !== undefined || receipt.invalidated.includes("inspector"))) await refreshInspector(next);
  }, [refreshInspector, selectItems, storeSession]);

  const reconcileView = useCallback(async () => {
    const current = sessionRef.current;
    if (current?.status.viewCompatibility !== "stale") return;
    await acceptReceipt(await sendCommand({ kind: "view.reconcile",
      expectedProjectRevision: current.status.projectRevision, expectedViewRevision: current.status.viewRevision }));
  }, [acceptReceipt]);

  const command = useCallback((value: NleEditingSurfaceCommand, reconcile = false) => perform(async () => {
    await acceptReceipt(await sendCommand(value));
    if (reconcile) await reconcileView();
  }), [acceptReceipt, perform, reconcileView]);

  const transact = useCallback((commands: Extract<NleEditingSurfaceCommand, { kind: "project.transact" }>["commands"], reconcile = false) => {
    if (session === undefined) return;
    command({ kind: "project.transact", expectedProjectRevision: session.status.projectRevision,
      expectedViewRevision: session.status.viewRevision, commands }, reconcile);
  }, [command, session]);

  const viewTransact = useCallback((commands: Extract<NleEditingSurfaceCommand, { kind: "view.transact" }>["commands"]) => {
    if (session === undefined) return;
    command({ kind: "view.transact", expectedProjectRevision: session.status.projectRevision,
      expectedViewRevision: session.status.viewRevision, commands });
  }, [command, session]);

  const removeSelection = useCallback(() => {
    if (session?.status.viewCompatibility !== "compatible" || (selection.length === 0 && activeTransition === undefined)) return;
    const context = {
      composition: session.timeline.scene.composition,
      expectedProjectRevision: session.status.projectRevision, expectedViewRevision: session.status.viewRevision,
    };
    void perform(async () => {
      const receipt = await operate(activeTransition === undefined
        ? { ...context, kind: "timeline.remove", items: selection }
        : { ...context, kind: "transition.remove", transition: activeTransition });
      selectItems([]);
      await acceptReceipt(receipt);
      if (activeTransition === undefined) await reconcileView();
    });
  }, [acceptReceipt, activeTransition, perform, reconcileView, selection, selectItems, session]);

  const editClipboard = useCallback((kind: "clipboard.copy" | "clipboard.cut" | "clipboard.paste" | "clipboard.apply-groups", token?: string) => {
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
        if ((sessionRef.current?.clipboard.pendingGroups ?? 0) > 0) {
          await acceptReceipt(await operate({ ...target, kind: "clipboard.apply-groups",
            expectedProjectRevision: receipt.status.projectRevision, expectedViewRevision: receipt.status.viewRevision }));
        }
      } else if (kind === "clipboard.apply-groups") {
        await acceptReceipt(await operate({ ...target, kind }));
      } else {
        await acceptReceipt(await operate({ ...target, kind, items: selection }));
        clipboardToken.current = token;
        if (kind === "clipboard.cut") {
          selectItems([]);
          await reconcileView();
        }
      }
    });
  }, [acceptReceipt, frame, perform, reconcileView, selection, selectItems, session]);

  useClipClipboard({
    available: session?.status.viewCompatibility === "compatible" && !busy && source === undefined,
    canCopy: selection.length > 0,
    copy: (token, cut) => editClipboard(cut ? "clipboard.cut" : "clipboard.copy", token),
    paste: token => {
      if (token === clipboardToken.current && (session?.clipboard.items ?? 0) > 0) editClipboard("clipboard.paste");
    },
  });

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

  const keyboard = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const key = (event: KeyboardEvent) => keyboard.current(event);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

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
  const firstProcess = selectedProjectItem?.anchoredProcesses[0] ?? inspector?.scene.processes[0];
  let selectedProcess: NleStudioProcessAddress | undefined;
  if (selection.length === 1 && selectedProjectItem !== undefined) {
    const inspectorHasSelection = inspector?.scene.processes.some(process =>
      process.id === processSelection?.process && process.medium === processSelection.medium);
    if (processSelection?.item === selectedProjectItem.id && inspectorHasSelection !== false) {
      selectedProcess = processSelection;
    } else if (firstProcess !== undefined) {
      selectedProcess = { item: selectedProjectItem.id, medium: firstProcess.medium, process: firstProcess.id };
    }
  }
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
    if ((operation.kind === "transition.materialize" || operation.kind === "transition.replace")
      && typeof receipt.result?.transition === "string") selectTransition(receipt.result.transition);
  });
  const editProcess = (edit: NleStudioProcessEdit) => void perform(async () => {
    await acceptReceipt(await operate({ ...operationContext, ...edit }));
  });
  const navigate = (operation: NleStudioOperation) => void perform(async () => {
    const receipt = await operate(operation);
    const moved = receipt.result?.composition !== scene.composition;
    navigationFrame.current = moved && operation.kind !== "composition.select" && typeof receipt.result?.frame === "number"
      ? receipt.result.frame : undefined;
    await acceptReceipt(receipt);
  });
  const placement = (drop?: MediaDrop) => ({ ...operationContext, atFrame: drop?.frame ?? frame,
    ...(drop?.track === undefined ? {} : { track: drop.track }) });
  const materialize = (entry: NleStudioComponentCatalogEntry, drop?: MediaDrop) => place({
    ...placement(drop), kind: "component.materialize", package: entry.package, offering: entry.offering,
  });
  const freeAudioTrack = (start: number, duration: number) => scene.tracks.find(track =>
    mediaTrackCompatible(track, "audio") && trackHasRoom(track, start, duration));
  const audioTrack = () => ({ id: `audio-${crypto.randomUUID()}`, name: "音频轨道", kind: "audio" as const, enabled: true, items: [] });
  const placeProjectMedia = (entry: NleStudioMediaEntry, drop?: MediaDrop) => {
    const track = drop?.track === undefined ? undefined : scene.tracks.find(item => item.id === drop.track);
    const at = drop?.frame ?? frame;
    const insert = track?.items.some(item => item.startFrame === at)
      && !track.items.some(item => item.startFrame < at && item.startFrame + item.durationFrames > at);
    const request = { ...placement(drop), kind: "media.materialize" as const, media: entry.id };
    if (track === undefined && entry.kind === "audio") {
      const available = freeAudioTrack(at, entry.durationFrames ?? Math.max(1, Math.round(5 * fps)));
      if (available !== undefined) place({ ...request, track: available.id });
      else void perform(async () => {
        const created = audioTrack();
        const added = await sendCommand({ ...operationContext, kind: "project.transact",
          commands: [{ kind: "track.add", composition: scene.composition, track: created }] });
        await acceptReceipt(added);
        const receipt = await operate({ ...request, track: created.id,
          expectedProjectRevision: added.status.projectRevision, expectedViewRevision: added.status.viewRevision });
        await acceptReceipt(receipt, typeof receipt.result?.item === "string" ? receipt.result.item : undefined);
      });
    } else place(insert && track !== undefined && track.kind === "picture"
      ? { ...request, track: track.id, insertTracks: [track.id] } : request);
    setSource(undefined);
  };
  const importProjectMedia = (files: readonly File[]) => void perform(async () => {
    for (const file of files) await acceptReceipt(await importMedia(file));
  }, false);
  const clipEffect = (entry: NleStudioAdjustCatalogEntry) => session.catalog.processes.find(process =>
    process.package === entry.package && process.offering === entry.offering && process.medium === entry.medium);
  const processTargets = (medium: "audio" | "picture", ids: readonly string[]) => {
    const candidates = new Set(editableSelection(scene, ids));
    return scene.tracks.flatMap(track => track.items.filter(item =>
      candidates.has(item.id) && item.role === "present" && item.signals[medium]));
  };
  const materializeProcess = (entry: NleStudioProcessCatalogEntry, items = processTargets(entry.medium, selection)) => {
    if (items.length === 0) return;
    void perform(async () => {
      for (const item of items) {
        const status = sessionRef.current!.status;
        await acceptReceipt(await operate({ ...operationContext, kind: "process.materialize", package: entry.package, offering: entry.offering,
          item: item.id, expectedProjectRevision: status.projectRevision, expectedViewRevision: status.viewRevision }));
      }
    });
  };
  const materializeEffect = (entry: NleStudioAdjustCatalogEntry, drop?: MediaDrop) => {
    const process = clipEffect(entry);
    const items = process === undefined ? [] : processTargets(entry.medium, drop === undefined ? selection : drop.item ? [drop.item] : []);
    if (process !== undefined && items.length > 0) materializeProcess(process, items);
    else place({ ...placement(drop), kind: "adjust.materialize", package: entry.package, offering: entry.offering });
  };
  const selectTransition = (id: string) => {
    setSource(undefined);
    selectItems([]);
    setTransitionSelection(id);
    setPropertiesTab("properties");
  };
  const materializeSelectedTransition = (entry: NleStudioTransitionCatalogEntry, drop?: MediaDrop) => {
    const cuts = transitionCuts(scene);
    const selectedCuts = cuts.filter(cut => selection.includes(cut.outgoing) || selection.includes(cut.incoming));
    const nearest = (selectedCuts.length > 0 ? selectedCuts : cuts)
      .sort((left, right) => Math.abs(frame - left.frame) - Math.abs(frame - right.frame))[0];
    const cut = drop?.transitionCut ?? (selection.length === 2
      ? selectedCuts.find(value => selection.includes(value.outgoing) && selection.includes(value.incoming)) : undefined) ?? nearest;
    const transitionId = drop === undefined ? activeTransition ?? cut?.transition : cut?.transition;
    const offering = { ...operationContext, package: entry.package, offering: entry.offering };
    if (transitionId !== undefined) place({ ...offering, kind: "transition.replace", transition: transitionId });
    else if (cut !== undefined) place({ ...offering, kind: "transition.materialize", items: [cut.outgoing, cut.incoming] });
    else setFailure("请将播放头放在两个直接相接的片段之间，或选中这两个片段。");
  };
  const presets: CatalogDrag[] = [
    ...session.catalog.components.map(entry => ({ kind: "component" as const, entry })),
    ...session.catalog.adjusts.map(entry => ({ kind: "effect" as const, entry })),
    ...session.catalog.transitions.map(entry => ({ kind: "transition" as const, entry })),
  ];
  const pickPreset = (id: string, drop?: MediaDrop) => {
    const preset = presets.find(item => catalogDragId(item) === id);
    if (preset?.kind === "component") materialize(preset.entry, drop);
    else if (preset?.kind === "effect") materializeEffect(preset.entry, drop);
    else if (preset?.kind === "transition") materializeSelectedTransition(preset.entry, drop);
    return preset !== undefined;
  };
  const previewAsset = (entry: NleStudioMediaEntry) => { setPlaying(false); setSource(entry); };
  dropAsset.current = drop => {
    if (pickPreset(drop.id, drop)) return;
    const asset = mediaByPath.get(drop.id);
    if (asset !== undefined) placeProjectMedia(asset, drop);
  };
  dragSelect.current = entry => { if (!pickPreset(entry.id)) previewAsset(entry); };
  const selectionLayer = session.canvas.layers.find(layer => layer.id === selection[0]);
  const rate = selection.length === 1 && selectedProjectItem !== undefined ? session.timeline.retimeRates[selectedProjectItem.id] : undefined;
  const canFreeze = selectedProjectItem?.source === "media" && selectedProjectItem.signals.picture
    && mediaForItem(selectedProjectItem.id)?.pictureKind === "signal"
    && frame >= selectedProjectItem.startFrame && frame < selectedProjectItem.startFrame + selectedProjectItem.durationFrames;
  const spatialTranslate = (item: string, deltaX: number, deltaY: number) => command({
    kind: "spatial.edit", ...operationContext, item, edit: { kind: "frame.translate", deltaX, deltaY },
  });
  const dirty = session.status.projectDirty || session.viewDocument.persistence === "document" && session.status.viewDirty;
  const useFileVersion = () => void perform(async () => {
    const receipt = await reloadSession();
    history.current = { undo: [], redo: [] };
    clipboardToken.current = undefined;
    setSaveConflict(false);
    setConflictOpen(false);
    setSavedAt(undefined);
    select([]);
    await acceptReceipt(receipt, undefined, false);
  }, false);

  const canReplay = (direction: "undo" | "redo") => {
    const key = direction === "undo" ? "canUndo" : "canRedo";
    const entry = history.current[direction].at(-1);
    const step = direction === "undo" ? entry?.steps.at(-1) : entry?.steps[0];
    return step === undefined ? session.status.projectHistory[key]
      : (!step.project || session.status.projectHistory[key]) && (!step.view || session.status.viewHistory[key]);
  };
  const replay = (direction: "undo" | "redo") => void perform(async () => {
    const stack = history.current[direction];
    const entry = stack.at(-1);
    const owners = direction === "undo" ? ["view", "project"] as const : ["project", "view"] as const;
    const steps = direction === "undo" ? entry?.steps.toReversed() : entry?.steps;
    try {
      for (const step of steps ?? [{ project: true, view: false }]) {
        for (const owner of owners) {
          if (!step[owner]) continue;
          const status = sessionRef.current!.status;
          const receipt = await sendCommand(owner === "project"
            ? { kind: direction === "undo" ? "project.undo" : "project.redo", expectedProjectRevision: status.projectRevision }
            : { kind: direction === "undo" ? "view.undo" : "view.redo", expectedViewRevision: status.viewRevision });
          await acceptReceipt(receipt, undefined, false);
        }
      }
      if (entry !== undefined) {
        stack.pop();
        history.current[direction === "undo" ? "redo" : "undo"].push(entry);
        const position = direction === "undo" ? entry.before : entry.after;
        const current = sessionRef.current!.timeline.scene;
        setFrame(Math.min(position.frame, current.maximumFrame));
        select(editableSelection(current, position.selection));
        if (position.transition && current.transitions.some(value => value.id === position.transition)) selectTransition(position.transition);
      }
    } catch (error) {
      history.current = { undo: [], redo: [] };
      throw error;
    }
  });

  const toggleGroup = () => {
    if (!canToggleGroup) return;
    const removals = selectedGroups.map(group => ({ kind: "group.remove" as const, composition: scene.composition, id: group.id }));
    if (grouped) { viewTransact(removals); return; }
    const members = editableSelection(scene, [...selection, ...selectedGroups.flatMap(group => group.items)]);
    if (members.length > 1) viewTransact([...removals, { kind: "group.add", composition: scene.composition,
      group: { id: `group-${crypto.randomUUID()}`, name: "组合", items: members } }]);
  };
  const split = (items: readonly string[], atFrame: number) => place({ ...operationContext, kind: "timeline.split", items, atFrame });
  keyboard.current = event => {
    if (source !== undefined || event.defaultPrevented
      || (event.target as Element | null)?.closest("input,textarea,select,[contenteditable=true],[role=combobox]")
      || document.querySelector("[role=menu],[role=dialog],[role=listbox]")) return;
    if (event.metaKey || event.ctrlKey) {
      if (event.altKey || event.repeat) return;
      if (event.code === "KeyS") event.preventDefault();
      if (editingDisabled) return;
      if (event.code === "KeyA") {
        event.preventDefault(); select(editableSelection(scene, scene.tracks.flatMap(track => track.items.map(item => item.id))));
      } else if (event.code === "KeyZ") {
        event.preventDefault();
        const direction = event.shiftKey ? "redo" : "undo";
        if (canReplay(direction)) replay(direction);
      } else if (event.code === "KeyB") {
        event.preventDefault();
        const items = selectionAtFrame(scene, selection, frame, "split");
        if (items.length > 0) split(items.map(item => item.id), frame);
      } else if (event.code === "KeyG") {
        event.preventDefault();
        if (event.shiftKey) { if (selectedGroups.length > 0) viewTransact(selectedGroups.map(group => ({
          kind: "group.remove", composition: scene.composition, id: group.id,
        }))); } else if (!grouped) toggleGroup();
      }
      return;
    }
    if (event.altKey) return;
    if (event.code === "Space" && !(event.target as Element | null)?.closest("button")) {
      event.preventDefault(); if (!event.repeat) togglePlayback();
    }
    if (event.key === "Escape") setPreviewExpanded(false);
    if (["ArrowLeft", "ArrowRight", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      setPlaying(false);
      const maximum = scene.maximumFrame;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const edges = scene.tracks.flatMap(track => track.items.flatMap(item => [item.startFrame, item.startFrame + item.durationFrames]))
          .map(value => Math.round(value)).sort((left, right) => left - right);
        setFrame(event.key === "ArrowUp" ? edges.findLast(value => value < frame) ?? 0 : edges.find(value => value > frame) ?? maximum);
      } else {
        setFrame(current => event.key === "Home" ? 0 : event.key === "End" ? Math.max(0, maximum - 1)
          : Math.max(0, Math.min(maximum, current + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1))));
      }
    }
    if (!editingDisabled && (event.key === "Delete" || event.key === "Backspace") && (selection.length > 0 || activeTransition)) {
      event.preventDefault(); removeSelection();
    }
  };

  const toTime = (frames: number) => ({
    ticks: String(BigInt(frames) * BigInt(scene.editRate.denominator)),
    timeBase: { numerator: 1, denominator: scene.editRate.numerator },
  });
  const start = selectedProjectItem?.startFrame;
  const end = start === undefined ? undefined : start + selectedProjectItem!.durationFrames;
  const trimRanges = selectedProjectItem === undefined ? undefined : session.timeline.trimRanges[selectedProjectItem.id];
  const slipAvailable = selectedProjectItem?.source === "composition" || selectedProjectItem?.source === "media"
    && mediaForItem(selectedProjectItem.id)?.durationFrames !== undefined;
  const editTime = (item: NleTimelineSceneItem, edge: "start" | "end", atFrame: number) =>
    place({ ...operationContext, kind: "timeline.trim", item: item.id, edge, atFrame });

  return <div className="nle-workspace nle-active" onDragOver={event => {
    if (!editingDisabled && event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }} onDrop={event => {
    if (!event.defaultPrevented && event.dataTransfer.files.length > 0) {
      event.preventDefault();
      if (!editingDisabled) importProjectMedia(Array.from(event.dataTransfer.files));
    }
  }}><div className={classes} style={{
    "--nle-bin-preferred": `${panelWidths.bin}px`,
    "--nle-properties-preferred": `${panelWidths.properties}px`,
  } as React.CSSProperties}>
      <div className="nle-titlebar"><div className="nle-titlebar-side">{saveConflict
        ? <button type="button" className="button" onClick={() => setConflictOpen(true)}>自动保存暂停</button>
        : <small>{dirty ? busy ? "正在自动保存" : "有未保存的修改" : savedAt ? `${saveTime.format(savedAt)} 已自动保存` : "已自动保存"}</small>}</div>
        <button type="button" className="nle-titlebar-name" disabled={editingDisabled} onClick={() => setRenameProject(true)} title="重命名项目">{projectName}</button>
        <div className="nle-titlebar-side end">
          <button type="button" className="button" disabled={busy} onClick={() => dirty ? setConflictOpen(true) : useFileVersion()}>重载</button>
        </div>
      </div>
      <Dialog.Root open={conflictOpen} onOpenChange={setConflictOpen}>
        <Dialog.Portal><Dialog.Backdrop className="studio-dialog-backdrop"/><Dialog.Popup className="studio-dialog modal">
          <Dialog.Title>{saveConflict ? "检测到编辑冲突" : "重载项目"}</Dialog.Title>
          <Dialog.Description>{saveConflict ? "项目文件已被其他程序修改。" : ""}{dirty ? "重载会丢弃 Studio 中尚未保存的修改。" : "重载后可继续编辑。"}</Dialog.Description>
          <footer><button type="button" className="button" disabled={busy} onClick={() => setConflictOpen(false)}>暂不处理</button>
            <button type="button" className="button primary" disabled={busy} onClick={useFileVersion}>重载磁盘版本</button></footer>
        </Dialog.Popup></Dialog.Portal>
      </Dialog.Root>
      {renameProject && <EditorDialog title="重命名项目" initialName={projectName} onClose={() => setRenameProject(false)}
        onSubmit={name => { if (name !== projectName) transact([{ kind: "project.update", name }]); }}/>}
      <ErrorNotice message={failure ?? previewDiagnostic} onClose={() => setFailure(undefined)}/>
      {staleView && <div className="studio-error">当前 View 有失效引用。 <button className="button" disabled={busy}
        onClick={() => command({ kind: "view.reconcile", expectedProjectRevision: session.status.projectRevision,
          expectedViewRevision: session.status.viewRevision })}>整理 View 引用</button></div>}
      <div className="nle-upper">
        <aside className="nle-bin"><div className="nle-bin-tabs" role="tablist">{(Object.keys(icons) as BinTab[]).map(id => { const Icon = icons[id]; return <button type="button" role="tab" aria-selected={binTab === id} key={id} onClick={() => setBinTab(id)}><Icon size={18} strokeWidth={1.6}/><span>{tabNames[id]}</span></button>; })}</div><AnimatePresence mode="popLayout" initial={false}><motion.div key={binTab} className="nle-bin-body" {...enterMotion(reduced)}><StudioBin tab={binTab} catalog={session.catalog} media={session.media} disabled={editingDisabled}
          processSignals={selection.length === 0 ? undefined : {
            audio: processTargets("audio", selection).length > 0,
            picture: processTargets("picture", selection).length > 0,
          }}
          onImportMedia={importProjectMedia} onPlaceMedia={placeProjectMedia} onMaterialize={materialize}
          onMaterializeAdjust={materializeEffect} onMaterializeProcess={entry => materializeProcess(entry)} onMaterializeTransition={materializeSelectedTransition}
          selectedMedia={source?.id} onPreviewMedia={previewAsset} onBeginMediaDrag={assetDrag.start}
          onBeginPresetDrag={(event, preset) => assetDrag.start(event, {
            id: catalogDragId(preset), name: preset.entry.title, state: "available",
            kind: preset.kind === "effect" ? preset.entry.medium : "picture",
          }, preset.kind === "component" ? { role: componentTrackRole(preset.entry.category) ?? undefined, component: true }
            : preset.kind === "effect" ? { role: "effect", process: clipEffect(preset.entry) !== undefined } : { cuts: transitionCuts(scene) })}/></motion.div></AnimatePresence></aside>
        <PanelResizeHandle side="bin" label="调整素材面板宽度" width={panelWidths.bin} onResize={(width, save) => resizePanel("bin", width, save)}/>
        <section className="nle-monitor"><div className="nle-panel-header nle-monitor-title"><span>{projectName}</span><IconButton label={previewExpanded ? "恢复预览" : "放大预览"} onClick={() => setPreviewExpanded(value => !value)}>{previewExpanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</IconButton></div>
          <SourcePreview entry={source} fps={fps} muted={muted} onMute={() => setMuted(value => !value)} onClose={() => setSource(undefined)}/>
          <div className="nle-stage"><div className="nle-editable-preview" style={{ "--canvas-ratio": session.canvas.canvas.width / session.canvas.canvas.height } as React.CSSProperties}><div className="studio-canvas">
            {canvasDraft === undefined && renderedPreview?.mediaType === "image/png" && <img className="studio-preview-frame" src={renderedPreview.resource}/>}
            {renderedPreview?.mediaType === "video/mp4" && playing && <video className="studio-preview-frame"
              key={renderedPreview.resource} src={renderedPreview.resource} muted={muted} autoPlay playsInline
              onTimeUpdate={event => setFrame(Math.min(scene.maximumFrame, previewFrom + Math.floor(event.currentTarget.currentTime * fps)))}
              onEnded={() => {
                const next = previewFrom + (renderedPreview.frameCount ?? 1);
                setFrame(Math.min(next, scene.maximumFrame));
                if (next >= scene.maximumFrame) setPlaying(false);
                else setPreviewFrom(next);
              }}/>}
            {(renderedPreview === undefined || canvasDraft !== undefined) && session.canvas.layers.filter(layer => activeItems.has(layer.id) && layer.layout !== undefined).map(layer => { const layout = canvasDraft?.id === layer.id ? { ...layer.layout!, ...canvasDraft.frame } : layer.layout!; const canvas = session.canvas.canvas; const media = mediaForItem(layer.id); return <button type="button" key={layer.id} className={`studio-canvas-layer${selection.includes(layer.id) ? " selected" : ""}`} onClick={() => select([layer.id])} style={{ left: `${layout.x / canvas.width * 100}%`, top: `${layout.y / canvas.height * 100}%`, width: `${layout.width / canvas.width * 100}%`, height: `${layout.height / canvas.height * 100}%` }}>{media?.resource && media.mediaType?.startsWith("image/") ? <img src={media.resource} style={{ objectFit: layout.fit }}/> : media?.resource && media.mediaType?.startsWith("video/") ? <video src={media.resource} muted playsInline style={{ objectFit: layout.fit }}/> : undefined}<span>{layer.title}</span></button>; })}
            {!playing && source === undefined && <CanvasControls scene={session.canvas} active={activeItems} selection={selection} disabled={editingDisabled} onSelect={select}
              draft={canvasDraft} onDraft={setCanvasDraft} onTranslate={spatialTranslate}
              onResize={(item, next) => command({ kind: "spatial.edit", expectedProjectRevision: session.status.projectRevision, expectedViewRevision: session.status.viewRevision, item, edit: { kind: "frame.resize", frame: next } })}/>}
          </div></div></div>
          <div className="nle-transport"><span className="nle-transport-time"><span className="current">{timecode(frame, fps)}</span><span className="separator">/</span><span className="total">{timecode(scene.maximumFrame, fps)}</span></span><button className="nle-play" aria-label={playing ? "暂停" : "播放"} onClick={togglePlayback}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><span className="nle-transport-actions"><IconButton label="上一帧" onClick={() => { setPlaying(false); setFrame(value => Math.max(0, value - 1)); }}><StepBack size={15}/></IconButton><IconButton label="下一帧" onClick={() => { setPlaying(false); setFrame(value => Math.min(scene.maximumFrame, value + 1)); }}><StepForward size={15}/></IconButton><IconButton label="静音" onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={15}/> : <Volume2 size={15}/>}</IconButton></span></div>
        </section>
        <PanelResizeHandle side="properties" label="调整属性面板宽度" width={panelWidths.properties} onResize={(width, save) => resizePanel("properties", width, save)}/>
        <aside className="nle-properties"><div className="nle-properties-tabs" role="tablist"><button role="tab" aria-selected={propertiesTab === "properties"} onClick={() => setPropertiesTab("properties")}>属性</button>
          <button role="tab" aria-selected={propertiesTab === "text"} onClick={() => setPropertiesTab("text")}>文本</button></div>
          <AnimatePresence mode="popLayout" initial={false}><motion.div key={JSON.stringify([propertiesTab, propertiesTab === "properties" ? activeTransition ?? selection[0] : null])} className="nle-panel-body" {...enterMotion(reduced)}>{propertiesTab === "properties" && selection.length === 1 && selectionLayer?.layout !== undefined
            && <PictureAlignment canvas={session.canvas.canvas} frame={canvasDraft?.id === selectionLayer.id ? canvasDraft.frame : selectionLayer.layout}
              disabled={editingDisabled || !selectionLayer.affordances.translate} onTranslate={(x, y) => spatialTranslate(selectionLayer.id, x, y)}/>}
          {propertiesTab === "properties" && selectedProjectItem !== undefined && selection.length === 1 && activeTransition === undefined && <Section title="时间">
            {Number.isSafeInteger(start) && <Row label="起始帧"><NumberField key={`${selectedProjectItem.id}-start`} label="起始帧"
              value={start!} min={0} max={Number.MAX_SAFE_INTEGER} precision={0} disabled={editingDisabled || !selectedProjectItem.affordances.move}
              onCommit={value => {
                const delta = Math.round(value) - start!;
                if (delta !== 0) place({ ...operationContext, kind: "timeline.drop", anchor: selectedProjectItem.id,
                  items: [selectedProjectItem.id], deltaFrames: delta, target: { kind: "track", track: selectedProjectItem.track } });
              }}/></Row>}
            {Number.isSafeInteger(start) && end !== undefined && trimRanges?.end !== undefined && <Row label="持续帧数">
              <NumberField key={`${selectedProjectItem.id}-duration`} label="持续帧数" value={selectedProjectItem.durationFrames}
                min={Math.max(1, trimRanges.end.minimum - start!)} max={trimRanges.end.maximum - start!}
                precision={0} disabled={editingDisabled} onCommit={value => editTime(selectedProjectItem, "end", start! + Math.round(value))}/>
            </Row>}
            {slipAvailable && <Row label="素材偏移">{([-1, 1] as const).map(delta => <button key={delta} type="button" className="button small"
              disabled={editingDisabled || scene.tracks.find(track => track.id === selectedProjectItem.track)?.locked}
              onClick={() => place({ ...operationContext, kind: "timeline.slip", item: selectedProjectItem.id, deltaFrames: delta })}>
              {delta < 0 ? "前移一帧" : "后移一帧"}
            </button>)}</Row>}
          </Section>}
          {propertiesTab === "properties" && rate !== undefined && selectedProjectItem !== undefined && <Section title="变速">
            <Row label="速度"><NumberField key={selectedProjectItem.id} label="速度倍率" value={Math.abs(rate.numerator / rate.denominator)}
              min={0.01} max={100} step={0.1} disabled={editingDisabled} onCommit={speed => place({
                ...operationContext, kind: "timeline.retime", item: selectedProjectItem.id,
                rate: { numerator: Math.sign(rate.numerator) * Math.round(speed * 100), denominator: 100 },
              })}/></Row>
            <button type="button" className="button" disabled={editingDisabled} onClick={() => place({
              ...operationContext, kind: "timeline.retime", item: selectedProjectItem.id,
              rate: { numerator: -rate.numerator, denominator: rate.denominator },
            })}>{rate.numerator < 0 ? "恢复正放" : "倒放"}</button>
          </Section>}
          {propertiesTab === "text" ? <TimelineTextList scene={scene} selection={selection}
            textItems={new Set([...session.timeline.textItems,
              ...scene.tracks.filter(track => track.role === "subtitle").flatMap(track => track.items.map(item => item.id))])}
            inspector={inspector?.scene} disabled={editingDisabled} onSelect={item => {
              setPlaying(false); setSource(undefined); setFrame(Math.round(item.startFrame)); select([item.id]);
            }} onEdit={(item, section, field, value) => { void command({ ...operationContext, kind: "inspector.edit", item, section, field, value }); }}
              onInvoke={(item, section, collection, row, action) => { void command({ ...operationContext, kind: "inspector.invoke", item, section, collection, row, action }); }}/> : activeTransition !== undefined
          ? <TransitionInspector scene={transitionInspector?.id === activeTransition ? transitionInspector : undefined} disabled={editingDisabled}
            onEdit={(section, field, value) => command({ kind: "transition-inspector.edit", transition: activeTransition,
              section, field, value, expectedProjectRevision: session.status.projectRevision,
              expectedViewRevision: session.status.viewRevision })}
            onResize={durationFrames => place({ ...operationContext, kind: "transition.resize", transition: activeTransition, durationFrames })}
            onRemove={removeSelection}/>
          : <Inspector scene={inspector?.scene} component={inspector?.component} media={session.media.entries}
          disabled={editingDisabled} selectedProcess={selectedProcess} onSelectProcess={setProcessSelection} onEdit={inspectorEdit}
          onInvoke={(item, section, collection, row, action) => command({
            kind: "inspector.invoke", item, section, collection, row, action,
            expectedProjectRevision: session.status.projectRevision, expectedViewRevision: session.status.viewRevision,
          })} onMedia={(item, slot, media) => void perform(async () => {
            await acceptReceipt(await operate(media === ""
              ? { ...operationContext, kind: "component-media.unbind", item, slot }
              : { ...operationContext, kind: "component-media.bind", item, slot, media }));
          })} onProcessEdit={editProcess}/>}</motion.div></AnimatePresence></aside>
      </div>
      <div className="nle-timeline-mount" ref={timelineRoot}><AnimatePresence mode="popLayout" initial={false}><Timeline key={scene.composition} session={session} frame={frame} selection={selection} busy={editingDisabled} canUndo={canReplay("undo")} canRedo={canReplay("redo")} onSeek={value => { setPlaying(false); setSource(undefined); setFrame(value); }} onSelect={select}
        selectedTransition={activeTransition} onSelectTransition={selectTransition}
        drop={assetDrag.drag?.drop} canFreeze={canFreeze} onFreeze={() => selectedProjectItem && place({
          ...operationContext, kind: "media.freeze", item: selectedProjectItem.id, sampleFrame: frame,
          atFrame: frame, durationFrames: Math.max(1, Math.round(fps * 3)),
        })}
        selectedProcess={selectedProcess} onSelectProcess={setProcessSelection}
        onProcessTiming={editProcess}
        onMove={intent => void perform(async () => acceptReceipt(await operate({
          ...operationContext, kind: "timeline.drop", ...intent,
        })))}
        onTrim={(items, edge, atFrame) => {
          if (items.length === 1) editTime(items[0]!, edge, atFrame);
          else if (items.length > 1) transact(items.map(item => ({ kind: "item.trim", id: item.id, edge, at: toTime(atFrame) })));
        }}
        onSplit={split}
        onRemove={removeSelection}
        onApplyPastedGroups={() => editClipboard("clipboard.apply-groups")}
        onTrackEnabled={(track, enabled) => transact([{ kind: "track.update", id: track, enabled }])}
        onTrackLocked={(track, locked) => viewTransact([{ kind: "track-lock.set", composition: scene.composition, track, locked }])}
        onCompositionCreate={(name, canvas) => void perform(async () => {
          const id = `composition-${crypto.randomUUID()}`;
          const result = await sendCommand({ ...operationContext, kind: "project.transact",
            commands: [{ kind: "composition.add", composition: { id, name, canvas, tracks: [], transitions: [], mattes: [] } }] });
          await acceptReceipt(result);
          await acceptReceipt(await operate({ kind: "composition.select", target: id, composition: scene.composition,
            expectedProjectRevision: result.status.projectRevision, expectedViewRevision: result.status.viewRevision }));
          selectItems([]); setFrame(0);
        })}
        onCompositionEdit={(name, canvas) => transact([{ kind: "composition.update", id: scene.composition, name, canvas }])}
        onCompositionRoot={() => transact([{ kind: "project.update", rootComposition: scene.composition }])}
        onCompositionRemove={() => void perform(async () => {
          const result = await operate({ ...operationContext, kind: "composition.select", target: session.project.rootComposition });
          await acceptReceipt(result);
          await acceptReceipt(await sendCommand({ kind: "project.transact",
            expectedProjectRevision: result.status.projectRevision, expectedViewRevision: result.status.viewRevision,
            commands: [{ kind: "composition.remove", id: scene.composition }] }));
          selectItems([]); setFrame(0);
        })}
        onRippleRemove={items => void perform(async () => {
          if (items.length === 0) return;
          await acceptReceipt(await operate({ ...operationContext, kind: "timeline.ripple-remove",
            items: items.map(item => item.id), tracks: [...new Set(items.map(item => item.track))] }));
          selectItems([]);
          await reconcileView();
        })}
        onTrackRename={(id, name) => transact([{ kind: "track.update", id, name }])}
        onTrackRemove={id => {
          const track = scene.tracks.find(track => track.id === id);
          if (track === undefined) return;
          const ids = new Set(track.items.map(item => item.id));
          const commands: NleCommand[] = [
            ...scene.transitions.filter(entry => ids.has(entry.outgoing) || ids.has(entry.incoming))
              .map(entry => ({ kind: "transition.remove" as const, id: entry.id })),
            ...scene.mattes.filter(entry => ids.has(entry.content) || ids.has(entry.matte))
              .map(entry => ({ kind: "matte.remove" as const, id: entry.id })),
            ...(ids.size === 0 ? [] : [{ kind: "item.remove" as const, ids: [...ids] }]),
            { kind: "track.remove", id },
          ];
          transact(commands, true);
        }}
        onTrackHeight={(track, heightPx) => viewTransact([{ kind: "track-height.set", composition: scene.composition, track, heightPx }])}
        onCloseGap={(track, atFrames) => void perform(async () => {
          for (const atFrame of atFrames) {
            const status = sessionRef.current!.status;
            await acceptReceipt(await operate({ ...operationContext, kind: "timeline.close-gap", tracks: [track], atFrame,
              expectedProjectRevision: status.projectRevision, expectedViewRevision: status.viewRevision }));
          }
        })}
        onCompoundUnique={item => void perform(async () => {
          const source = scene.tracks.flatMap(track => track.items).find(entry => entry.id === item)?.nestedComposition;
          if (source === undefined) return;
          const created = await operate({ ...operationContext, kind: "composition.materialize", source, atFrame: frame });
          const copy = created.result?.item;
          await acceptReceipt(created, typeof copy === "string" ? copy : undefined);
          if (typeof copy === "string") await acceptReceipt(await operate({ ...operationContext, kind: "composition.make-unique", item: copy,
            expectedProjectRevision: created.status.projectRevision, expectedViewRevision: created.status.viewRevision }));
        })}
        onCompoundExplode={item => place({ ...operationContext, kind: "composition.explode", item })}
        onTrackMove={(track, before) => place({ ...operationContext, kind: "timeline.track-reorder", track, ...(before === undefined ? {} : { before }) })}
        onComposition={target => navigate({ ...operationContext, kind: "composition.select", target })}
        onEnterComposition={item => navigate({ ...operationContext, kind: "composition.enter", item, atFrame: frame })}
        onReturnComposition={() => navigate({ ...operationContext, kind: "composition.return" })}
        onCompound={() => place({ ...operationContext, kind: "composition.compound", items: selection, name: "复合片段" })}
        onAddTrack={() => transact([{ kind: "track.add", composition: scene.composition, track: { id: `track-${crypto.randomUUID().slice(0, 8)}`, name: "新轨道", kind: "picture", enabled: true, items: [] } }])}
        canToggleGroup={canToggleGroup} grouped={grouped} onToggleGroup={toggleGroup}
        canDetachAudio={canDetachAudio} onDetachAudio={() => void perform(async () => {
          if (!canDetachAudio || selectedProjectItem === undefined) return;
          const available = freeAudioTrack(selectedProjectItem.startFrame, selectedProjectItem.durationFrames);
          if (available !== undefined) {
            const receipt = await operate({ ...operationContext, kind: "audio.detach", item: selectedProjectItem.id, track: available.id });
            await acceptReceipt(receipt, typeof receipt.result?.item === "string" ? receipt.result.item : undefined);
          } else {
            const track = audioTrack(), audioItemId = `audio-item-${crypto.randomUUID()}`;
            const receipt = await sendCommand({ ...operationContext, kind: "project.transact", commands: [
              { kind: "track.add", composition: scene.composition, track },
              { kind: "item.detach-audio", id: selectedProjectItem.id, track: track.id, audioItemId },
            ] });
            await acceptReceipt(receipt, audioItemId);
          }
        })}
        onUndo={() => replay("undo")}
        onRedo={() => replay("redo")}/></AnimatePresence></div>
      <AnimatePresence>{assetDrag.drag !== undefined && <motion.div {...fadeMotion(reduced)} className="nle-floating-preview" style={{ position: "fixed", left: assetDrag.drag.x + 12, top: assetDrag.drag.y + 12, pointerEvents: "none" }}>
        <MediaThumbnail entry={assetDrag.drag.entry}/><span>{assetDrag.drag.entry.name}</span>
      </motion.div>}</AnimatePresence>
    </div></div>;
}
