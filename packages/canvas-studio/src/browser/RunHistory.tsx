import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Download, Film, Image, Plus, RefreshCw, Unlink } from "lucide-react";
import type { CanvasCommand, CanvasDocument, CanvasSelection } from "@hypit/canvas";
import type { InvocationAddress } from "@hypit/execution";
import type { CanvasModel } from "../protocol.js";
import { fieldLabel, MediaPreview, usePreview } from "./presentation.js";
import { adopt, cancel, commit, invoke, notify, observe, preview, report, selectionIs, type History, type Recipe } from "./session.js";
import { publicationPlacement, type PlacementSource } from "./PlaceMediaDialog.js";
import { Dialog, IconButton, t } from "./ui.js";

export type RunEntries = History["entries"];
const activePhases = new Set(["received", "queued", "submitting", "running", "collecting"]);
const runKey = (address: InvocationAddress) => address.environment + "/" + address.invocation;

export function useRunEntries(board: CanvasDocument, revision: string, selected?: string) {
  const [entries, setEntries] = useState<Readonly<Record<string, RunEntries>>>({});
  const [poll, setPoll] = useState(0);
  const refresh = useCallback(() => setPoll(value => value + 1), []);
  const attached = Object.keys(board.results).filter(id => board.results[id]?.invocations.length);
  const ids = JSON.stringify([...new Set(selected ? [...attached, selected] : attached)].filter(id =>
    board.nodes.some(node => node.id === id && "capability" in node)));
  useEffect(() => {
    const nodes = JSON.parse(ids) as string[];
    if (!nodes.length) { setEntries({}); return; }
    let active = true, timer: number | undefined;
    const read = async () => {
      const values = await Promise.all(nodes.map(async id => {
        try {
          const value = await observe({ kind: "history", node: id });
          return [id, value.kind === "history" ? value.entries : []] as const;
        } catch { return [id, []] as const; }
      }));
      if (!active) return;
      setEntries(Object.fromEntries(values));
      timer = window.setTimeout(read, document.visibilityState === "visible" ? 3000 : 12000);
    };
    void read();
    return () => { active = false; clearTimeout(timer); };
  }, [ids, revision, poll]);
  return { entries, refresh };
}

type Entry = {
  name: string;
  mediaType?: string;
  selection: CanvasSelection;
  output?: string | undefined;
};

function displayEntry(node: Recipe, model: CanvasModel | undefined, entries: RunEntries) {
  return entries.toReversed().map(run => {
    const outputs: Entry[] = !("publication" in run) ? [] : Object.entries(run.publication?.outputs ?? {}).flatMap(([output, value]) => {
      const target = Object.entries(model?.outputs ?? {}).filter(([, expected]) => expected.type === value.type);
      const port = target.find(([name]) => name === output) ?? (target.length === 1 ? target[0] : undefined);
      const resources: Entry[] = Object.entries(value.resources).map(([resource, info]) => ({
        name: resource, mediaType: info.mediaType, selection: { address: run.address, output, resource },
        output: port?.[1].media && info.mediaType.startsWith(port[1].media + "/") ? port[0] : undefined,
      }));
      return !resources.length || port?.[1].media === undefined && port !== undefined
        ? [{ name: output, selection: { address: run.address, output }, output: port?.[0] }, ...resources] : resources;
    });
    return { run, outputs, key: node.id + "/" + runKey(run.address) };
  });
}

function CandidatePreview({ node, entry, thumbnail = false }: { node: string; entry: Entry; thumbnail?: boolean }) {
  const { resource, error } = usePreview(node, entry.selection, Boolean(entry.selection.resource));
  return resource ? <MediaPreview resource={resource} title={entry.name} controls={!thumbnail} className="graph-candidate-preview"/>
    : <span className="candidate-media-fallback">{error || (entry.mediaType?.startsWith("video/") ? <Film size={20}/> : <Image size={20}/>)}</span>;
}

export function RunHistory({ node, model, document: board, entries, revision, busy, refresh, onPlace }: {
  node: Recipe; model?: CanvasModel | undefined; document: CanvasDocument; entries: RunEntries;
  revision: string; busy: boolean; refresh: () => void; onPlace: (source: PlacementSource) => void;
}) {
  const [viewer, setViewer] = useState<string>();
  const [attach, setAttach] = useState(false);
  const [adoption, setAdoption] = useState<Entry>();
  const results = board.results[node.id];
  const runs = displayEntry(node, model, entries);
  const outputs = runs.flatMap(item => item.outputs);
  const playable = (entry: Entry) => publicationPlacement(entry.name, node.id, entry.selection, entry.mediaType) !== undefined;
  const candidates = outputs.filter(playable);
  const unavailableChoices = Object.entries(results?.selected ?? {}).filter(([output, selection]) =>
    !outputs.some(entry => entry.output === output && selectionIs(selection, entry.selection)));
  const itemKey = (entry: Entry) => JSON.stringify(entry.selection);
  const viewerIndex = candidates.findIndex(entry => itemKey(entry) === viewer);
  const viewed = candidates[viewerIndex];
  const choose = (entry: Entry) => {
    if (!entry.output) return;
    const command: CanvasCommand = selectionIs(results?.selected[entry.output], entry.selection)
      ? { kind: "result.clear", node: node.id, output: entry.output }
      : { kind: "result.select", node: node.id, output: entry.output, selection: entry.selection };
    void commit([command], revision).catch(() => {});
  };
  async function download(entry: Entry) {
    try {
      const { url, mediaType } = await preview({ node: node.id, selection: entry.selection });
      const extension = ({ "image/jpeg": "jpg", "image/svg+xml": "svg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "video/quicktime": "mov" } as Record<string, string>)[mediaType]
        ?? mediaType.split("/").at(-1)?.split("+")[0] ?? "bin";
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = entry.name.endsWith("." + extension) ? entry.name : entry.name + "." + extension;
      anchor.click();
    } catch (error) { report(error); }
  }
  const actionButtons = (entry: Entry) => {
    const source = publicationPlacement(entry.name, node.id, entry.selection, entry.mediaType);
    return <div className="canvas-run-actions">
      {entry.output && <button type="button" className="button" disabled={busy} onClick={() => choose(entry)}>
        <Check size={14}/>{selectionIs(results?.selected[entry.output], entry.selection) ? t("Clear choice", "取消选用") : t("Use output", "选用结果")}
      </button>}
      {source && <>
        <button type="button" className="button" onClick={() => void download(entry)}><Download size={14}/>{t("Export asset", "导出素材")}</button>
        <button type="button" className="button" disabled={busy} onClick={() => setAdoption(entry)}>{t("Add to Project Media", "加入项目素材")}</button>
        <button type="button" className="button" disabled={busy} onClick={() => { setViewer(undefined); onPlace(source); }}>
          <Film size={14}/>{t("Add to editing", "加入剪辑")}
        </button>
      </>}
    </div>;
  };
  return <section className="graph-candidates canvas-run-history">
    <div className="candidate-gallery-heading"><strong>{t("Generation history", "生成记录")}</strong>
      <IconButton label={t("Refresh history", "刷新记录")} onClick={refresh}><RefreshCw size={14}/></IconButton>
      <IconButton label={t("Attach invocation", "附上任务")} disabled={busy} onClick={() => setAttach(true)}><Plus size={15}/></IconButton>
    </div>
    {unavailableChoices.map(([output, selection]) => <div className="canvas-result-choice" key={output}>
      <span>{fieldLabel(output)} / {selection.resource ?? fieldLabel(selection.output)}<small>{t("Selected result unavailable", "已选结果不可用")}</small></span>
      <button type="button" className="button" disabled={busy}
        onClick={() => void commit([{ kind: "result.clear", node: node.id, output }], revision).catch(() => {})}>
        {t("Clear choice", "取消选用")}
      </button>
    </div>)}
    {runs.length === 0 && <p className="candidate-empty">{t("Results appear here after you generate.", "生成结果会显示在这里。")}</p>}
    {runs.map(({ run, outputs, key }) => {
      const issue = "issue" in run ? run.issue : run.observation?.failure?.message;
      return <article className="canvas-run" key={key}>
        <header><strong>{fieldLabel(run.phase)}</strong><small title={runKey(run.address)}>{run.address.invocation.slice(0, 8)}</small>
          {activePhases.has(run.phase) && <button type="button" className="button" onClick={() => void cancel(node.id, run.address).then(refresh).catch(report)}>{t("Cancel run", "取消生成")}</button>}
          {run.phase === "unconfirmed" && <button type="button" className="button" disabled={busy} onClick={() => void invoke({
            node: node.id, environment: run.address.environment, invocation: run.address.invocation,
          }).then(receipt => { notify(fieldLabel(receipt.admission), receipt.admission !== "accepted"); refresh(); }).catch(() => {})}>{t("Reconnect", "重新连接")}</button>}
          <IconButton label={t("Detach invocation", "解除任务关联")} disabled={busy} onClick={() => void commit(
            [{ kind: "result.detach", node: node.id, address: run.address }], revision).then(refresh).catch(() => {})}><Unlink size={14}/></IconButton>
        </header>
        {issue && <p className="canvas-error-text">{issue}</p>}
        {"observation" in run && run.observation?.progress && <p>{run.observation.progress}</p>}
        <div className="candidate-grid">{outputs.map(entry => {
          const selected = entry.output !== undefined && selectionIs(results?.selected[entry.output], entry.selection);
          return <div key={itemKey(entry)} className="canvas-candidate">
            {playable(entry) ? <button type="button" className="candidate-tile" aria-label={entry.name} onClick={() => setViewer(itemKey(entry))}>
              <span className="candidate-tile-media"><CandidatePreview node={node.id} entry={entry} thumbnail/></span>
              {selected && <span className="candidate-selected"><Check size={12}/>{t("In use", "已选用")}</span>}<span className="candidate-resource-name">{entry.name}</span>
            </button> : <strong>{entry.name}</strong>}
            {actionButtons(entry)}
          </div>;
        })}</div>
      </article>;
    })}
    {viewed && <Dialog title={viewed.name} close={() => setViewer(undefined)} wide>
      <div className="candidate-stage">
        <IconButton label={t("Previous result", "上一个结果")} disabled={viewerIndex <= 0} onClick={() => setViewer(itemKey(candidates[viewerIndex - 1]!))}><ArrowLeft size={18}/></IconButton>
        <div className="candidate-stage-media"><CandidatePreview key={viewer} node={node.id} entry={viewed}/></div>
        <IconButton label={t("Next result", "下一个结果")} disabled={viewerIndex >= candidates.length - 1} onClick={() => setViewer(itemKey(candidates[viewerIndex + 1]!))}><ArrowRight size={18}/></IconButton>
      </div>
      <div className="candidate-filmstrip">{candidates.map(entry => <button type="button" key={itemKey(entry)} aria-label={entry.name}
        aria-pressed={itemKey(entry) === viewer} onClick={() => setViewer(itemKey(entry))}>
        <CandidatePreview node={node.id} entry={entry} thumbnail/>
      </button>)}</div>
      <div className="candidate-viewer-footer">{actionButtons(viewed)}</div>
    </Dialog>}
    {attach && <Dialog title={t("Attach invocation", "附上任务")} close={() => setAttach(false)}>
      <form className="canvas-dialog-form" onSubmit={event => {
        event.preventDefault(); const fields = new FormData(event.currentTarget);
        const address = { environment: String(fields.get("environment")).trim(), invocation: String(fields.get("invocation")).trim() };
        void commit([{ kind: "result.attach", node: node.id, address }], revision).then(() => { setAttach(false); refresh(); }).catch(() => {});
      }}>
        <label>{t("Environment ID", "执行环境 ID")}<input name="environment" required autoFocus/></label>
        <label>{t("Invocation ID", "任务 ID")}<input name="invocation" required/></label>
        <button type="submit" className="button primary" disabled={busy}>{t("Attach", "附上")}</button>
      </form>
    </Dialog>}
    {adoption && <Dialog title={t("Add to Project Media", "加入项目素材")} close={() => setAdoption(undefined)}>
      <form className="canvas-dialog-form" onSubmit={event => {
        event.preventDefault();
        const path = String(new FormData(event.currentTarget).get("asset")).trim();
        void adopt({ node: node.id, selection: adoption.selection, target: { kind: "media", ...(path ? { path } : {}) } })
          .then(() => setAdoption(undefined)).catch(report);
      }}>
        <label>{t("Project media path", "项目素材路径")}<input name="asset" placeholder={t("Automatic", "自动选择")}/></label>
        <button type="submit" className="button primary">{t("Add", "加入")}</button>
      </form>
    </Dialog>}
  </section>;
}
