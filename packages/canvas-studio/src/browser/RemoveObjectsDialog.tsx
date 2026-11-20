import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { CanvasBinding, CanvasCommand, CanvasDocument, CanvasSource } from "@hypit/canvas";
import { fieldLabel } from "./presentation.js";
import { commit } from "./session.js";
import { Dialog, Picker, t } from "./ui.js";
import { inputCommand, nodeTitle, outputsFor, supplies, values, wires, type Catalog, type Wire } from "./wiring.js";

const portKey = (source: CanvasSource) => JSON.stringify([source.node, source.output]);

function dependsOn(links: readonly Wire[], node: string, target: string) {
  const seen = new Set([node]), queue = [node];
  for (const next of queue) {
    if (next === target) return true;
    for (const link of links) {
      if (link.target === next && !seen.has(link.source.node)) {
        seen.add(link.source.node);
        queue.push(link.source.node);
      }
    }
  }
  return false;
}

function replaceInputs(board: CanvasDocument, affected: readonly Wire[], choices: ReadonlyMap<string, CanvasSource>) {
  const nodes = new Map(board.nodes.map(node => [node.id, node]));
  const updated = new Map<string, { node: string; input: string; binding: CanvasBinding }>();
  for (const link of affected) {
    const node = nodes.get(link.target);
    if (!node || !("capability" in node)) continue;
    const key = JSON.stringify([node.id, link.input]);
    const old = updated.get(key)?.binding ?? node.inputs[link.input];
    const replacement = choices.get(portKey(link.source));
    if (!old || !replacement) continue;
    const sourceNode = nodes.get(link.source.node), replacementNode = nodes.get(replacement.node);
    const sameMedia = sourceNode && "media" in sourceNode && replacementNode && "media" in replacementNode
      && sourceNode.media.path === replacementNode.media.path;
    const next = values(old).map((value, index) => index !== link.index ? value : {
      from: replacement,
      ...(sameMedia && "from" in value && value.personReference !== undefined ? { personReference: value.personReference } : {}),
    });
    updated.set(key, { node: node.id, input: link.input, binding: "items" in old ? { items: next } : next[0]! });
  }
  return [...updated.values()].map(({ node, input, binding }) => inputCommand(node, input, binding));
}

export function RemoveObjectsDialog({ ids, board, catalog, revision, busy, close, onRemoved }: {
  ids: string[]; board: CanvasDocument; catalog: Catalog; revision: string; busy: boolean; close: () => void; onRemoved: () => void;
}) {
  const [chosen, setChosen] = useState<Readonly<Record<string, string>>>({});
  const removing = new Set(ids);
  const nodes = new Map(board.nodes.map(node => [node.id, node]));
  const allLinks = wires(board);
  const liveLinks = allLinks.filter(link => !removing.has(link.target));
  const affected = liveLinks.filter(link => removing.has(link.source.node));
  const kept = liveLinks.filter(link => !removing.has(link.source.node));
  const groups = new Map<string, Wire[]>();
  for (const link of affected) {
    const key = portKey(link.source), group = groups.get(key) ?? [];
    group.push(link); groups.set(key, group);
  }
  const rows = [...groups].map(([key, links]) => {
    const source = links[0]!.source;
    const choices = board.nodes.flatMap(node => removing.has(node.id) ? [] : outputsFor(node, catalog).flatMap(output =>
      links.every(link => {
        const target = nodes.get(link.target);
        const field = target && "capability" in target && catalog.models.find(model => model.id === target.capability)?.fields.find(field => field.name === link.input);
        return field && supplies(node, output, field, catalog) && !dependsOn(kept, node.id, link.target);
      }) ? [{ source: { node: node.id, output }, value: portKey({ node: node.id, output }),
        label: nodeTitle(node, catalog.models) + " / " + fieldLabel(output) }] : []));
    return { key, source, links, choices };
  });
  const replacements = new Map(rows.flatMap(row => {
    const picked = row.choices.find(choice => choice.value === chosen[row.key]);
    return picked ? [[row.key, picked.source] as const] : [];
  }));
  const rewritten = affected.flatMap(link => {
    const source = replacements.get(portKey(link.source));
    return source ? [{ ...link, source }] : [];
  });
  const cyclic = rewritten.some(link => dependsOn([...kept, ...rewritten], link.source.node, link.target));
  const ready = rows.length > 0 && replacements.size === rows.length && !cyclic;
  const remove: CanvasCommand[] = ids.filter(id => nodes.has(id)).map(node => ({ kind: "node.remove", node }));

  return <Dialog title={t("Delete objects", "删除对象")} close={close}>
    <div className="canvas-dialog-form">
      <ul>{ids.flatMap(id => { const node = nodes.get(id); return node ? [<li key={id}>{nodeTitle(node, catalog.models)}</li>] : []; })}</ul>
      {rows.map(row => <section className="canvas-replacement" key={row.key}>
        <strong>{nodeTitle(nodes.get(row.source.node)!, catalog.models)} / {fieldLabel(row.source.output)}</strong>
        <ul>{row.links.map(link => <li key={JSON.stringify([link.target, link.input, link.index])}>
          {nodeTitle(nodes.get(link.target)!, catalog.models)} / {fieldLabel(link.input)}
        </li>)}</ul>
        <Picker label={t("Replace reference", "替换引用") + " / " + fieldLabel(row.source.output)}
          value={chosen[row.key] ?? ""} disabled={busy || !row.choices.length}
          options={[{ value: "", label: row.choices.length ? t("Choose replacement", "选择替换来源") : t("No compatible source", "无兼容来源") }, ...row.choices]}
          onChange={value => setChosen(current => ({ ...current, [row.key]: value }))}/>
      </section>)}
      {cyclic && <p role="alert" className="canvas-error-text">{t("These replacements create a circular reference.", "这些替换会形成循环引用。")}</p>}
      <div className="canvas-dialog-actions">
        <button type="button" className="button danger" disabled={busy || !remove.length} onClick={() => void commit(remove, revision).then(onRemoved).catch(() => {})}>
          <Trash2 size={15}/>{affected.length ? t("Delete and disconnect", "删除并断开引用") : t("Delete", "删除")}
        </button>
        {rows.length > 0 && <>
          <button type="button" className="button" disabled={busy || !ready}
            onClick={() => void commit(replaceInputs(board, affected, replacements), revision).then(() => setChosen({})).catch(() => {})}>
            {t("Replace references", "替换引用")}
          </button>
          <button type="button" className="button primary" disabled={busy || !ready}
            onClick={() => void commit([...replaceInputs(board, affected, replacements), ...remove], revision).then(onRemoved).catch(() => {})}>
            {t("Replace and delete", "替换引用并删除")}
          </button>
        </>}
      </div>
    </div>
  </Dialog>;
}
