import { Dialog } from "@base-ui/react/dialog";
import type { ProjectMediaAssetChange, ProjectMediaLibraryChange } from "@hypit/media-asset/service";
import type { NleCommand } from "@hypit/nle";
import type { NleTimelineSceneItem } from "@hypit/nle/surface";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
  editMediaLibrary,
  importMedia,
  editMediaAsset,
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
import { PanelResizeHandle, TimelineResizeHandle, defaultPanelWidths, minimumPanelWidths, maximumPanelWidths, type PanelSide } from "./PanelResizeHandle.js";
import { StudioBin, type BinTab } from "./StudioBin.js";
import { Timeline } from "./Timeline.js";
import { NumberField, Row, Section } from "./controls.js";
import { useProgrammePreview } from "./useProgrammePreview.js";

import { PreviewMonitor } from "./PreviewMonitor.js";
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
import { transitionCuts, type MediaDrop } from "./mediaDrag.js";
import { studioIcons } from "./studio-icons.js";
import { useEditorPosition } from "./useEditorPosition.js";
import { ExportVideo } from "./ExportVideo.js";
import { HypitBrand } from "./HypitBrand.js";

function readPanelWidths(): typeof defaultPanelWidths {
  try {
    const saved = JSON.parse(localStorage.getItem("hypit:nle:panel-sizes") ?? "null") as Partial<typeof defaultPanelWidths> | null;
    return Object.fromEntries(Object.entries(defaultPanelWidths).map(([side, fallback]) => {
      const panel = side as PanelSide;
      const value = saved?.[panel];
      return [panel, Number.isFinite(value)
        ? Math.max(minimumPanelWidths[panel], Math.min(maximumPanelWidths[panel], value!)) : fallback];
    })) as typeof defaultPanelWidths;
  } catch { return defaultPanelWidths; }
}

const timelineShareKey = "hypit:nle:timeline-share";
function readTimelineShare(): number {
  try {
    const share = Number(localStorage.getItem(timelineShareKey));
    if (share > 0 && share < 1) return share;
  } catch { /* Layout remains usable without storage. */ }
  return .44;
}

const saveTime = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const saveDateTime = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium", hourCycle: "h23" });
type EditPosition = { readonly frame: number; readonly selection: readonly string[]; readonly transition: string | undefined };
type EditHistoryEntry = {
  readonly steps: number;
  readonly before: EditPosition;
  readonly after: EditPosition;
};

export function Studio() {
  const reduced = useReducedMotion();
  const history = useRef<{ undo: EditHistoryEntry[]; redo: EditHistoryEntry[] }>({ undo: [], redo: [] });
  const editSteps = useRef(0);
  const [session, setSession] = useState<NleStudioOpenProjection>();
  const [failure, setFailure] = useState<string>();
  const [saveConflict, setSaveConflict] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [renameProject, setRenameProject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [timelineBlocked, setTimelineBlocked] = useState(false);
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
  const [timelineReveal, setTimelineReveal] = useState<{ frame: number }>();
  const frameRef = useRef(0);
  const setFrame = useCallback((value: number | ((previous: number) => number)) => {
    const next = typeof value === "function" ? value(frameRef.current) : value;
    frameRef.current = next;
    updateFrame(next);
  }, []);
  const navigationFrame = useRef<number | undefined>(undefined);
  const clipboardToken = useRef<string | undefined>(undefined);
  const [sourceId, setSourceId] = useState<string>();
  const source = sourceId === undefined ? undefined : session?.media.entries.find(entry => entry.id === sourceId && entry.state === "available");
  const showProgramme = () => setSourceId(undefined);
  const [canvasDraft, setCanvasDraft] = useState<CanvasDraft>();
  const [propertiesTab, setPropertiesTab] = useState<"properties" | "text">("properties");
  const timelineRoot = useRef<HTMLDivElement>(null);
  const timelineRegionId = useId();
  const dropAsset = useRef<(drop: MediaDrop) => void>(() => {});
  const moveDraggedMedia = useRef<(asset: string, folder: string | null) => void>(() => {});
  const dragSelect = useRef<(asset: NleStudioMediaEntry) => void>(() => {});
  const assetDrag = useAssetDrag(session?.timeline.scene, timelineRoot, frame, busy,
    drop => dropAsset.current(drop), asset => dragSelect.current(asset),
    (asset, folder) => moveDraggedMedia.current(asset, folder));

  const [playing, setPlaying] = useState(false);
  const [playFrom, setPlayFrom] = useState<{ generation: string; frame: number }>();
  const [muted, setMuted] = useState(false);
  const [binTab, setBinTab] = useState<BinTab>("assets");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [panelWidths, setPanelWidths] = useState(readPanelWidths);
  const [timelineShare, setTimelineShare] = useState(readTimelineShare);
  const sessionRef = useRef<NleStudioOpenProjection | undefined>(undefined);
  const selectionRef = useRef<readonly string[]>([]);
  const inspectorRead = useRef(0);
  const work = useRef<Promise<void>>(Promise.resolve());
  const editsInFlight = useRef(0);
  const timelineBlockedRef = useRef(false);
  const externalEdit = useRef(0);
  const activeTransition = session?.timeline.scene.transitions.find(value => value.id === transition)?.id;
  const picture = session?.preview.state === "available" ? session.preview.programme : undefined;
  const playbackEnd = session?.timeline.scene.maximumFrame ?? 0;
  const editRate = session?.timeline.scene.editRate;
  const canPreview = source === undefined && session !== undefined;
  const requested = playing && !busy && canPreview && picture?.generation === playFrom?.generation ? playFrom : undefined;
  const programme = useProgrammePreview(
    picture, Math.min(frame, Math.max(0, Math.ceil(playbackEnd) - 1)), canPreview,
    {
      from: requested?.frame, fps: editRate === undefined ? 0 : editRate.numerator / editRate.denominator,
      muted, onFrame: setFrame,
      onEnd: () => { setFrame(playbackEnd); setPlaying(false); },
      onError: message => { setFailure(message); setPlaying(false); },
    },
  );

  useEffect(() => {
    if (!playing) return;
    if (requested === undefined || programme.failure !== undefined) setPlaying(false);
  }, [playing, requested, programme.failure]);
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
  }, [activeTransition, session?.timeline.scene]);

  const storeSession = useCallback((next: NleStudioOpenProjection) => {
    const previous = sessionRef.current?.timeline.scene;
    const timeline = next.timeline.scene;
    if (previous?.composition === timeline.composition) {
      const previousRate = previous.editRate.numerator / previous.editRate.denominator;
      const nextRate = timeline.editRate.numerator / timeline.editRate.denominator;
      if (previousRate !== nextRate) setFrame(Math.min(timeline.maximumFrame, Math.round(frameRef.current * nextRate / previousRate)));
    }
    sessionRef.current = next;
    setSession(next);
    if (!next.status.projectDirty) {
      setSaveConflict(false);
    }
  }, [setFrame]);

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
    const read = ++inspectorRead.current;
    const item = selectionRef.current[0];
    if (item === undefined) return;
    if (!current.timeline.scene.tracks.some(track => track.items.some(entry => entry.id === item))) {
      selectItems([]);
      return;
    }
    const isCurrent = () => inspectorRead.current === read && selectionRef.current[0] === item
      && sessionRef.current?.status.projectRevision === current.status.projectRevision
      && sessionRef.current.timeline.scene.composition === current.timeline.scene.composition;
    try {
      const next = await readInspector(item);
      if (isCurrent()) setInspector(next);
    } catch (error) {
      if (isCurrent()) setFailure(error instanceof Error ? error.message : String(error));
    }
  }, [selectItems]);

  const resizePanel = (side: PanelSide, width: number) => {
    setPanelWidths(previous => {
      const next = { ...previous, [side]: width };
      localStorage.setItem("hypit:nle:panel-sizes", JSON.stringify(next));
      return next;
    });
  };

  const resizeTimeline = (share: number) => {
    setTimelineShare(share);
    try { localStorage.setItem(timelineShareKey, String(share)); } catch { /* The current layout has already been applied. */ }
  };

  const perform = useCallback(async (operation: () => Promise<void>, {
    autosave = true, timelineGesture = false,
  }: { readonly autosave?: boolean; readonly timelineGesture?: boolean } = {}) => {
    if (!timelineGesture && editsInFlight.current > 0) return;
    if (timelineGesture && timelineBlockedRef.current) {
      setFailure("当前操作还在提交，请完成后再编辑时间线。");
      return;
    }
    if (!timelineGesture) {
      timelineBlockedRef.current = true;
      setTimelineBlocked(true);
    }
    editsInFlight.current += 1;
    setBusy(true); setFailure(undefined); setPlaying(false);
    try {
      await enqueue(async () => {
        const position = (): EditPosition => ({ frame: frameRef.current, selection: selectionRef.current, transition: transitionRef.current });
        const before = position();
        const startingRevision = sessionRef.current?.status.projectRevision;
        editSteps.current = 0;
        try {
          await operation();
        } finally {
          const steps = editSteps.current;
          editSteps.current = 0;
          if (steps > 0) {
            history.current.undo.push({ steps, before, after: position() });
            history.current.redo = [];
          }
          const current = sessionRef.current;
          if (autosave && current?.status.projectDirty && current.status.projectRevision !== startingRevision) {
            storeSession(await refreshOpen(current, await saveSession()));
          }
        }
      });
    } finally {
      editsInFlight.current -= 1;
      if (!timelineGesture) {
        timelineBlockedRef.current = false;
        setTimelineBlocked(false);
      }
      if (editsInFlight.current === 0) setBusy(false);
    }
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
        if (previous !== undefined && projection.status.projectRevision !== previous.status.projectRevision) {
          externalEdit.current += 1;
          history.current = { undo: [], redo: [] };
        }
        storeSession(projection);
        if (reread || invalidated.includes("inspector")) void refreshInspector(projection);
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
    if (sessionRef.current !== undefined) void refreshInspector(sessionRef.current);
  }, [refreshInspector, selectItems]);

  useEditorPosition(session, { frame, selection, previewExpanded }, navigationFrame, value => {
    setFrame(value.frame); select(value.selection); setPreviewExpanded(value.previewExpanded);
  });

  const acceptReceipt = useCallback(async (receipt: NleStudioOperationReceipt, item?: string, recordHistory = true) => {
    const current = sessionRef.current;
    if (current === undefined) return;
    const next = await refreshOpen(current, receipt);
    if (recordHistory && receipt.projectChanged) editSteps.current += 1;
    storeSession(next);
    if (item !== undefined) selectItems([item]);
    if (item !== undefined || receipt.invalidated.includes("inspector")) void refreshInspector(next);
  }, [refreshInspector, selectItems, storeSession]);

  const command = useCallback((value: NleEditingSurfaceCommand) => perform(async () => {
    await acceptReceipt(await sendCommand(value));
  }), [acceptReceipt, perform]);

  const transact = useCallback((commands: readonly NleCommand[]) => {
    if (session === undefined) return;
    command({ kind: "project.transact", expectedProjectRevision: session.status.projectRevision, commands });
  }, [command, session]);

  const removeSelection = useCallback(() => {
    if (session === undefined || (selection.length === 0 && activeTransition === undefined)) return;
    const context = {
      composition: session.timeline.scene.composition,
      expectedProjectRevision: session.status.projectRevision,
    };
    void perform(async () => {
      const receipt = await operate(activeTransition === undefined
        ? { ...context, kind: "timeline.remove", items: selection }
        : { ...context, kind: "transition.remove", transition: activeTransition });
      selectItems([]);
      await acceptReceipt(receipt);
    });
  }, [acceptReceipt, activeTransition, perform, selection, selectItems, session]);

  const editClipboard = useCallback((kind: "clipboard.copy" | "clipboard.cut" | "clipboard.paste", token?: string) => {
    if (session === undefined) return;
    const target = {
      composition: session.timeline.scene.composition,
      expectedProjectRevision: session.status.projectRevision,
    };
    void perform(async () => {
      if (kind === "clipboard.paste") {
        const receipt = await operate({ ...target, kind, atFrame: frame });
        const item = receipt.result?.item;
        await acceptReceipt(receipt, typeof item === "string" ? item : undefined);
      } else {
        await acceptReceipt(await operate({ ...target, kind, items: selection }));
        clipboardToken.current = token;
        if (kind === "clipboard.cut") {
          selectItems([]);
        }
      }
    });
  }, [acceptReceipt, frame, perform, selection, selectItems, session]);

  useClipClipboard({
    available: session !== undefined && !busy && source === undefined,
    canCopy: selection.length > 0,
    copy: (token, cut) => editClipboard(cut ? "clipboard.cut" : "clipboard.copy", token),
    paste: token => {
      if (token === clipboardToken.current && (session?.clipboard.items ?? 0) > 0) editClipboard("clipboard.paste");
    },
  });

  const togglePlayback = useCallback(() => {
    if (playing) { setPlaying(false); return; }
    if (editsInFlight.current > 0 || !canPreview || playbackEnd <= 0 || picture === undefined) return;
    const start = frameRef.current >= playbackEnd ? 0 : Math.floor(frameRef.current);
    programme.unlockAudio();
    setFrame(start);
    setPlayFrom({ generation: picture.generation, frame: start });
    setPlaying(true);
  }, [canPreview, picture, playbackEnd, playing, programme.unlockAudio, setFrame]);

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
  const editingDisabled = busy;
  const fps = scene.editRate.numerator / scene.editRate.denominator;
  const previewDiagnostic = programme.failure;
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
  const grouped = selectedGroups.length === 1 && selection.every(item => selectedGroups[0]!.items.includes(item));
  const groupLabel = !grouped ? "组合" : selectedGroups[0]!.items.length === selection.length ? "取消组合" : "移出组合";
  const groupMembers = [...new Set([...selection, ...selectedGroups.flatMap(group => group.items)])];
  const canEditGroups = editableSelection(scene, groupMembers).length === groupMembers.length;
  const canToggleGroup = canEditGroups && (selection.length > 1 || selectedGroups.length > 0);
  const canDetachAudio = selection.length === 1 && selectedProjectItem?.kind === "present"
    && selectedProjectItem.signals.picture && selectedProjectItem.signals.audio;
  const icons = { assets: studioIcons.assets, text: studioIcons.text, subtitles: studioIcons.subtitle,
    transitions: studioIcons.transition, filters: studioIcons.filter, effects: studioIcons.effect } as const;
  const tabNames = { assets: "素材", text: "文本", subtitles: "字幕", transitions: "转场", filters: "滤镜", effects: "特效" } as const;
  const classes = `nle-editor${previewExpanded ? " nle-preview-expanded" : ""}`;
  const projectName = session.project.name;
  const inspectorEdit = (section: string, field: string, value: string | number | boolean) => {
    if (selection[0] === undefined) return;
    command({ kind: "inspector.edit", expectedProjectRevision: session.status.projectRevision,
      item: selection[0], section, field, value });
  };
  const operationContext = {
    composition: scene.composition,
    expectedProjectRevision: session.status.projectRevision,
  };
  const editVersion = externalEdit.current;
  const commitTimelineGesture = (operation: NleStudioOperation) => perform(async () => {
    const current = sessionRef.current;
    if (current === undefined || editVersion !== externalEdit.current
      || current.timeline.scene.composition !== operation.composition
      || current.timeline.scene.editRate.numerator !== scene.editRate.numerator
      || current.timeline.scene.editRate.denominator !== scene.editRate.denominator) {
      throw new Error("拖动期间时间线已更新，请重新操作。");
    }
    await acceptReceipt(await operate({ ...operation, expectedProjectRevision: current.status.projectRevision }));
  }, { timelineGesture: true });
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
    showProgramme();
    const receipt = await operate(operation);
    const moved = receipt.result?.composition !== scene.composition;
    navigationFrame.current = moved && operation.kind !== "composition.select" && typeof receipt.result?.frame === "number"
      ? receipt.result.frame : undefined;
    await acceptReceipt(receipt);
  });
  const openCreatedComposition = async (id: string, receipt: NleStudioOperationReceipt) => {
    await acceptReceipt(receipt);
    await acceptReceipt(await operate({ kind: "composition.select", target: id, composition: scene.composition,
      expectedProjectRevision: receipt.status.projectRevision }));
    showProgramme();
    selectItems([]);
    setFrame(0);
  };
  const placement = (drop?: MediaDrop) => ({ ...operationContext, atFrame: drop?.frame ?? frame,
    ...(drop?.track === undefined ? {} : { track: drop.track }) });
  const materialize = (entry: NleStudioComponentCatalogEntry, drop?: MediaDrop) => place({
    ...placement(drop), kind: "component.materialize", package: entry.package, offering: entry.offering,
  });
  const placeProjectMedia = (entry: NleStudioMediaEntry, drop?: MediaDrop) => {
    const track = drop?.track === undefined ? undefined : scene.tracks.find(item => item.id === drop.track);
    const at = drop?.frame ?? frame;
    const insert = track?.items.some(item => item.startFrame === at)
      && !track.items.some(item => item.startFrame < at && item.startFrame + item.durationFrames > at);
    const request = { ...placement(drop), kind: "media.materialize" as const, media: entry.id };
    place(insert && track?.role === "picture"
      ? { ...request, track: track.id, insertTracks: [track.id] } : request);
    showProgramme();
  };
  const importProjectMedia = (files: readonly File[], folder: string | null) => void perform(async () => {
    for (const file of files) await acceptReceipt(await importMedia(file, folder));
  }, { autosave: false });
  const changeMediaLibrary = (change: ProjectMediaLibraryChange) => {
    const library = sessionRef.current?.mediaLibrary;
    if (library?.state !== "available") return;
    void enqueue(async () => {
      setFailure(undefined);
      try {
        await acceptReceipt(await editMediaLibrary({ ...change, expectedRevision: library.revision }));
      } catch (error) {
        const current = sessionRef.current;
        if (current) storeSession(await refreshOpen(current, { status: current.status, invalidated: ["media-library"] }));
        throw error;
      }
    });
  };
  const changeMediaAsset = (change: ProjectMediaAssetChange) => void enqueue(async () => {
    const current = sessionRef.current;
    if (current === undefined) return;
    setFailure(undefined);
    await acceptReceipt(await editMediaAsset({ ...change, expectedGeneration: current.media.generation }));
    if (change.kind === "asset.remove") setSourceId(previous => previous === change.asset.path ? undefined : previous);
  });
  moveDraggedMedia.current = (asset, folder) => changeMediaLibrary({ kind: "asset.move", asset: { path: asset }, folder });
  const processTargets = (medium: "audio" | "picture", ids: readonly string[]) => {
    const candidates = new Set(editableSelection(scene, ids));
    return scene.tracks.flatMap(track => track.items.filter(item =>
      candidates.has(item.id) && item.kind === "present" && item.signals[medium]));
  };
  const materializeProcess = (entry: NleStudioProcessCatalogEntry, items = processTargets(entry.medium, selection)) => {
    if (items.length === 0) return;
    void perform(async () => {
      for (const item of items) {
        const status = sessionRef.current!.status;
        await acceptReceipt(await operate({ ...operationContext, kind: "process.materialize", package: entry.package, offering: entry.offering,
          item: item.id, expectedProjectRevision: status.projectRevision }));
      }
    });
  };
  const materializeAdjust = (entry: NleStudioAdjustCatalogEntry, drop?: MediaDrop) => {
    const items = entry.role === "filter" && drop?.item ? processTargets(entry.medium, [drop.item]) : [];
    if (items.length > 0) materializeProcess(entry, items);
    else place({ ...placement(drop), kind: "adjust.materialize", package: entry.package, offering: entry.offering });
  };
  const selectTransition = (id: string) => {
    showProgramme();
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
    ...session.catalog.adjusts.map(entry => ({ kind: "adjust" as const, entry })),
    ...session.catalog.transitions.map(entry => ({ kind: "transition" as const, entry })),
  ];
  const pickPreset = (id: string, drop?: MediaDrop) => {
    const preset = presets.find(item => catalogDragId(item) === id);
    if (preset?.kind === "component") materialize(preset.entry, drop);
    else if (preset?.kind === "adjust") materializeAdjust(preset.entry, drop);
    else if (preset?.kind === "transition") materializeSelectedTransition(preset.entry, drop);
    return preset !== undefined;
  };
  const previewAsset = (entry: NleStudioMediaEntry) => { setPlaying(false); setSourceId(entry.id); };
  const revealProgrammeFrame = (value: number) => { setFrame(value); setTimelineReveal({ frame: value }); };
  const seekProgramme = (value: number, reveal = true) => {
    setPlaying(false);
    showProgramme();
    if (reveal) revealProgrammeFrame(value);
    else setFrame(value);
  };
  const selectTimeline = (ids: readonly string[]) => { showProgramme(); select(ids); };
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
  const dirty = session.status.projectDirty;
  const savedAt = new Date(session.status.savedAt);
  const showSaveConflict = saveConflict && !conflictOpen;
  const useFileVersion = () => void perform(async () => {
    const receipt = await reloadSession();
    history.current = { undo: [], redo: [] };
    clipboardToken.current = undefined;
    setSaveConflict(false);
    setConflictOpen(false);
    select([]);
    await acceptReceipt(receipt, undefined, false);
  }, { autosave: false });

  const canReplay = (direction: "undo" | "redo") =>
    session.status.projectHistory[direction === "undo" ? "canUndo" : "canRedo"];
  const replay = (direction: "undo" | "redo") => void perform(async () => {
    const stack = history.current[direction];
    const entry = stack.at(-1);
    try {
      for (let step = 0; step < (entry?.steps ?? 1); step++) {
        const { projectRevision } = sessionRef.current!.status;
        const receipt = await sendCommand({ kind: direction === "undo" ? "project.undo" : "project.redo",
          expectedProjectRevision: projectRevision });
        await acceptReceipt(receipt, undefined, false);
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

  const unlinkSelection = () => {
    if (!canEditGroups || selectedGroups.length === 0) return;
    transact(selectedGroups.map((group): NleCommand => {
      const remaining = group.items.filter(item => !selection.includes(item));
      return remaining.length < 2 ? { kind: "group.remove", composition: scene.composition, id: group.id }
        : { kind: "group.replace", composition: scene.composition, group: { ...group, items: remaining } };
    }));
  };
  const toggleGroup = () => {
    if (!canToggleGroup) return;
    if (grouped) { unlinkSelection(); return; }
    transact([
      ...selectedGroups.map(group => ({ kind: "group.remove" as const, composition: scene.composition, id: group.id })),
      { kind: "group.add", composition: scene.composition, group: { id: `group-${crypto.randomUUID()}`, items: groupMembers } },
    ]);
  };
  const split = (items: readonly string[], atFrame: number) => place({ ...operationContext, kind: "timeline.split", items, atFrame });
  keyboard.current = event => {
    if (event.defaultPrevented
      || (event.target as Element | null)?.closest("input:not([type=range]),textarea,select,[contenteditable=true],[role=combobox]")
      || document.querySelector("[role=menu],[role=dialog],[role=listbox]")) return;
    if (source !== undefined && event.key === "Escape") { event.preventDefault(); showProgramme(); return; }
    if (event.key === "Escape") setPreviewExpanded(false);
    if (source !== undefined || (event.target as Element | null)?.closest("input,.library-grid")) return;
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
        if (event.shiftKey) unlinkSelection();
        else if (!grouped) toggleGroup();
      }
      return;
    }
    if (event.altKey) return;
    if (event.code === "Space" && !(event.target as Element | null)?.closest("button")) {
      event.preventDefault(); if (!event.repeat) togglePlayback();
    }
    if (["ArrowLeft", "ArrowRight", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      setPlaying(false);
      const current = frameRef.current;
      const maximum = scene.maximumFrame;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const edges = scene.tracks.flatMap(track => track.items.flatMap(item => [item.startFrame, item.startFrame + item.durationFrames]))
          .map(value => Math.round(value)).sort((left, right) => left - right);
        revealProgrammeFrame(event.key === "ArrowUp" ? edges.findLast(value => value < current) ?? 0 : edges.find(value => value > current) ?? maximum);
      } else {
        revealProgrammeFrame(event.key === "Home" ? 0 : event.key === "End" ? Math.max(0, Math.ceil(maximum) - 1)
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
      if (!editingDisabled) importProjectMedia(Array.from(event.dataTransfer.files), null);
    }
  }}><div className={classes} style={{
    "--nle-bin-minimum": `${minimumPanelWidths.bin}px`,
    "--nle-bin-preferred": `${panelWidths.bin}px`,
    "--nle-properties-preferred": `${panelWidths.properties}px`,
  } as React.CSSProperties}>
      <div className="nle-titlebar">
        <div className="nle-titlebar-side nle-titlebar-start">
          <HypitBrand/>
          <small className="nle-save-status" role="status" title={saveDateTime.format(savedAt)}>
            <time dateTime={session.status.savedAt}>{saveTime.format(savedAt)}</time>{" 已自动保存"}
          </small>
        </div>
        <button type="button" className="nle-titlebar-name" disabled={editingDisabled} onClick={() => setRenameProject(true)} title="重命名项目">{projectName}</button>
        <div className="nle-titlebar-side end">
          <ExportVideo session={session} disabled={editingDisabled || dirty || !!saveConflict}/>
        </div>
      </div>
      <Dialog.Root open={saveConflict && conflictOpen} onOpenChange={setConflictOpen}>
        <Dialog.Portal><Dialog.Backdrop className="studio-dialog-backdrop"/><Dialog.Popup className="studio-dialog modal">
          <Dialog.Title>文件已被其他程序修改</Dialog.Title>
          <Dialog.Description>当前改动尚未保存。使用文件中的版本会丢弃未保存的改动，并清空撤销记录。</Dialog.Description>
          <footer><button type="button" className="button" disabled={busy} onClick={() => setConflictOpen(false)}>暂不处理</button>
            <button type="button" className="button primary" disabled={busy} onClick={useFileVersion}>使用文件中的版本</button></footer>
        </Dialog.Popup></Dialog.Portal>
      </Dialog.Root>
      {renameProject && <EditorDialog title="重命名项目" initialName={projectName} onClose={() => setRenameProject(false)}
        onSubmit={name => { if (name !== projectName) transact([{ kind: "project.update", name }]); }}/>}
      <ErrorNotice message={showSaveConflict ? "自动保存失败，文件已被其他程序修改。" : failure ?? previewDiagnostic}
        {...(showSaveConflict ? {} : { onClose: () => setFailure(undefined) })}>
        {showSaveConflict && <button type="button" className="button" onClick={() => setConflictOpen(true)}>处理冲突</button>}
      </ErrorNotice>
      <div className="nle-split-layout" style={{ "--nle-timeline-share": timelineShare } as React.CSSProperties}>
      <div className="nle-upper">
        <aside className="nle-bin"><div className="nle-bin-tabs" role="tablist">{(Object.keys(icons) as BinTab[]).map(id => { const Icon = icons[id]; return <button type="button" role="tab" aria-selected={binTab === id} key={id} onClick={() => setBinTab(id)}><Icon size={18} strokeWidth={1.6}/><span>{tabNames[id]}</span></button>; })}</div><AnimatePresence mode="popLayout" initial={false}><motion.div key={binTab} className="nle-bin-body" {...enterMotion(reduced)}><StudioBin tab={binTab} catalog={session.catalog} media={session.media} mediaLibrary={session.mediaLibrary} usedMedia={session.project.usedMedia} disabled={editingDisabled} folderDrop={assetDrag.drag?.folder}
          processSignals={selection.length === 0 ? undefined : {
            audio: processTargets("audio", selection).length > 0,
            picture: processTargets("picture", selection).length > 0,
          }}
          onImportMedia={importProjectMedia} onEditLibrary={changeMediaLibrary} onEditMedia={changeMediaAsset} onPlaceMedia={placeProjectMedia} onMaterialize={materialize}
          onMaterializeAdjust={materializeAdjust} onMaterializeProcess={entry => materializeProcess(entry)} onMaterializeTransition={materializeSelectedTransition}
          onPreviewMedia={previewAsset} onOpenMediaFolder={showProgramme}
          onBeginMediaDrag={(event, entry, onClick) => assetDrag.start(event, entry, { onClick })}
          onBeginPresetDrag={(event, preset) => assetDrag.start(event, {
            id: catalogDragId(preset), name: preset.entry.title, state: "available",
            kind: preset.kind === "adjust" ? preset.entry.medium : "picture",
            ...(preset.kind === "transition" ? {} : { durationFrames: preset.entry.durationFrames }),
          }, preset.kind === "component" ? { role: preset.entry.role, component: true }
            : preset.kind === "adjust" ? { role: preset.entry.role, adjust: true, process: preset.entry.role === "filter" } : { cuts: transitionCuts(scene) })}/></motion.div></AnimatePresence></aside>
        <PanelResizeHandle side="bin" label="调整素材面板宽度" width={panelWidths.bin} onResize={width => resizePanel("bin", width)}/>
        <PreviewMonitor projectName={projectName} source={source} mediaGeneration={session.media.derivedViews ? session.media.generation : undefined}
          muted={muted} onMute={() => setMuted(value => !value)} expanded={previewExpanded} onExpand={() => setPreviewExpanded(value => !value)}
          programme={{ frame, end: scene.maximumFrame, fps, playing, canPlay: canPreview && !busy && picture !== undefined,
            toggle: togglePlayback, seek: seekProgramme,
            step: delta => seekProgramme(Math.max(0, Math.min(scene.maximumFrame, frameRef.current + delta))) }}>
          <div className="nle-editable-preview" style={{ "--canvas-ratio": session.canvas.canvas.width / session.canvas.canvas.height } as React.CSSProperties}><div className="studio-canvas">
            {programme.documents.map(entry => <iframe key={entry.generation} title="节目预览" sandbox="allow-scripts" tabIndex={-1}
              className="studio-programme-preview" src={entry.document}
              data-active={entry.generation === programme.visible?.generation && canvasDraft === undefined}
              onLoad={event => programme.loaded(entry, event.currentTarget)}/>)}
            {(programme.visible === undefined || canvasDraft !== undefined)
              && session.canvas.layers.filter(layer => layer.enabled && layer.trackEnabled && activeItems.has(layer.id) && layer.layout !== undefined)
                .map(layer => { const layout = canvasDraft?.id === layer.id ? { ...layer.layout!, ...canvasDraft.frame } : layer.layout!; const canvas = session.canvas.canvas; const media = mediaForItem(layer.id); return <button type="button" key={layer.id} className={`studio-canvas-layer${selection.includes(layer.id) ? " selected" : ""}`} onClick={() => select([layer.id])} style={{ left: `${layout.x / canvas.width * 100}%`, top: `${layout.y / canvas.height * 100}%`, width: `${layout.width / canvas.width * 100}%`, height: `${layout.height / canvas.height * 100}%` }}>{media?.resource && media.mediaType?.startsWith("image/") ? <img src={media.resource} style={{ objectFit: layout.fit }}/> : media?.resource && media.mediaType?.startsWith("video/") ? <video src={media.resource} muted playsInline style={{ objectFit: layout.fit }}/> : undefined}<span>{layer.title}</span></button>; })}
            {!playing && source === undefined && <CanvasControls scene={session.canvas} active={activeItems} selection={selection} disabled={editingDisabled} onSelect={select}
              draft={canvasDraft} onDraft={setCanvasDraft} onTranslate={spatialTranslate}
              onResize={(item, next) => command({ kind: "spatial.edit", expectedProjectRevision: session.status.projectRevision, item, edit: { kind: "frame.resize", frame: next } })}/>}
          </div></div>
        </PreviewMonitor>
        <PanelResizeHandle side="properties" label="调整属性面板宽度" width={panelWidths.properties} onResize={width => resizePanel("properties", width)}/>
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
                rate: { numerator: (rate.numerator < 0 && !selectedProjectItem.signals.audio ? -1 : 1) * Math.round(speed * 100), denominator: 100 },
              })}/></Row>
            {selectedProjectItem.signals.picture && !selectedProjectItem.signals.audio && <button type="button"
              className="button" disabled={editingDisabled} onClick={() => place({
                ...operationContext, kind: "timeline.retime", item: selectedProjectItem.id,
                rate: { numerator: -rate.numerator, denominator: rate.denominator },
              })}>{rate.numerator < 0 ? "恢复正放" : "倒放"}</button>}
          </Section>}
          {propertiesTab === "text" ? <TimelineTextList scene={scene} selection={selection}
            inspector={inspector?.scene} disabled={editingDisabled} onSelect={item => {
              seekProgramme(Math.round(item.startFrame)); select([item.id]);
            }} onEdit={(item, section, field, value) => { void command({ ...operationContext, kind: "inspector.edit", item, section, field, value }); }}
              onInvoke={(item, section, collection, row, action) => { void command({ ...operationContext, kind: "inspector.invoke", item, section, collection, row, action }); }}/> : activeTransition !== undefined
          ? <TransitionInspector scene={transitionInspector?.id === activeTransition ? transitionInspector : undefined} disabled={editingDisabled}
            onEdit={(section, field, value) => command({ kind: "transition-inspector.edit", transition: activeTransition,
              section, field, value, expectedProjectRevision: session.status.projectRevision, })}
            onResize={durationFrames => place({ ...operationContext, kind: "transition.resize", transition: activeTransition, durationFrames })}
            onRemove={removeSelection}/>
          : <Inspector scene={inspector?.scene} component={inspector?.component} media={session.media.entries}
          disabled={editingDisabled} selectedProcess={selectedProcess} onSelectProcess={setProcessSelection} onEdit={inspectorEdit}
          onInvoke={(item, section, collection, row, action) => command({
            kind: "inspector.invoke", item, section, collection, row, action,
            expectedProjectRevision: session.status.projectRevision,
          })} onMedia={(item, slot, media) => void perform(async () => {
            await acceptReceipt(await operate(media === ""
              ? { ...operationContext, kind: "component-media.unbind", item, slot }
              : { ...operationContext, kind: "component-media.bind", item, slot, media }));
          })} onProcessEdit={editProcess}/>}</motion.div></AnimatePresence></aside>
      </div>
      {!previewExpanded && <TimelineResizeHandle controls={timelineRegionId} onResize={resizeTimeline}/>}
      <div className="nle-timeline-mount" id={timelineRegionId} ref={timelineRoot}><AnimatePresence mode="popLayout" initial={false}><Timeline key={scene.composition} session={session} frame={frame} playing={playing} reveal={timelineReveal} selection={selection} busy={editingDisabled} gestureBlocked={timelineBlocked} canUndo={canReplay("undo")} canRedo={canReplay("redo")} onSeek={value => seekProgramme(value, false)} onSelect={selectTimeline}
        selectedTransition={activeTransition} onSelectTransition={selectTransition}
        drop={assetDrag.drag?.drop} canFreeze={canFreeze} onFreeze={() => selectedProjectItem && place({
          ...operationContext, kind: "media.freeze", item: selectedProjectItem.id, sampleFrame: frame,
          atFrame: frame, durationFrames: Math.max(1, Math.round(fps * 3)),
        })}
        selectedProcess={selectedProcess} onSelectProcess={setProcessSelection}
        onProcessTiming={edit => commitTimelineGesture({ ...operationContext, ...edit })}
        onMove={intent => commitTimelineGesture({ ...operationContext, kind: "timeline.drop", ...intent })}
        onTrimGesture={(item, edge, atFrame) => commitTimelineGesture({
          ...operationContext, kind: "timeline.trim", item, edge, atFrame,
        })}
        onTrim={(items, edge, atFrame) => {
          if (items.length === 1) editTime(items[0]!, edge, atFrame);
          else if (items.length > 1) transact(items.map(item => ({ kind: "item.trim", id: item.id, edge, at: toTime(atFrame) })));
        }}
        onSplit={split}
        onRemove={removeSelection}
        onTrackEnabled={(track, enabled) => transact([{ kind: "track.update", id: track, enabled }])}
        onTrackLocked={(track, locked) => place({ ...operationContext, kind: "track-lock.set", track, locked })}
        onCompositionCreate={(name, canvas) => void perform(async () => {
          const id = `composition-${crypto.randomUUID()}`;
          const result = await sendCommand({ kind: "project.transact", expectedProjectRevision: session.status.projectRevision,
            commands: [{ kind: "composition.add", composition: { id, name, canvas, tracks: [], transitions: [], mattes: [], groups: [] } }] });
          await openCreatedComposition(id, result);
        })}
        onCompositionEdit={(id, fields) => transact([{ kind: "composition.update", id, ...fields }])}
        onCompositionInsert={source => place({ ...operationContext, kind: "composition.materialize", source, atFrame: frame })}
        onCompositionCopy={source => void perform(async () => {
          const result = await operate({ ...operationContext, kind: "composition.duplicate", source });
          const copy = result.result?.composition;
          if (typeof copy !== "string") throw new Error("未收到时间线副本。");
          await openCreatedComposition(copy, result);
        })}
        onCompositionRoot={id => transact([{ kind: "project.update", rootComposition: id }])}
        onCompositionRemove={id => {
          const commands = [{ kind: "composition.remove", id }] satisfies readonly NleCommand[];
          if (id !== scene.composition) {
            transact(commands);
            return;
          }
          void perform(async () => {
            const result = await operate({ ...operationContext, kind: "composition.select", target: session.project.rootComposition });
            await acceptReceipt(result);
            await acceptReceipt(await sendCommand({ kind: "project.transact",
              expectedProjectRevision: result.status.projectRevision, commands }));
            selectItems([]); setFrame(0);
          });
        }}
        onRippleRemove={items => void perform(async () => {
          if (items.length === 0) return;
          await acceptReceipt(await operate({ ...operationContext, kind: "timeline.ripple-remove",
            items: items.map(item => item.id), tracks: [...new Set(items.map(item => item.track))] }));
          selectItems([]);
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
          transact(commands);
        }}
        onCloseGap={(track, atFrames) => void perform(async () => {
          for (const atFrame of atFrames) {
            const status = sessionRef.current!.status;
            await acceptReceipt(await operate({ ...operationContext, kind: "timeline.close-gap", tracks: [track], atFrame,
              expectedProjectRevision: status.projectRevision }));
          }
        })}
        onCompoundUnique={item => void perform(async () => {
          const source = scene.tracks.flatMap(track => track.items).find(entry => entry.id === item)?.nestedComposition;
          if (source === undefined) return;
          const created = await operate({ ...operationContext, kind: "composition.materialize", source, atFrame: frame });
          const copy = created.result?.item;
          await acceptReceipt(created, typeof copy === "string" ? copy : undefined);
          if (typeof copy === "string") await acceptReceipt(await operate({ ...operationContext, kind: "composition.make-unique", item: copy,
            expectedProjectRevision: created.status.projectRevision }));
        })}
        onCompoundExplode={item => place({ ...operationContext, kind: "composition.explode", item })}
        onTrackMove={(track, before) => place({ ...operationContext, kind: "timeline.track-reorder", track, ...(before === undefined ? {} : { before }) })}
        onComposition={target => navigate({ ...operationContext, kind: "composition.select", target })}
        onEnterComposition={item => navigate({ ...operationContext, kind: "composition.enter", item, atFrame: frame })}
        onReturnComposition={() => navigate({ ...operationContext, kind: "composition.return" })}
        onCompound={() => place({ ...operationContext, kind: "composition.compound", items: selection, name: "复合片段" })}
        canToggleGroup={canToggleGroup} groupLabel={groupLabel} onToggleGroup={toggleGroup}
        canDetachAudio={canDetachAudio} onDetachAudio={() => {
          if (!canDetachAudio || selectedProjectItem === undefined) return;
          place({ ...operationContext, kind: "audio.detach", item: selectedProjectItem.id });
        }}
        onUndo={() => replay("undo")}
        onRedo={() => replay("redo")}/></AnimatePresence></div>
      </div>
      <AnimatePresence>{assetDrag.drag !== undefined && <motion.div {...fadeMotion(reduced)} className="nle-floating-preview" style={{ position: "fixed", left: assetDrag.drag.x + 12, top: assetDrag.drag.y + 12, pointerEvents: "none" }}>
        <MediaThumbnail entry={assetDrag.drag.entry}/><span>{assetDrag.drag.entry.name}</span>
      </motion.div>}</AnimatePresence>
    </div></div>;
}
