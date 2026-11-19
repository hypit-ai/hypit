import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  Background, BaseEdge, Handle, NodeResizeControl, Position, ReactFlow, SelectionMode, ViewportPortal,
  applyNodeChanges, getBezierPath, useNodesInitialized, useUpdateNodeInternals,
  type Edge, type EdgeProps, type Node, type NodeProps, type OnNodesChange, type ReactFlowInstance, type XYPosition,
} from "@xyflow/react";
import { Film, Focus, Hand, Image, Minus, MousePointer2, Plus, Unlink, X } from "lucide-react";
import type { CanvasCommand, CanvasDocument, CanvasNode, CanvasPlacement } from "@hypit/canvas";
import type { CanvasPreviewRequest } from "../protocol.js";
import { filename, titleFor } from "./dom.js";
import { cardSize, placeAround } from "./placement.js";
import { resolveSnap, type SnapGuide, type SnapState } from "./snapping.js";
import { maxZoom, minZoom, viewportCommands, zoomStep } from "./viewport.js";
import { activeFields, connect, connectNew, creationPorts, disconnect, nodeTitle, resourceField, wires,
  type Catalog, type PortOrigin, type Wire } from "./wiring.js";
import "@xyflow/react/dist/style.css";
import "./board.css";

type Preview = (input: CanvasPreviewRequest) => Promise<{ url: string; mediaType: string }>;
type Port = { name: string; connectable: boolean; label: string };
type CardOption = { key: string; title: string; node: CanvasNode };
type CardData = {
  title: string; subtitle: string; prompt: string; media: boolean; inputs: Port[]; outputs: Port[];
  previewKey?: string; preview: Preview; request: CanvasPreviewRequest;
  beginResize: () => void; finishResize: (placement: CanvasPlacement) => void;
};
type FlowNode = Node<CardData, "card">;
type ModelEdge = Edge<Wire, "reference">;
type BoardData = { document: CanvasDocument; revision: string; catalog: Catalog; selected: string | undefined; reveal: string | undefined };
type BoardActions = {
  select: (id?: string) => void;
  commit: (commands: CanvasCommand[], expectedRevision: string) => void;
  preview: Preview;
  settled: () => void;
};

export class Board {
  readonly #root = createRoot(window.document.getElementById("viewport")!);
  readonly #actions: BoardActions;
  #data: BoardData | undefined;
  api: { placement: (position?: XYPosition) => CanvasPlacement; openAdd: () => void } | undefined;
  dragging = false;

  constructor(actions: BoardActions) { this.#actions = actions; }

  update(document: CanvasDocument, revision: string, catalog: Catalog, selected?: string, reveal?: string) {
    this.#data = { document, revision, catalog, selected, reveal };
    this.#render();
  }

  select(selected?: string) {
    if (this.#data === undefined || this.#data.selected === selected) return;
    this.#data = { ...this.#data, selected, reveal: undefined };
    this.#render();
  }

  placement(position?: XYPosition): CanvasPlacement { return this.api?.placement(position) ?? { x: 0, y: 0 }; }
  openAdd() { this.api?.openAdd(); }

  #render() {
    if (this.#data !== undefined) this.#root.render(<CanvasBoard {...this.#data} actions={this.#actions} board={this} />);
  }
}

function CardPreview({ previewKey, preview, request }: Pick<CardData, "previewKey" | "preview" | "request">) {
  const anchor = useRef<HTMLDivElement>(null);
  const [resource, setResource] = useState<Awaited<ReturnType<Preview>>>();
  // A card without a selected Publication stays a recipe. Load only previews that scroll into view.
  useEffect(() => {
    if (previewKey === undefined || anchor.current === null) return;
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void preview(request).then(value => { if (active) setResource(value); }).catch(() => {});
    });
    observer.observe(anchor.current);
    return () => { active = false; observer.disconnect(); };
  }, [previewKey, preview, request]);
  return <div className="canvas-card-preview" ref={anchor}>
    {resource?.mediaType.startsWith("image/") ? <img src={resource.url} alt="" draggable={false} />
      : resource?.mediaType.startsWith("video/") ? <video src={resource.url} preload="metadata" muted playsInline aria-hidden="true" />
      : <div className="canvas-preview-placeholder" aria-hidden="true"><Image size={24} /></div>}
  </div>;
}

function Card({ id, data, selected }: NodeProps<FlowNode>) {
  const updatePorts = useUpdateNodeInternals();
  const portSignature = JSON.stringify([data.inputs.map(item => item.name), data.outputs.map(item => item.name)]);
  useEffect(() => { updatePorts(id); }, [id, portSignature, updatePorts]);
  // Keep the preview request stable through unrelated layout and input changes.
  const request = useMemo(() => data.request, [data.previewKey, id]);
  return <article className="canvas-card" data-kind={data.media ? "media" : "recipe"}>
    <header className="canvas-card-heading"><strong>{data.title}</strong><small>{data.subtitle}</small></header>
    <div className="canvas-card-body">
      {data.previewKey !== undefined ? <CardPreview key={data.previewKey} previewKey={data.previewKey} preview={data.preview} request={request} />
        : <div className="canvas-card-copy"><Film size={19} aria-hidden="true" /><p>{data.prompt || "No selected result"}</p></div>}
    </div>
    {([ ["target", Position.Left, data.inputs], ["source", Position.Right, data.outputs] ] as const).flatMap(([type, side, ports]) => (
      ports.map((port, index) => <Handle key={type + port.name} id={port.name} className="canvas-port nodrag"
        type={type} position={side} isConnectable={port.connectable} title={port.label} aria-label={port.label}
        style={{ top: `${28 + 64 * (index + 0.5) / ports.length}%` }} />)
    ))}
    {selected && <NodeResizeControl className="canvas-resize" position="bottom-right" minWidth={160} minHeight={96}
      onResizeStart={data.beginResize} onResizeEnd={(_, placement) => data.finishResize(placement)} />}
  </article>;
}

function ReferenceEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd }: EdgeProps<ModelEdge>) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.35 });
  return <BaseEdge id={id} path={path} {...(markerEnd === undefined ? {} : { markerEnd })} />;
}

const nodeTypes = { card: Card };
const edgeTypes = { reference: ReferenceEdge };
const selectionKeys = ["Meta", "Control", "Shift"];
const selectPan = [1, 2];
const handPan = [0, 1, 2];

function round(value: number) { return Math.round(value * 100) / 100; }
function position({ x, y }: XYPosition) { return { x: round(x), y: round(y) }; }

function CanvasBoard({ document, revision, catalog, selected, reveal, actions, board }: BoardData & { actions: BoardActions; board: Board }) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<ReactFlowInstance<FlowNode, ModelEdge> | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [activeWire, setActiveWire] = useState<string>();
  const [hand, setHand] = useState(false);
  const [flowReady, setFlowReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; at: XYPosition; origin?: PortOrigin }>();
  const [search, setSearch] = useState("");
  const snap = useRef<SnapState>({});
  const moved = useRef(new Map<string, XYPosition>());
  const framed = useRef(false);
  const lastReveal = useRef<string | undefined>(undefined);
  const view = useMemo(() => viewportCommands(() => instance.current, () => container.current), []);
  const links = useMemo(() => wires(document), [document]);
  const edges = useMemo<ModelEdge[]>(() => links.map(wire => {
    const id = JSON.stringify([wire.source.node, wire.source.output, wire.target, wire.input, wire.index]);
    return { id, type: "reference", data: wire, source: wire.source.node, sourceHandle: wire.source.output,
      target: wire.target, targetHandle: wire.input, selected: activeWire === id,
      ariaLabel: `${wire.source.node} ${wire.source.output} to ${wire.target} ${wire.input}` };
  }), [links, activeWire]);

  const end = (commands: CanvasCommand[]) => {
    board.dragging = false;
    actions.commit(commands, revision);
    actions.settled();
  };

  useLayoutEffect(() => {
    if (board.dragging) return;
    setNodes(current => {
      const local = new Map(current.map(item => [item.id, item]));
      const linkedInputs = new Map<string, Set<string>>();
      const linkedOutputs = new Map<string, Set<string>>();
      const recordPort = (ports: Map<string, Set<string>>, node: string, port: string) => {
        const names = ports.get(node);
        if (names === undefined) ports.set(node, new Set([port]));
        else names.add(port);
      };
      for (const link of links) {
        recordPort(linkedInputs, link.target, link.input);
        recordPort(linkedOutputs, link.source.node, link.source.output);
      }
      return document.nodes.map(node => {
        const box = document.layout[node.id]!;
        const media = "media" in node;
        const model = media ? undefined : catalog.models.find(model => model.id === node.capability);
        const inputs = new Map((!media && model !== undefined ? activeFields(node, model) : []).filter(resourceField)
          .map(field => [field.name, { name: field.name, label: `Input: ${titleFor(field.name)}`, connectable: true }]));
        const outputs = new Map((media ? ["media"] : Object.keys(model?.outputs ?? {})).map(name =>
          [name, { name, label: `Output: ${titleFor(name)}`, connectable: media || model?.outputs[name]?.media !== undefined }]));
        for (const name of linkedInputs.get(node.id) ?? []) if (!inputs.has(name)) inputs.set(name, { name, label: `Input: ${name}`, connectable: false });
        for (const name of linkedOutputs.get(node.id) ?? []) if (!outputs.has(name)) outputs.set(name, { name, label: `Output: ${name}`, connectable: false });
        const selectedResource = Object.values(document.results[node.id]?.selected ?? {}).find(item => item.resource !== undefined);
        const mediaEntry = media ? catalog.media.entries.find(entry => entry.reference.path === node.media.path) : undefined;
        const previewKey = media ? mediaEntry?.state === "available" ? node.media.path : undefined
          : selectedResource === undefined ? undefined : JSON.stringify(selectedResource);
        const prompt = media ? undefined : node.inputs.prompt;
        return { ...local.get(node.id), id: node.id, type: "card", position: { x: box.x, y: box.y },
          ariaLabel: nodeTitle(node, catalog.models), width: box.width ?? cardSize.width, height: box.height ?? cardSize.height,
          selected: node.id === selected || selected !== undefined && local.get(node.id)?.selected === true,
          data: { title: nodeTitle(node, catalog.models), subtitle: media ? "Project Media" : model?.title ?? node.capability,
            prompt: prompt !== undefined && "value" in prompt && typeof prompt.value === "string" ? prompt.value : "",
            media, inputs: [...inputs.values()], outputs: [...outputs.values()], preview: actions.preview,
            request: { node: node.id, ...(selectedResource === undefined ? {} : { selection: selectedResource }) },
            ...(previewKey === undefined ? {} : { previewKey }),
            beginResize: () => { board.dragging = true; },
            finishResize: next => end([{ kind: "node.resize", node: node.id, width: round(next.width!), height: round(next.height!) }]),
          } };
      });
    });
  }, [document, revision, catalog, selected, links]);

  useLayoutEffect(() => {
    board.api = { placement(at) {
      const element = container.current?.getBoundingClientRect();
      const centre = at ?? (element === undefined ? undefined : instance.current?.screenToFlowPosition(
        { x: element.left + element.width / 2, y: element.top + element.height / 2 }));
      const boxes = document.nodes.map(node => {
        const box = document.layout[node.id]!;
        return { ...box, width: box.width ?? cardSize.width, height: box.height ?? cardSize.height };
      });
      return position(placeAround(centre ?? { x: 0, y: 0 }, cardSize, boxes));
    }, openAdd() {
      const element = container.current?.getBoundingClientRect();
      if (element === undefined || instance.current === null) return;
      setSearch("");
      setMenu({ x: 12, y: 12, at: instance.current.screenToFlowPosition({ x: element.left + element.width / 2, y: element.top + element.height / 2 }) });
    } };
  }, [document]);

  const changeNodes: OnNodesChange<FlowNode> = changes => {
    const movement = changes.flatMap(change => change.type === "position" && change.position !== undefined && change.dragging
      ? [{ id: change.id, ...change.position }] : []);
    if (movement.length > 0) {
      const ids = new Set(movement.map(item => item.id));
      const subjects = movement.flatMap(item => {
        const node = nodes.find(node => node.id === item.id);
        return node === undefined ? [] : [{ ...item, width: node.width ?? cardSize.width, height: node.height ?? cardSize.height }];
      });
      const targets = nodes.filter(node => !ids.has(node.id)).map(node => ({ id: node.id, ...node.position,
        width: node.width ?? cardSize.width, height: node.height ?? cardSize.height }));
      const result = resolveSnap(subjects, targets, instance.current?.getZoom() ?? 1, snap.current);
      snap.current = result.state;
      setGuides(result.guides);
      for (const item of movement) moved.current.set(item.id, { x: item.x + result.offset.x, y: item.y + result.offset.y });
      changes = changes.map(change => change.type === "position" && change.dragging && ids.has(change.id)
        ? { ...change, position: moved.current.get(change.id)! } : change);
    } else if (board.dragging) {
      // React Flow reports the raw pointer position once more on release; keep the snapped position.
      changes = changes.map(change => change.type === "position" && moved.current.has(change.id)
        ? { ...change, position: moved.current.get(change.id)! } : change);
    } else {
      const commands = changes.flatMap((change): CanvasCommand[] => change.type === "position" && change.position !== undefined
        ? [{ kind: "node.move", node: change.id, ...position(change.position) }] : []);
      if (commands.length > 0) actions.commit(commands, revision);
    }
    setNodes(current => applyNodeChanges(changes, current));
  };

  function openMenuAt(x: number, y: number, origin?: PortOrigin) {
    const canvas = container.current?.getBoundingClientRect();
    if (canvas === undefined || instance.current === null) return;
    const at = instance.current.screenToFlowPosition({ x, y });
    setSearch("");
    setMenu({ x: Math.max(8, Math.min(x - canvas.left, canvas.width - 284)),
      y: Math.max(8, Math.min(y - canvas.top, canvas.height - 275)), at, ...(origin === undefined ? {} : { origin }) });
  }

  function openMenu(event: MouseEvent | globalThis.MouseEvent) {
    event.preventDefault();
    openMenuAt(event.clientX, event.clientY);
  }

  const removeLink = () => {
    const wire = edges.find(edge => edge.id === activeWire)?.data;
    const edit = wire === undefined ? undefined : disconnect(document, wire);
    if (edit !== undefined) actions.commit([edit], revision);
    setActiveWire(undefined);
  };

  function add(candidate: CanvasNode, port?: string) {
    const node = { ...candidate, id: ("media" in candidate ? "media-" : "recipe-") + crypto.randomUUID().slice(0, 12) };
    const commands: CanvasCommand[] = [{ kind: "node.add", node, placement: board.placement(menu?.at) }];
    if (menu?.origin !== undefined && port !== undefined) {
      const connection = connectNew(document, catalog, menu.origin, node, port);
      if (connection === undefined) return;
      commands.push(connection);
    }
    actions.commit(commands, revision);
    setMenu(undefined);
  }

  const includesSearch = (title: string) => title.toLowerCase().includes(search.trim().toLowerCase());
  const choices = (candidates: CardOption[]) => candidates.flatMap<CardOption & { port?: string }>(candidate => {
    if (menu?.origin === undefined) return includesSearch(candidate.title) ? [candidate] : [];
    return creationPorts(document, catalog, menu.origin, candidate.node).flatMap(port => {
      const title = `${candidate.title} · ${titleFor(port)}`;
      return includesSearch(title) ? [{ ...candidate, title, key: JSON.stringify([candidate.key, port]), port }] : [];
    });
  });
  const draft = { id: "" }; // Menu candidates become real cards only when chosen.
  const matchingModels = menu === undefined ? [] : choices(catalog.palette.map(model => ({ key: model.id, title: model.title,
    node: { ...draft, capability: model.id, inputs: {} } })));
  const matchingMedia = menu === undefined ? [] : choices(catalog.media.entries.flatMap(entry => entry.state === "available"
    ? [{ key: entry.reference.path, title: filename(entry.reference.path), node: { ...draft, media: entry.reference } }] : []));
  return <div className="canvas-flow" ref={container}>
    <ReactFlow<FlowNode, ModelEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onInit={flow => { instance.current = flow; setFlowReady(true); }} onNodesChange={changeNodes}
      minZoom={minZoom} maxZoom={maxZoom} panOnScroll zoomOnScroll={false} zoomOnDoubleClick={false}
      panOnDrag={hand ? handPan : selectPan} selectionOnDrag={!hand} selectionMode={SelectionMode.Partial}
      multiSelectionKeyCode={selectionKeys} nodesDraggable={!hand} nodeDragThreshold={4} deleteKeyCode={null}
      elevateEdgesOnSelect onMove={(_, viewport) => setZoom(viewport.zoom)}
      onPaneClick={() => { actions.select(undefined); setActiveWire(undefined); setMenu(undefined); }}
      onPaneContextMenu={openMenu} onDoubleClick={event => {
        if (event.target instanceof Element && event.target.classList.contains("react-flow__pane")) openMenu(event);
      }}
      onNodeClick={(_, node) => { actions.select(node.id); setActiveWire(undefined); setMenu(undefined); }}
      onNodeDoubleClick={(_, node) => view.activate(node.id)}
      onEdgeClick={(_, edge) => { setActiveWire(edge.id); setMenu(undefined); }}
      onNodeDragStart={() => { moved.current.clear(); board.dragging = true; setMenu(undefined); }}
      onNodeDragStop={() => {
        const commands = [...moved.current.entries()].flatMap(([id, point]): CanvasCommand[] => {
          const next = position(point);
          const previous = document.layout[id];
          return previous?.x === next.x && previous.y === next.y ? [] : [{ kind: "node.move", node: id, ...next }];
        });
        moved.current.clear(); snap.current = {}; setGuides([]);
        end(commands);
      }}
      isValidConnection={link => !hand && connect(document, catalog, link) !== undefined}
      nodesConnectable={!hand} connectOnClick={false}
      onConnectStart={() => { board.dragging = true; setMenu(undefined); }}
      onConnect={link => { const edit = connect(document, catalog, link); if (edit !== undefined) actions.commit([edit], revision); }}
      onConnectEnd={(event, state) => {
        board.dragging = false;
        actions.settled();
        const handle = state.fromHandle;
        const point = "changedTouches" in event ? event.changedTouches.item(0) : event;
        if (point === null || state.isValid || handle?.id == null || !window.document.elementFromPoint(point.clientX, point.clientY)
            ?.classList.contains("react-flow__pane")) return;
        openMenuAt(point.clientX, point.clientY, { node: handle.nodeId, port: handle.id, side: handle.type });
      }}
      proOptions={{ hideAttribution: true }}>
      <Background gap={20} size={1.2} color="#c9ccd8" />
      {flowReady && <InitialView ids={nodes.map(node => node.id)} reveal={reveal} framed={framed} lastReveal={lastReveal} view={view} />}
      <ViewportPortal>{guides.map(guide => <div key={guide.id} aria-hidden="true" className="canvas-guide" style={guide.axis === "x"
        ? { left: guide.coordinate, top: guide.start, height: guide.end - guide.start, width: 1 / zoom }
        : { top: guide.coordinate, left: guide.start, width: guide.end - guide.start, height: 1 / zoom }} />)}</ViewportPortal>
    </ReactFlow>
    <div className="canvas-nav" aria-label="Canvas navigation">
      <button type="button" aria-label="Select cards" title="Select cards" aria-pressed={!hand} onClick={() => setHand(false)}><MousePointer2 size={16} /></button>
      <button type="button" aria-label="Pan canvas" title="Pan canvas" aria-pressed={hand} onClick={() => setHand(true)}><Hand size={16} /></button>
      <span className="canvas-nav-divider" />
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => view.zoomBy(1 / zoomStep)}><Minus size={16} /></button>
      <button className="canvas-zoom" type="button" title="Reset zoom" onClick={() => view.zoomTo(1)}>{Math.round(zoom * 100)}%</button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => view.zoomBy(zoomStep)}><Plus size={16} /></button>
      <button type="button" aria-label="Fit cards" title="Fit cards" onClick={() => view.fit(nodes.map(node => node.id))}><Focus size={17} /></button>
      {edges.some(edge => edge.id === activeWire) && <button type="button" title="Disconnect selected wire" onClick={removeLink}><Unlink size={16} />Disconnect</button>}
    </div>
    {menu && <div className="canvas-add-menu" role="dialog" aria-label="Add card" style={{ left: menu.x, top: menu.y }}
      onKeyDown={event => { if (event.key === "Escape") setMenu(undefined); }}>
      <header><strong>{menu.origin === undefined ? "Add card" : "Add connected card"}</strong><button type="button" aria-label="Close add card" onClick={() => setMenu(undefined)}><X size={16} /></button></header>
      <input autoFocus type="search" placeholder="Search models and media…" aria-label="Search models and media" value={search} onChange={event => setSearch(event.target.value)} />
      <div className="canvas-add-options">
        {matchingModels.length > 0 && <small>Models</small>}
        {matchingModels.map(model => <button key={model.key} type="button" onClick={() => add(model.node, model.port)}><Film size={15} />{model.title}</button>)}
        {matchingMedia.length > 0 && <small>Project Media</small>}
        {matchingMedia.map(entry => <button key={entry.key} type="button" onClick={() => add(entry.node, entry.port)}><Image size={15} />{entry.title}</button>)}
        {matchingModels.length + matchingMedia.length === 0 && <p className="muted">{menu.origin === undefined
          ? "No matching models or Project Media." : "No compatible models or Project Media match this port."}</p>}
      </div>
    </div>}
  </div>;
}

function InitialView({ ids, reveal, framed, lastReveal, view }: { ids: string[]; reveal: string | undefined;
  framed: { current: boolean }; lastReveal: { current: string | undefined }; view: ReturnType<typeof viewportCommands> }) {
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!initialized || ids.length === 0) return;
    if (reveal !== undefined && ids.includes(reveal) && lastReveal.current !== reveal) {
      lastReveal.current = reveal;
      view.reveal([reveal], undefined, !framed.current);
      framed.current = true;
    } else if (!framed.current) {
      view.fit(ids);
      framed.current = true;
    }
  }, [initialized, ids, reveal, view]);
  return null;
}
