import { useEffect, useRef, useState } from "react";
import { Film, RefreshCw } from "lucide-react";
import type { CanvasSelection, MediaReference } from "@hypit/canvas";
import type { CanvasTimelineTarget } from "../protocol.js";
import { adopt, notify, timelineRequest } from "./session.js";
import { Dialog, Picker, t } from "./ui.js";

export type PlacementSource = {
  readonly name: string;
  readonly picture: boolean;
  readonly audio: boolean;
} & ({ readonly media: MediaReference } | { readonly node: string; readonly selection: CanvasSelection });

export function publicationPlacement(name: string, node: string, selection: CanvasSelection, mediaType?: string): PlacementSource | undefined {
  if (!selection.resource || !mediaType || !/^(image|video|audio)\//u.test(mediaType)) return undefined;
  return { name, node, selection, picture: !mediaType.startsWith("audio/"), audio: !mediaType.startsWith("image/") };
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function PlaceMediaDialog({ source, close }: { source: PlacementSource; close: () => void }) {
  const [paths, setPaths] = useState<readonly string[]>();
  const [documentPath, setDocumentPath] = useState("");
  const [viewPath, setViewPath] = useState("");
  const [target, setTarget] = useState<CanvasTimelineTarget>();
  const [track, setTrack] = useState("");
  const [frame, setFrame] = useState("0");
  const [duration, setDuration] = useState("");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [insert, setInsert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savePending, setSavePending] = useState(false);
  const runtime = useRef<{ target?: string; request?: string; media?: MediaReference }>(
    "media" in source ? { media: source.media } : {},
  );
  const active = useRef(true);
  const invalidate = () => { delete runtime.current.request; };

  useEffect(() => {
    active.current = true;
    void timelineRequest({ kind: "documents" }).then(result => {
      if (!active.current || result.kind !== "documents") return;
      setPaths(result.paths);
      if (result.paths.length === 1) setDocumentPath(result.paths[0]!);
    }).catch(failure => { if (active.current) { setPaths([]); setError(message(failure)); } });
    return () => {
      active.current = false;
      const opened = runtime.current.target;
      if (opened) void timelineRequest({ kind: "close", target: opened }).catch(() => {});
    };
  }, []);

  function load(next: CanvasTimelineTarget, keepFrame = false) {
    runtime.current.target = next.target;
    invalidate();
    setTarget(next);
    setTrack("");
    setInsert(false);
    if (!keepFrame) setFrame(String(next.endFrame));
  }

  async function open(keepFrame = false) {
    setBusy(true); setError("");
    try {
      const result = await timelineRequest({ kind: "open", document: documentPath.trim(), ...(viewPath.trim() ? { view: viewPath.trim() } : {}) });
      if (result.kind !== "target") throw new Error(t("Could not open the timeline.", "无法打开时间线。"));
      if (!active.current) { await timelineRequest({ kind: "close", target: result.value.target }); return; }
      if (keepFrame && target && result.value.composition !== target.composition && result.value.compositions.some(item => item.id === target.composition)) {
        runtime.current.target = result.value.target;
        const selected = await timelineRequest({ kind: "select", target: result.value.target, composition: target.composition });
        if (selected.kind === "target") { load(selected.value, true); return; }
      }
      load(result.value, keepFrame);
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  async function chooseComposition(composition: string) {
    if (!target || target.composition === composition) return;
    setBusy(true); setError("");
    try {
      const result = await timelineRequest({ kind: "select", target: target.target, composition });
      if (result.kind === "target") load(result.value);
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  async function place() {
    if (!target) return;
    setBusy(true); setError("");
    try {
      let media = runtime.current.media;
      if (media === undefined && "selection" in source) {
        media = await adopt({ node: source.node, selection: source.selection, target: { kind: "media" } });
        runtime.current.media = media;
      }
      if (!media) throw new Error(t("Media is unavailable.", "素材不可用。"));
      const request = runtime.current.request ??= crypto.randomUUID();
      const current = await timelineRequest({
        kind: "place", target: target.target, request, composition: target.composition,
        expectedProjectRevision: target.projectRevision, expectedViewRevision: target.viewRevision,
        media, atFrame: Number(frame),
        ...(duration === "" ? {} : { durationFrames: Number(duration) }),
        ...(track ? { track, ...(insert ? { insert: true } : {}) } : {}),
        ...(!includeAudio ? { includeAudio: false } : {}),
      });
      if (current.kind !== "placed") throw new Error(t("The timeline did not return a placement.", "时间线未返回放置结果。"));
      if (current.saveIssue !== undefined) {
        setSavePending(true);
        setError(t("The clip was placed. Saving is pending.", "片段已加入，仍需保存。") + " " + current.saveIssue);
        return;
      }
      const name = target.compositions.find(item => item.id === current.composition)?.name ?? target.name;
      notify(t("Added to editing", "已加入剪辑") + " / " + name);
      close();
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  const tracks = target?.tracks.filter(item => item.kind === "picture" ? source.picture : source.audio && includeAudio) ?? [];
  const shownDocument = target?.document;
  const canEdit = !busy && !savePending;
  const fps = target && target.editRate.numerator / target.editRate.denominator;
  const trackOptions = [{ value: "", label: t("Automatic track", "自动选择轨道") },
    ...tracks.map(item => ({ value: item.id, label: item.name }))];
  const validFrame = frame.trim() && Number.isSafeInteger(Number(frame)) && Number(frame) >= 0;
  const validDuration = duration === "" || Number.isSafeInteger(Number(duration)) && Number(duration) > 0;
  return <Dialog title={t("Add to editing", "加入剪辑")} close={() => { if (!busy) close(); }}>
    <form className="canvas-dialog-form" onSubmit={event => { event.preventDefault(); if (target) void place(); else void open(); }}>
      <strong>{source.name}</strong>
      <label>{t("Editing document", "剪辑工程")}
        {paths && paths.length > 0 && <Picker label={t("Editing document", "剪辑工程")} value={paths.includes(documentPath) ? documentPath : ""}
          disabled={!canEdit} options={[{ value: "", label: t("Choose an editing document", "选择剪辑工程") }, ...paths.map(path => ({ value: path, label: path }))]}
          onChange={path => { setDocumentPath(path); setViewPath(""); setTarget(undefined); setError(""); }}/>}
        <input aria-label={t("Editing document path", "剪辑工程路径")} placeholder="edits/main.svml" value={documentPath} disabled={!canEdit}
          onChange={event => { setDocumentPath(event.target.value); setTarget(undefined); }}/>
      </label>
      <details>
        <summary>{t("View settings", "视图设置")}</summary>
        <label>{t("View document path", "视图文件路径")}<input aria-label={t("View document path", "视图文件路径")}
          disabled={!canEdit} value={viewPath} placeholder={t("Matching project view", "同名剪辑视图")}
          onChange={event => { setViewPath(event.target.value); setTarget(undefined); }}/></label>
      </details>
      {target && <section className="canvas-timeline-fields" aria-label={shownDocument}>
        <label>{t("Composition", "作品")}<Picker label={t("Composition", "作品")} value={target.composition}
          disabled={!canEdit} options={target.compositions.map(item => ({ value: item.id, label: item.name }))}
          onChange={value => void chooseComposition(value)}/></label>
        <label>{t("Track", "轨道")}<Picker label={t("Track", "轨道")} value={track} options={trackOptions} disabled={!canEdit}
          onChange={value => { setTrack(value); setInsert(false); invalidate(); }}/></label>
        <div className="canvas-coordinates">
          <label>{t("Start frame", "起始帧")}<input type="number" min={0} step={1} value={frame} disabled={!canEdit}
            onChange={event => { setFrame(event.target.value); invalidate(); }}/></label>
          <label>{t("Duration (frames)", "持续帧数")}<input type="number" min={1} step={1} value={duration} disabled={!canEdit}
            placeholder={t("Automatic", "自动")} onChange={event => { setDuration(event.target.value); invalidate(); }}/></label>
        </div>
        <div className="canvas-timeline-time">
          <small>{fps?.toLocaleString(undefined, { maximumFractionDigits: 3 })} fps</small>
          <button type="button" className="button" disabled={!canEdit} onClick={() => { setFrame(String(target.endFrame)); invalidate(); }}>
            {t("Place at end", "放到结尾")}
          </button>
        </div>
        {source.picture && source.audio && <label className="canvas-inline-checkbox">
          <input type="checkbox" checked={includeAudio} disabled={!canEdit} onChange={event => {
            setIncludeAudio(event.target.checked);
            if (!event.target.checked && target.tracks.some(item => item.id === track && item.kind === "audio")) setTrack("");
            invalidate();
          }}/>
          {t("Include source audio when available", "保留源素材音频")}
        </label>}
        {track && <label className="canvas-inline-checkbox">
          <input type="checkbox" checked={insert} disabled={!canEdit} onChange={event => { setInsert(event.target.checked); invalidate(); }}/>
          {t("Insert and move later clips", "插入并后移后续片段")}
        </label>}
      </section>}
      {error && <p role="alert" className="canvas-error-text">{error}</p>}
      <div className="canvas-dialog-actions">
        {target && error && !savePending && <button type="button" className="button" disabled={busy} onClick={() => void open(true)}>
          <RefreshCw size={14}/>{t("Reload timeline", "重载时间线")}
        </button>}
        <button type="submit" className="button primary" disabled={busy || (target ? !validFrame || !validDuration : !documentPath.trim())}>
          {target && <Film size={15}/>}
          {busy ? t("Working…", "处理中…") : savePending ? t("Retry save", "重新保存") : target ? t("Add to editing", "加入剪辑") : t("Open timeline", "打开时间线")}
        </button>
      </div>
    </form>
  </Dialog>;
}
