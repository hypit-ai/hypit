import { useEffect, useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, GitBranch, GripVertical, History, MousePointer2, Plus, Settings2, Unlink, X } from "lucide-react";
import type { CanvasBinding, CanvasCommand, CanvasDocument, CanvasNode, CanvasValue } from "@hypit/canvas";
import type { JsonValue } from "@hypit/execution";
import type { CanvasModel, CanvasQuoteReceipt } from "../protocol.js";
import { NodePanel } from "./NodePanel.js";
import { GenerationSettings } from "./GenerationSettings.js";
import type { PlacementSource } from "./PlaceMediaDialog.js";
import { RunHistory, type RunEntries } from "./RunHistory.js";
import { expandMotion, popupMotion } from "./motion.js";
import { cardIcon, fieldLabel, mediaName, MediaPreview, MediaThumbnail, usePreview } from "./presentation.js";
import { commit, invoke, notify, observe, quote, report, type Recipe } from "./session.js";
import { Dialog, DraftField, IconButton, Picker, t, zh } from "./ui.js";
import { activeFields, disconnect, inputCommand, nodeSize, nodeTitle, outputsFor, resourceField, supplies, values, type Catalog, type Wire } from "./wiring.js";

type Field = CanvasModel["fields"][number];
export type PickTarget = { node: string; field: string; index?: number };

export function bindingCommand(node: Recipe, field: Field, value: CanvasValue, index?: number) {
  if (field.kind !== "resources") return inputCommand(node.id, field.name, value);
  const next = [...values(node.inputs[field.name])];
  next[index ?? next.length] = value;
  return inputCommand(node.id, field.name, { items: next });
}

export function referenceOptions(board: CanvasDocument, catalog: Catalog, target: string, field: Field) {
  const nodes = board.nodes.filter(node => node.id !== target).flatMap(node => outputsFor(node, catalog)
    .filter(output => supplies(node, output, field, catalog))
    .map(output => ({ value: { from: { node: node.id, output } } as CanvasValue, label: nodeTitle(node, catalog.models), detail: fieldLabel(output) })));
  const assets = resourceField(field) ? catalog.media.entries.flatMap(asset =>
    asset.state === "available" && (field.media === undefined || asset.mediaType.startsWith(field.media + "/"))
      ? [{ value: { media: asset.reference } as CanvasValue, label: mediaName(asset.reference.path), detail: t("Project Media", "项目素材") }] : []) : [];
  return [...nodes, ...assets];
}

function BindingTile({ source, label, board }: { source: CanvasValue; label: string; board: CanvasDocument }) {
  const origin = "from" in source ? board.nodes.find(candidate => candidate.id === source.from.node) : undefined;
  const selection = "from" in source ? board.results[source.from.node]?.selected[source.from.output] : undefined;
  const { resource } = usePreview(origin?.id ?? "", selection, !!origin && ("media" in origin || selection !== undefined));
  if ("media" in source) return <MediaThumbnail path={source.media.path} title={label}/>;
  return <span className="reference-thumbnail" aria-label={label}>{resource && !resource.mediaType.startsWith("audio/") ?
    <MediaPreview resource={resource} title={label}/> : <GitBranch size={16}/>}</span>;
}

function ReferencePicker({ title, options, choose, pick }: {
  title: string; options: ReturnType<typeof referenceOptions>; choose: (value: CanvasValue) => void; pick: () => void;
}) {
  const [query, setQuery] = useState("");
  return <Menu.Root modal={false} onOpenChange={next => { if (!next) setQuery(""); }}>
    <Menu.Trigger className="generation-reference-add" aria-label={title} title={title}><Plus size={20}/></Menu.Trigger>
    <Menu.Portal><Menu.Positioner className="reference-positioner" sideOffset={6} collisionPadding={12}>
      <Menu.Popup className="reference-picker">
        <div className="reference-picker-title">{title}</div>
        <label className="reference-search"><input value={query} onChange={event => setQuery(event.target.value)}
          onKeyDown={event => event.stopPropagation()} placeholder={t("Search references", "搜索参考素材")} aria-label={t("Search references", "搜索参考素材")}/></label>
        <Menu.Item className="reference-canvas-action" onClick={pick}><MousePointer2 size={15}/>{t("Pick on canvas", "在画布上选取")}</Menu.Item>
        <div className="reference-choice-list">{options.filter(option => `${option.label} ${option.detail}`.toLowerCase().includes(query.toLowerCase())).map(option =>
          <Menu.Item className="reference-choice" key={JSON.stringify(option.value)} onClick={() => choose(option.value)}>
            <span><strong>{option.label}</strong><small>{option.detail}</small></span>
          </Menu.Item>)}</div>
      </Menu.Popup>
    </Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

function References({ node, fields, board, catalog, revision, locate, pick }: {
  node: Recipe; fields: readonly Field[]; board: CanvasDocument; catalog: Catalog; revision: string;
  locate: (id: string) => void; pick: (target: PickTarget) => void;
}) {
  return <div className="generation-reference-groups">{fields.map(field => {
    const refs = values(node.inputs[field.name]);
    const list = field.kind === "resources";
    const options = referenceOptions(board, catalog, node.id, field);
    const label = fieldLabel(field.name);
    const write = (items: readonly CanvasValue[]) => void commit([inputCommand(node.id, field.name,
      items.length === 0 ? undefined : list ? { items } : items[0])], revision).catch(() => {});
    const reorder = (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= refs.length || to >= refs.length) return;
      const next = [...refs]; const [source] = next.splice(from, 1); next.splice(to, 0, source!); write(next);
    };
    return <div className="canvas-reference-group" key={field.name}>
      <span className="canvas-label">{label}</span>
      <div className="generation-reference-strip">
        {refs.map((value, index) => {
          const sourceId = "from" in value ? value.from.node : undefined;
          const source = board.nodes.find(item => item.id === sourceId);
          const name = source ? nodeTitle(source, catalog.models) : "media" in value ? mediaName(value.media.path) : label;
          return <div className="generation-reference-card" key={`${name}-${index}`}
            onDragOver={event => { if (event.dataTransfer.types.includes("application/x-hypit-reference-index")) event.preventDefault(); }}
            onDrop={event => {
              const raw = event.dataTransfer.getData("application/x-hypit-reference-index");
              if (!raw) return;
              event.stopPropagation(); event.preventDefault();
              const item = JSON.parse(raw) as { field: string; index: number };
              if (item.field === field.name) reorder(item.index, index);
            }}>
            <button type="button" className="generation-reference-tile" aria-label={name} onClick={() => { if (sourceId) locate(sourceId); }}>
              <BindingTile source={value} label={name} board={board}/>
              <span className="generation-reference-name">{name}</span>
            </button>
            {list && <button type="button" draggable className="generation-reference-order" title={t("Drag to reorder", "拖动排序")}
              onDragStart={event => event.dataTransfer.setData("application/x-hypit-reference-index", JSON.stringify({ field: field.name, index }))}
              onKeyDown={event => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault(); reorder(index, index + (event.key === "ArrowLeft" ? -1 : 1));
              }}><GripVertical size={12}/>{index + 1}</button>}
            <IconButton className="generation-reference-remove" label={t("Remove reference", "移除参考素材")} onClick={() => write(refs.filter((_, i) => i !== index))}><X size={12}/></IconButton>
          </div>;
        })}
        {(refs.length === 0 || list && refs.length < (field.maxItems ?? Infinity)) && <ReferencePicker title={label} options={options}
          choose={value => void commit([bindingCommand(node, field, value)], revision).catch(() => {})} pick={() => pick({ node: node.id, field: field.name })}/>}
      </div>
      {field.personReference && refs.map((value, index) => "value" in value ? null : <Picker key={index}
        label={t("Depicts a person", "是否包含人物") + " " + (index + 1)} value={String(value.personReference ?? "")}
        options={[{ value: "", label: t("Depicts a person?", "是否包含人物？") },
          { value: "true", label: t("Yes", "是") }, { value: "false", label: t("No", "否") }]}
        onChange={next => {
          const { personReference: _person, ...source } = value;
          write(refs.map((item, i) => i === index ? { ...source, ...(next ? { personReference: next === "true" } : {}) } : item));
        }}/>)}
    </div>;
  })}</div>;
}

function Placement({ node, board, catalog, revision }: { node: CanvasNode; board: CanvasDocument; catalog: Catalog; revision: string }) {
  const position = board.layout[node.id]!;
  const size = nodeSize(node, catalog);
  return <details className="graph-details">
    <summary>{t("Object details", "对象详情")}</summary>
    <label>{t("Name", "名称")}<DraftField label={t("Name", "名称")} value={nodeTitle(node, catalog.models)} revision={revision} onSave={(value, at) =>
      value.trim() ? commit([{ kind: "node.rename", node: node.id, name: value.trim() }], at) : Promise.reject(new Error(t("Enter a name.", "请输入名称。")))}/></label>
    <div className="canvas-coordinates">{(["x", "y", "width", "height"] as const).map(key =>
      <label key={key}>{fieldLabel(key)}<DraftField label={fieldLabel(key)} numeric value={String(position[key] ?? size[key as "width" | "height"])}
        revision={revision} onSave={(value, at) => {
          const number = Number(value);
          if (!value.trim() || !Number.isFinite(number) || ((key === "width" || key === "height") && number <= 0)) {
            return Promise.reject(new Error(t("Enter a valid number.", "请输入有效数值。")));
          }
          return commit([key === "x" || key === "y" ? { kind: "node.move", node: node.id, x: key === "x" ? number : position.x, y: key === "y" ? number : position.y }
            : { kind: "node.resize", node: node.id, width: key === "width" ? number : position.width ?? size.width, height: key === "height" ? number : position.height ?? size.height }], at);
        }}/></label>)}</div>
  </details>;
}

function mediaOptions(node: Extract<CanvasNode, { media: unknown }>, catalog: Catalog) {
  const paths = [...new Set([node.media.path, ...catalog.media.entries.filter(entry => entry.state === "available").map(entry => entry.reference.path)])];
  return paths.map(path => ({ value: path, label: mediaName(path) }));
}

function MediaInspector({ node, catalog, board, revision, close }: {
  node: Extract<CanvasNode, { media: unknown }>; catalog: Catalog; board: CanvasDocument; revision: string; close: () => void;
}) {
  const { resource, error } = usePreview(node.id, undefined, true, node.media.path);
  const reduced = useReducedMotion();
  return <motion.section className="generation-composer graph-inspector" aria-label={nodeTitle(node, catalog.models)}
    style={{ transformOrigin: "var(--node-panel-origin)" }} {...popupMotion(reduced, .8)}>
    <header><strong>{nodeTitle(node, catalog.models)}</strong><IconButton label={t("Close", "关闭")} onClick={close}><X size={15}/></IconButton></header>
    <div className="canvas-inspector-scroll">
      {resource && <MediaPreview resource={resource} title={nodeTitle(node, catalog.models)} controls className="canvas-inspector-media"/>}
      {error && <p className="canvas-error-text">{error}</p>}
      <Picker label={t("Media asset", "素材")} value={node.media.path} options={mediaOptions(node, catalog)}
        onChange={path => void commit([{ kind: "node.set-media", node: node.id, media: { path } }], revision).catch(() => {})}/>
      <Placement node={node} board={board} catalog={catalog} revision={revision}/>
    </div>
  </motion.section>;
}

function quoteText(value: CanvasQuoteReceipt) {
  const result = value.quote;
  if (result.kind === "estimate") return `${new Intl.NumberFormat(navigator.language, { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(result.estimatedUSD)} / ${result.estimatedCredits} ${t("credits", "积分")}`;
  if (result.kind === "pricing") return t("Missing", "缺少") + " " + result.missing.map(fieldLabel).join(", ");
  return result.reason;
}

export function GenerateDialog({ nodes, catalog, done, close }: { nodes: Recipe[]; catalog: Catalog; done: () => void; close: () => void }) {
  const [targets, setTargets] = useState<Record<string, { environment: string; endpoint: string }>>({});
  const [prices, setPrices] = useState<Readonly<Record<string, string>>>({});
  const [issues, setIssues] = useState<Readonly<Record<string, readonly string[]>>>({});
  const targetsKey = JSON.stringify(nodes.map(node => node.id));
  useEffect(() => {
    let active = true;
    const ids = JSON.parse(targetsKey) as string[];
    void Promise.all(ids.map(async id => {
      const value = await observe({ kind: "node", node: id });
      return [id, value.kind === "node" ? value.issues : []] as const;
    })).then(result => { if (active) setIssues(Object.fromEntries(result)); }).catch(report);
    return () => { active = false; };
  }, [targetsKey]);
  const [running, setRunning] = useState(false);
  const rows = nodes.map(node => {
    const environments = catalog.environments.filter(item => item.capabilities.some(capability => capability.capability === node.capability));
    const environment = environments.find(item => item.id === targets[node.id]?.environment) ?? environments[0];
    const endpoints = environment?.capabilities.find(capability => capability.capability === node.capability)?.endpoints ?? [];
    const endpoint = endpoints.find(item => item === targets[node.id]?.endpoint) ?? "";
    const request = { node: node.id, ...(environment ? { environment: environment.id } : {}), ...(endpoint ? { endpoint } : {}) };
    return { node, environments, endpoints, request, ready: environment !== undefined && (endpoints.length < 2 || endpoint !== "") };
  });
  const inputsReady = rows.some(row => row.ready);
  const setPricesFor = (node: string, price: string) => setPrices(values => ({ ...values, [node]: price }));
  return <Dialog title={nodes.length > 1 ? t("Batch generate", "批量生成") : t("Generate", "生成")} close={() => { if (!running) close(); }}>
    <div className="canvas-dialog-form">
      {rows.map(({ node, environments, endpoints, request, ready }) => <section className="canvas-run-target" key={node.id}>
        <strong>{nodeTitle(node, catalog.models)}</strong>
        {issues[node.id]?.map(issue => <p key={issue} className="canvas-error-text">{issue}</p>)}
        {environments.length === 0 ? <p className="canvas-error-text">{t("No Project Execution Environment offers this model.", "当前项目的执行环境不提供这个模型。")}</p> : <>
          <label>{t("Execution Environment", "执行环境")}<Picker label={t("Execution Environment", "执行环境")}
            disabled={running} value={request.environment ?? ""} options={environments.map(item => ({ value: item.id, label: item.id }))}
            onChange={environment => { setTargets(values => ({ ...values, [node.id]: { environment, endpoint: "" } })); setPricesFor(node.id, ""); }}/></label>
          <label>{t("Endpoint", "端点")}<Picker label={t("Endpoint", "端点")} disabled={running} value={request.endpoint ?? ""}
            options={[{ value: "", label: endpoints.length > 1 ? t("Select endpoint", "选择端点") : t("Automatic", "自动") },
              ...endpoints.map(item => ({ value: item, label: item }))]}
            onChange={endpoint => { setTargets(values => ({ ...values, [node.id]: { environment: request.environment!, endpoint } })); setPricesFor(node.id, ""); }}/></label>
          <button type="button" className="button" disabled={!ready || running} onClick={() => {
            setPricesFor(node.id, t("Getting quote…", "正在询价…"));
            void quote(request).then(value => setPricesFor(node.id, quoteText(value)))
              .catch(error => setPricesFor(node.id, error.message));
          }}>{t("Quote", "询价")}</button>
          <p role="status">{prices[node.id]}</p>
        </>}
      </section>)}
      <button type="button" className="button primary" disabled={!inputsReady || running} onClick={async () => {
        setRunning(true);
        try {
          const issues: string[] = [];
          let accepted = 0;
          for (const { node, request, ready } of rows) {
            if (!ready) { issues.push(nodeTitle(node, catalog.models)); continue; }
            try {
              const receipt = await invoke(request);
              if (receipt.admission === "accepted") accepted++;
              else issues.push("issue" in receipt ? receipt.issue : t("Admission unconfirmed", "提交状态尚未确认"));
            } catch (error) { issues.push(error instanceof Error ? error.message : String(error)); }
          }
          if (issues.length) notify(issues.join("\n"), true);
          else if (accepted) notify(t("Generation submitted", "已提交生成"));
          done(); close();
        } finally { setRunning(false); }
      }}><ArrowUp size={16}/>{running ? t("Submitting…", "正在提交…") : t("Submit generation", "提交生成")}</button>
    </div>
  </Dialog>;
}

export function Composer({ node, board, catalog, entries, revision, busy, close, locate, pick, refresh, wire, onPlace }: {
  node: CanvasNode; board: CanvasDocument; catalog: Catalog; entries: RunEntries; revision: string; busy: boolean;
  close: () => void; locate: (id: string) => void; pick: (target: PickTarget) => void; refresh: () => void; wire?: Wire | undefined; onPlace: (source: PlacementSource) => void;
}) {
  return <NodePanel nodeId={node.id}>{"media" in node ? <MediaInspector node={node} board={board} catalog={catalog} revision={revision} close={close}/>
    : <RecipeComposer node={node} board={board} catalog={catalog} entries={entries} revision={revision} busy={busy}
      close={close} locate={locate} pick={pick} refresh={refresh} wire={wire} onPlace={onPlace}/>}</NodePanel>;
}

function RecipeComposer({ node, board, catalog, entries, revision, busy, close, locate, pick, refresh, wire, onPlace }: {
  node: Recipe; board: CanvasDocument; catalog: Catalog; entries: RunEntries; revision: string; busy: boolean;
  close: () => void; locate: (id: string) => void; pick: (target: PickTarget) => void; refresh: () => void; wire?: Wire | undefined; onPlace: (source: PlacementSource) => void;
}) {
  const [history, setHistory] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [generate, setGenerate] = useState(false);
  const reduced = useReducedMotion();
  const model = catalog.models.find(item => item.id === node.capability);
  const fields = model ? activeFields(node, model) : [];
  const references = fields.filter(resourceField);
  const prompts = fields.filter(field => field.kind === "text" && /prompt|^(text|description)$/i.test(field.name));
  const settingFields = fields.filter(field => !values(node.inputs[field.name]).some(item => "from" in item) && /^(mode|aspectRatio|resolution|size|duration|quality|width|height|model)$/u.test(field.name));
  const otherFields = fields.filter(field => !references.includes(field) && !prompts.includes(field) && !settingFields.includes(field));
  const value = (field: Field) => {
    const binding = node.inputs[field.name];
    return binding && "value" in binding ? String(binding.value ?? "") : String(field.default ?? "");
  };
  const tip = nodeTitle(node, catalog.models);
  const Icon = cardIcon(node, catalog);
  const models = [...new Map([...(model ? [model] : []), ...catalog.palette].map(item => [item.title, item])).values()];
  const write = async (field: Field, input: string, at?: string) => {
    let next: JsonValue | undefined = input === "" ? undefined : input;
    if (field.kind === "number" && next !== undefined) {
      next = Number(next);
      if (!Number.isFinite(next)) throw new Error(t("Enter a valid number.", "请输入有效数值。"));
    }
    if (field.kind === "boolean" && next !== undefined) next = input === "true";
    const commands = [inputCommand(node.id, field.name, next === undefined ? undefined : { value: next })];
    if (field.name === "mode") for (const item of model?.fields ?? []) {
      if (item.modes && !item.modes.some(mode => mode === (next ?? field.default)) && Object.hasOwn(node.inputs, item.name)) {
        commands.push(inputCommand(node.id, item.name));
      }
    }
    await commit(commands, at);
  };
  const chooseModel = (title: string) => {
    const chosen = models.find(item => item.title === title);
    if (!chosen || chosen.id === node.capability) return;
    const commands: CanvasCommand[] = [{ kind: "node.set-recipe", node: node.id, recipe: { capability: chosen.id, inputs: {} } }];
    for (const output of Object.keys(board.results[node.id]?.selected ?? {})) {
      if (!chosen.outputs[output] || model?.outputs[output]?.type !== chosen.outputs[output]?.type) {
        commands.push({ kind: "result.clear", node: node.id, output });
      }
    }
    void commit(commands, revision).catch(() => {});
  };
  const literalField = (field: Field, multiline = false) => {
    const current = node.inputs[field.name];
    const linked = current && "from" in current ? current.from : undefined;
    if (linked) return <div className="graph-reference-input">
      <button type="button" className="button" onClick={() => locate(linked.node)}><GitBranch size={14}/>{linked.node}</button>
      <IconButton label={t("Disconnect reference", "断开引用")} onClick={() => void commit([inputCommand(node.id, field.name)], revision).catch(() => {})}><Unlink size={14}/></IconButton>
    </div>;
    const optionsForReference = referenceOptions(board, catalog, node.id, field);
    const picker = optionsForReference.length > 0 && <ReferencePicker title={t("Link input", "关联输入") + " / " + fieldLabel(field.name)}
      options={optionsForReference} choose={value => void commit([bindingCommand(node, field, value)], revision).catch(() => {})}
      pick={() => pick({ node: node.id, field: field.name })}/>;
    if (field.kind === "choice" || field.kind === "boolean") {
      const options = field.kind === "choice" ? (field.choices ?? []).map(choice => ({ value: choice, label: fieldLabel(choice) }))
        : [{ value: "true", label: t("Yes", "是") }, { value: "false", label: t("No", "否") }];
      return <div className="graph-reference-input"><Picker label={fieldLabel(field.name)} value={value(field)}
        options={[{ value: "", label: t("Default", "默认") }, ...options]}
        onChange={next => void write(field, next, revision).catch(() => {})}/>{picker}</div>;
    }
    return <div className="graph-reference-input"><DraftField label={fieldLabel(field.name)} value={value(field)} revision={revision}
      multiline={multiline} numeric={field.kind === "number"} placeholder={multiline ? fieldLabel(field.name) : undefined}
      onSave={(next, at) => write(field, next, at)}/>{picker}</div>;
  };
  useEffect(() => { if (wire) setHistory(false); }, [wire]);
  return <motion.section className={`generation-composer${history ? " graph-inspector" : ""}`} aria-label={tip}
    style={{ transformOrigin: "var(--node-panel-origin)" }} {...popupMotion(reduced, .8)}>
    <header><strong>{tip}</strong><div className="generation-composer-actions">
      <IconButton label={history ? t("Back to editing", "返回编辑") : t("Generation history", "生成记录")} aria-pressed={history}
        onClick={() => setHistory(value => !value)}><History size={15}/></IconButton>
      <IconButton label={t("Close", "关闭")} onClick={close}><X size={15}/></IconButton>
    </div></header>
    <div className="generation-composer-scroll">
      {history ? <RunHistory node={node} model={model} document={board} entries={entries} revision={revision} busy={busy} refresh={refresh} onPlace={onPlace}/>
        : <div className="generation-compose-form">
          {wire && <div className="graph-reference-heading">
            <button type="button" className="button" onClick={() => locate(wire.source.node)}><GitBranch size={14}/>{fieldLabel(wire.source.output)} / {fieldLabel(wire.input)}</button>
            <IconButton label={t("Disconnect reference", "断开引用")} onClick={() => {
              const command = disconnect(board, wire);
              if (command) void commit([command], revision).catch(() => {});
            }}><Unlink size={14}/></IconButton>
          </div>}
          <References node={node} fields={references} board={board} catalog={catalog} revision={revision} locate={locate} pick={pick}/>
          {prompts.map((field,index) => <div className={`generation-prompt${index ? "" : " primary"}`} key={field.name}>
            <div className="generation-prompt-label"><span>{fieldLabel(field.name)}</span></div>{literalField(field, true)}
          </div>)}
          {!model && <p className="canvas-error-text">{t("Select the Model package in the Project manifest.", "请在项目清单中启用该模型包。")}</p>}
          <AnimatePresence initial={false}>{advanced && <motion.div className="generation-advanced" {...expandMotion(reduced)}>
            <div className="canvas-coordinates">{otherFields.map(field => <label key={field.name}>{fieldLabel(field.name)}{literalField(field)}</label>)}</div>
            <Placement node={node} board={board} catalog={catalog} revision={revision}/>
          </motion.div>}</AnimatePresence>
        </div>}
    </div>
    <AnimatePresence initial={false}>{!history && <motion.footer {...expandMotion(reduced)}>
      <GenerationSettings zh={zh} disabled={busy} revision={revision} icon={<Icon size={20}/>}
        settings={[{ field: "model", label: fieldLabel("model"), value: model?.title ?? node.capability, values: models.map(item => item.title) },
          ...settingFields.filter(field => field.name !== "model").map(field => ({ field: field.name, label: fieldLabel(field.name), value: value(field), ...(field.choices ? { values: field.choices } : {}) }))]}
        onChange={(name, next) => {
          if (name === "model") chooseModel(next);
          else { const field = fields.find(field => field.name === name); if (field) void write(field, next, revision).catch(() => {}); }
        }}
        onSave={(name, next, at) => {
          const field = fields.find(field => field.name === name);
          return field ? write(field, next, at) : Promise.resolve();
        }}/>
      <IconButton label={t("Settings", "更多设置")} aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}><Settings2 size={15}/></IconButton>
      <span className="generation-footer-spacer"/>
      <IconButton className="button primary generation-submit" label={t("Generate", "生成")} disabled={busy || !model} onClick={() => setGenerate(true)}><ArrowUp size={18}/></IconButton>
    </motion.footer>}</AnimatePresence>
    {generate && <GenerateDialog nodes={[node]} catalog={catalog} done={() => { refresh(); setHistory(true); }} close={() => setGenerate(false)}/>}
  </motion.section>;
}
