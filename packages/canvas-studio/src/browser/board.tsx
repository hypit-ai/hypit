import {
  applyNodeChanges, ReactFlow, ReactFlowProvider, SelectionMode, useNodesInitialized, ViewportPortal,
  type NodeChange, type ReactFlowInstance, type Viewport, type XYPosition,
} from "@xyflow/react";
import { Menu } from "@base-ui/react/menu";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  ArrowLeft, Box, Copy, Film, GitBranch, Group, Hand, Images, MousePointer2, Plus, Redo2, RefreshCw, SlidersHorizontal,
  Trash2, Workflow, Undo2, Upload, X,
} from "lucide-react";
import type { CanvasCommand, CanvasDocument, CanvasNode, CanvasValue } from "@hypit/canvas";
import { ArrivalLayer, announceArrival } from "./ArrivalLayer.js";
import { ConnectionPreview, ConnectionPreviewContext, PendingConnection, ReferenceEdge, type ReferenceCanvasEdge } from "./CanvasEdges.js";
import { AddNodeMenu, CanvasDots, CanvasZoom, NodeActions, SnapGuides, type AddNodeItem } from "./CanvasOverlays.js";
import { Composer, GenerateDialog, bindingCommand, type PickTarget } from "./Composer.js";
import { FlowLayer } from "./FlowLayer.js";
import { AssemblyNode, ConnectorMenuContext, ObjectNode, type CanvasGroup, type GroupNode, type ObjectCanvasNode } from "./ObjectNode.js";
import { useRunEntries } from "./RunHistory.js";
import { PlaceMediaDialog, publicationPlacement, type PlacementSource } from "./PlaceMediaDialog.js";
import { RemoveObjectsDialog } from "./RemoveObjectsDialog.js";
import { ZoomControl, type ZoomCommand } from "./ZoomControl.js";
import { ReceivingMotion, confirmConnection, rejectConnection, settleSurface } from "./connectionMotion.js";
import type { ConnectorSide } from "./connectorGlyph.js";
import { enterMotion, popupMotion } from "./motion.js";
import { cardSize, pasteOffset, placeAround, placeFrom, placeLeftOf, placeRightOf, placeRightward, type Box as Area } from "./placement.js";
import { cardIcon, categories, fieldLabel, mediaName, MediaThumbnail, modelCategory, ObjectSearch, type Category } from "./presentation.js";
import { commit, editHistory, importMedia, notify, refresh, report, type Recipe } from "./session.js";
import { resolveSnap, type SnapGuide, type SnapState } from "./snapping.js";
import { Dialog, IconButton, t } from "./ui.js";
import { maxZoom, minZoom, viewportCommands, zoomAround, zoomStep, type Rect } from "./viewport.js";
import { activeFields, connect, disconnect, nodeSize, nodeTitle, outputsFor, resourceField, supplies, wires, type Catalog, type Wire } from "./wiring.js";
import "@xyflow/react/dist/style.css";
import "./canvas.css";

type FlowNode = ObjectCanvasNode | GroupNode;
type BoardProps = {
  board: CanvasDocument;
  revision: string;
  catalog: Catalog;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

const nodeTypes = { object: ObjectNode, assembly: AssemblyNode };
const edgeTypes = { reference: ReferenceEdge };
const multiSelection = ["Meta", "Control", "Shift"];
const groupTopInset = 76;
const mediaDragType = "application/x-hypit-canvas-media";

type BoardView = { viewport?: Viewport | undefined; trace?: string | undefined; groups: CanvasGroup[]; snap?: boolean };
type Anchor = { id: string; side: ConnectorSide };
type CreationMenu = { x: number; y: number; at: XYPosition; connector?: Anchor; start?: XYPosition; centred?: boolean; process?: boolean };
type ChoiceMenu = { x: number; y: number; title: string; items: AddNodeItem[]; cancelled?: (() => void) | undefined };

const storageKey = (canvas: string) => "hypit:canvas:" + canvas;
function readView(canvas: string): BoardView {
  try { const value = JSON.parse(localStorage.getItem(storageKey(canvas)) ?? "{}") as BoardView; return { ...value, groups: value.groups ?? [] }; }
  catch { return { groups: [] }; }
}
function persist(canvas: string, view: BoardView) {
  try { localStorage.setItem(storageKey(canvas), JSON.stringify(view)); } catch {}
}

const wireId = (wire: Wire) => JSON.stringify([wire.source.node, wire.source.output, wire.target, wire.input, wire.index]);
const newId = () => "card-" + crypto.randomUUID();
const rounded = ({ x, y }: XYPosition) => ({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
const boxOf = (node: FlowNode) => ({ id: node.id, ...node.position, width: node.measured?.width ?? node.width ?? cardSize.width,
  height: node.measured?.height ?? node.height ?? cardSize.height });
function bounds(boxes: Area[]): Area | undefined {
  if (!boxes.length) return;
  const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
  return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x, height: Math.max(...boxes.map(box => box.y + box.height)) - y };
}

function modelFor(node: Recipe, catalog: Catalog) { return catalog.models.find(model => model.id === node.capability); }
function inputsFor(node: CanvasNode, catalog: Catalog) {
  const model = "capability" in node ? modelFor(node, catalog) : undefined;
  return model && "capability" in node ? activeFields(node, model).filter(field => resourceField(field) || catalog.models.some(candidate =>
    Object.values(candidate.outputs).some(output => output.media === undefined))) : [];
}
function linksFor(board: CanvasDocument, catalog: Catalog, source: CanvasNode, target: CanvasNode) {
  return outputsFor(source, catalog).flatMap(output => inputsFor(target, catalog).flatMap(field => {
    const command = connect(board, catalog, { source: source.id, sourceHandle: output, target: target.id, targetHandle: field.name });
    return command === undefined ? [] : [{ label: fieldLabel(field.name), detail: fieldLabel(output), command }];
  }));
}

function upstream(root: string, links: Wire[]) {
  const nodes = new Set([root]), edges = new Set<string>(), queue = [root];
  for (const target of queue) for (const wire of links) {
    if (wire.target !== target) continue;
    edges.add(wireId(wire));
    if (nodes.has(wire.source.node)) continue;
    nodes.add(wire.source.node); queue.push(wire.source.node);
  }
  return { nodes, edges };
}

export function CanvasBoard(props: BoardProps) {
  return <ReactFlowProvider><Canvas {...props}/></ReactFlowProvider>;
}

function Canvas({ board, catalog, revision, busy, canUndo, canRedo }: BoardProps) {
  const reduced = useReducedMotion();
  const [initial] = useState(() => readView(board.id));
  const [groups, setGroups] = useState(initial.groups);
  const [trace, setTrace] = useState(initial.trace);
  const [snap, setSnap] = useState(initial.snap ?? true);
  const [picked, setPicked] = useState<string[]>([]);
  const [inspecting, setInspecting] = useState<string>();
  const [wire, setWire] = useState<string>();
  const [tool, setTool] = useState<"select" | "hand">("select");
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [rail, setRail] = useState<Category | "media" | "all">();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<CreationMenu>();
  const [choices, setChoices] = useState<ChoiceMenu>();
  const [pick, setPick] = useState<PickTarget>();
  const [removing, setRemoving] = useState<string[]>();
  const [placing, setPlacing] = useState<PlacementSource>();
  const [groupName, setGroupName] = useState<string>();
  const [batch, setBatch] = useState<Recipe[]>();
  const [dragging, setDragging] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [flowReady, setFlowReady] = useState(false);
  const [locating, setLocating] = useState<{ ids: string[]; fresh?: boolean; origin?: Rect | undefined; first?: boolean }>();
  const flow = useRef<ReactFlowInstance<FlowNode, ReferenceCanvasEdge> | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const viewport = useRef(initial.viewport);
  const activeRevision = useRef<string | undefined>(undefined);
  const dragPositions = useRef(new Map<string, XYPosition>());
  const groupDrag = useRef<{ origin: XYPosition; members: Map<string, XYPosition> } | undefined>(undefined);
  const snapState = useRef<SnapState>({});
  const bypassSnap = useRef(false);
  const connection = useRef<{ anchor: Anchor; point: XYPosition; start: XYPosition; revision: string } | undefined>(undefined);
  const receiving = useRef(new ReceivingMotion());
  const clipboard = useRef<{ nodes: CanvasNode[]; layouts: CanvasDocument["layout"] } | undefined>(undefined);
  const framed = useRef(Boolean(initial.viewport));
  const view = useMemo(() => viewportCommands(() => flow.current, () => stage.current), []);
  const initialized = useNodesInitialized();
  const links = useMemo(() => wires(board), [board]);
  const tracing = trace && board.nodes.some(node => node.id === trace) ? upstream(trace, links) : undefined;
  const byId = useMemo(() => new Map(board.nodes.map(node => [node.id, node])), [board.nodes]);
  const object = byId.get(inspecting ?? "");
  const selectedWire = links.find(link => wireId(link) === wire);
  const { entries, refresh: refreshRuns } = useRunEntries(board, revision, inspecting);

  function storeView(nextViewport = viewport.current) {
    persist(board.id, { viewport: nextViewport, groups, trace, snap });
  }
  useEffect(() => { storeView(); }, [board.id, groups, trace, snap]);

  function mayPick(node: CanvasNode) {
    if (!pick || node.id === pick.node) return false;
    const target = byId.get(pick.node);
    const field = target && inputsFor(target, catalog).find(field => field.name === pick.field);
    return field !== undefined && outputsFor(node, catalog).some(output => supplies(node, output, field, catalog));
  }

  const collapsed = new Map(groups.filter(group => group.collapsed).flatMap(group => group.members.map(id => [id, group.id] as const)));
  useEffect(() => {
    if (activeRevision.current !== undefined) return;
    const cards = board.nodes.map<ObjectCanvasNode>(node => {
      const position = board.layout[node.id]!;
      const size = nodeSize(node, catalog);
      const run = entries[node.id]?.at(-1);
      const phase = run?.phase;
      const issue = run && ("issue" in run ? run.issue : run.observation?.failure?.message);
      return {
        id: node.id, type: "object", position: { x: position.x, y: position.y }, selected: picked.includes(node.id),
        width: position.width ?? size.width, height: position.height ?? size.height, hidden: collapsed.has(node.id),
        ariaLabel: nodeTitle(node, catalog.models),
        className: [trace === node.id ? "graph-trace-terminal" : tracing?.nodes.has(node.id) ? "graph-trace-member" : tracing ? "graph-trace-ghost" : "",
          pick ? mayPick(node) ? "graph-pick-eligible" : "graph-pick-ineligible" : ""].join(" "),
        data: { node, catalog, phase, issue, accepts: inputsFor(node, catalog).length > 0, supplies: outputsFor(node, catalog).length > 0,
          result: Object.values(board.results[node.id]?.selected ?? {}).find(item => item.resource !== undefined),
          resizeStart: () => { activeRevision.current = revision; setDragging(node.id); },
          resizeFinish: size => {
            const at = activeRevision.current ?? revision;
            activeRevision.current = undefined; setDragging(undefined);
            if (size.width !== undefined && size.height !== undefined) void commit(
              [{ kind: "node.resize", node: node.id, width: size.width, height: size.height }], at).catch(() => setLayoutEpoch(value => value + 1));
          } },
      };
    });
    const assemblies = groups.flatMap<GroupNode>(group => {
      const members = group.members.filter(id => byId.has(id));
      const frame = bounds(members.map(id => ({ ...nodeSize(byId.get(id)!, catalog), ...board.layout[id]! })));
      if (!frame) return [];
      return [{ id: group.id, type: "assembly", position: { x: frame.x - 20, y: frame.y - groupTopInset },
        width: group.collapsed ? cardSize.width : frame.width + 40, height: group.collapsed ? 64 : frame.height + groupTopInset + 35, zIndex: -1,
        dragHandle: ".graph-assembly header", selectable: false,
        data: { group: { ...group, members }, toggle: () => {
          if (!group.collapsed && members.some(id => picked.includes(id))) clear();
          setGroups(current => current.map(item => item.id === group.id ? { ...item, collapsed: !item.collapsed } : item));
        }, remove: () => setGroups(current => current.filter(item => item.id !== group.id)) },
      }];
    });
    setNodes([...cards, ...assemblies]);
  }, [board, catalog, revision, groups, trace, pick, entries, picked, layoutEpoch]);

  const edges: ReferenceCanvasEdge[] = links.flatMap(link => {
    const id = wireId(link);
    const source = collapsed.get(link.source.node) ?? link.source.node, target = collapsed.get(link.target) ?? link.target;
    if (source === target) return [];
    return [{ id, source, target, type: "reference", selected: wire === id,
      sourceHandle: source === link.source.node ? "out" : null, targetHandle: target === link.target ? "in" : null,
      ariaLabel: fieldLabel(link.source.output) + " → " + fieldLabel(link.input),
      data: { endpointActive: picked.includes(link.source.node) || picked.includes(link.target) || Boolean(tracing?.edges.has(id)) },
      className: tracing ? tracing.edges.has(id) ? "graph-trace-edge" : "graph-trace-ghost" : "" }];
  });

  useEffect(() => {
    if (!flowReady || !initialized) return;
    if (locating) {
      const move = locating.fresh ? view.reveal(locating.ids, locating.origin, locating.first, 76) : view.locate(locating.ids);
      if (move || view.rect(locating.ids)) {
        setLocating(undefined);
        if (locating.fresh) announceArrival(locating.ids[0]!);
      }
    } else if (!framed.current && nodes.length) {
      framed.current = true; view.fit(nodes.filter(node => !node.hidden && node.type === "object").map(node => node.id));
    }
  }, [flowReady, initialized, locating, nodes, view]);

  useEffect(() => {
    const area = section.current;
    if (!area) return;
    let frame = 0, delta = 0, point = { x: 0, y: 0 };
    const wheel = (event: WheelEvent) => {
      if (!(event.metaKey || event.ctrlKey) || (event.target as Element).closest(".nowheel")) return;
      const surface = stage.current?.getBoundingClientRect();
      if (!surface || !stage.current?.contains(event.target as Node)) return;
      event.preventDefault(); event.stopPropagation();
      point = { x: event.clientX - surface.left, y: event.clientY - surface.top };
      delta += event.deltaY * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? surface.height : 1);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const instance = flow.current, current = instance?.getViewport();
        if (instance && current) void instance.setViewport(zoomAround(current, point, current.zoom * zoomStep ** (-delta / 100)));
        delta = 0;
      });
    };
    area.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => { area.removeEventListener("wheel", wheel, { capture: true }); cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => () => receiving.current.cancel(), []);

  function focus(id: string) {
    setGroups(current => current.map(group => group.collapsed && group.members.includes(id) ? { ...group, collapsed: false } : group));
    setPicked([id]); setInspecting(id); setWire(undefined); setLocating({ ids: [id] });
  }
  function traceInputs(id: string) {
    const subjects = upstream(id, links).nodes;
    setGroups(current => current.map(group => group.collapsed && group.members.some(member => subjects.has(member)) ? { ...group, collapsed: false } : group));
    setTrace(id); setLocating({ ids: [id] });
  }
  function clear() { setPicked([]); setInspecting(undefined); setWire(undefined); }

  function positions(changes: NodeChange<FlowNode>[]) {
    const selections = changes.filter(change => change.type === "select");
    if (selections.length && !pick) {
      const current = new Set(picked);
      for (const change of selections) {
        if (!byId.has(change.id)) continue;
        if (change.selected) current.add(change.id); else current.delete(change.id);
      }
      const next = [...current];
      if (next.length !== picked.length || next.some(id => !picked.includes(id))) {
        setPicked(next);
        if (next.length === 1) setInspecting(next[0]);
        else if (next.length === 0) setInspecting(undefined);
      }
    }
    const moves = changes.flatMap(change => change.type === "position" && change.dragging && change.position ? [change] : []);
    let next = changes;
    if (moves.length && !groupDrag.current) {
      const moving = new Set(moves.map(item => item.id));
      const subjects = moves.flatMap(change => {
        const node = nodes.find(item => item.id === change.id);
        return node?.type === "object" ? [{ ...boxOf(node), ...change.position! }] : [];
      });
      const result = snap && !bypassSnap.current ? resolveSnap(subjects,
        nodes.filter(node => node.type === "object" && !node.hidden && !moving.has(node.id)).map(boxOf),
        flow.current?.getViewport().zoom ?? 1, snapState.current) : undefined;
      snapState.current = result?.state ?? {}; setGuides(result?.guides ?? []);
      next = changes.map(change => {
        if (change.type !== "position" || !change.position || !moving.has(change.id)) return change;
        const position = { x: change.position.x + (result?.offset.x ?? 0), y: change.position.y + (result?.offset.y ?? 0) };
        dragPositions.current.set(change.id, position);
        return { ...change, position };
      });
    }
    setNodes(current => applyNodeChanges(next, current));
  }

  function beginMove(node: FlowNode) {
    activeRevision.current = revision;
    dragPositions.current.clear();
    setDragging(node.id);
    groupDrag.current = node.type === "assembly" ? { origin: node.position, members: new Map(node.data.group.members.map(id => [id, board.layout[id]!])) } : undefined;
  }
  function moveGroup(node: FlowNode) {
    const group = groupDrag.current;
    if (!group) return;
    const dx = node.position.x - group.origin.x, dy = node.position.y - group.origin.y;
    for (const [id, origin] of group.members) dragPositions.current.set(id, { x: origin.x + dx, y: origin.y + dy });
    setNodes(current => current.map(item => dragPositions.current.has(item.id) ? { ...item, position: dragPositions.current.get(item.id)! } : item));
  }
  function finishMove(changed: FlowNode[]) {
    const at = activeRevision.current;
    const moved = groupDrag.current ? [...dragPositions.current] : changed.flatMap<[string, XYPosition]>(node =>
      node.type === "object" ? [[node.id, dragPositions.current.get(node.id) ?? node.position]] : []);
    groupDrag.current = undefined; activeRevision.current = undefined;
    setDragging(undefined); snapState.current = {}; setGuides([]);
    const commands = moved.flatMap<CanvasCommand>(([id, raw]) => {
      const old = board.layout[id], position = rounded(raw);
      return !old || old.x === position.x && old.y === position.y ? [] : [{ kind: "node.move", node: id, ...position }];
    });
    void commit(commands, at).catch(() => setLayoutEpoch(value => value + 1));
  }
  const pointOf = (x: number, y: number) => flow.current?.screenToFlowPosition({ x, y }) ?? { x, y };
  const obstacles = () => nodes.filter(node => !node.hidden && node.type === "object").map(boxOf);
  const centre = () => {
    const rectangle = stage.current?.getBoundingClientRect();
    return rectangle ? pointOf(rectangle.left + rectangle.width / 2, rectangle.top + rectangle.height / 2) : { x: 160, y: 160 };
  };
  const selectedIds = picked.filter(id => byId.has(id));
  const selectedRecipes = selectedIds.flatMap(id => { const node = byId.get(id)!; return "capability" in node ? [node] : []; });

  function candidateModels() {
    return catalog.palette.map(model => ({ node: { id: newId(), capability: model.id, inputs: {} } as Recipe, model }));
  }
  function candidateMedia() {
    return catalog.media.entries.flatMap(entry => entry.state !== "available" ? [] : [{
      node: { id: newId(), media: entry.reference } satisfies CanvasNode, label: mediaName(entry.reference.path), detail: entry.mediaType,
    }]);
  }
  function create(node: CanvasNode, at: XYPosition, options: { centered?: boolean; anchor?: Anchor; command?: CanvasCommand } = {}) {
    const source = options.anchor && view.rect([options.anchor.id]);
    const before = options.anchor?.side === "target", others = obstacles(), size = nodeSize(node, catalog);
    const placement = options.centered ? placeAround(at, size, others)
      : source && menu?.centred ? before ? placeLeftOf(source, size, others) : placeRightOf(source, size, others)
      : options.anchor?.side === "source" ? placeRightward(at, size, others) : placeFrom({ ...at, ...size }, others, before);
    const origin = view.origin(), first = !board.nodes.length;
    const commands: CanvasCommand[] = [{ kind: "node.add", node, placement: rounded(placement) }];
    if (options.command) commands.push(options.command);
    setMenu(undefined); setChoices(undefined);
    void commit(commands, revision).then(() => {
      setRail(undefined); setTrace(undefined); setPicked([node.id]); setInspecting(node.id);
      setLocating({ ids: [node.id], fresh: true, origin, first });
    }).catch(() => {});
  }

  function chooseOnCanvas(node: CanvasNode) {
    if (!pick || !mayPick(node)) return;
    const target = byId.get(pick.node) as Recipe;
    const field = inputsFor(target, catalog).find(field => field.name === pick.field)!;
    const options = outputsFor(node, catalog).filter(output => supplies(node, output, field, catalog));
    const apply = (output: string) => {
      void commit([bindingCommand(target, field, { from: { node: node.id, output } }, pick.index)], revision)
        .then(() => { setPick(undefined); setChoices(undefined); focus(target.id); }).catch(() => {});
    };
    if (options.length === 1) { apply(options[0]!); return; }
    const rect = view.rect([node.id]);
    const anchor = rect && flow.current?.flowToScreenPosition({ x: rect.x + rect.width, y: rect.y });
    setChoices({ x: anchor?.x ?? 100, y: anchor?.y ?? 100, title: t("Choose output", "选择输出"),
      items: options.map(output => ({ key: output, label: fieldLabel(output), icon: GitBranch, run: () => apply(output) })) });
  }

  function connectionOptions(anchor: Anchor, other: CanvasNode, document = board) {
    const start = byId.get(anchor.id);
    if (!start || start.id === other.id) return [];
    return linksFor(document, catalog, anchor.side === "source" ? start : other, anchor.side === "source" ? other : start);
  }
  function cardUnder(x: number, y: number) {
    const surface = document.elementsFromPoint(x, y).map(element => element.closest<HTMLElement>("[data-graph-node]")).find(Boolean);
    const node = surface && byId.get(surface.dataset.graphNode ?? "");
    return node && surface ? { node, surface } : undefined;
  }
  function previewEnd(x: number, y: number) {
    const current = connection.current, screen = flow.current?.flowToScreenPosition({ x, y });
    if (!current || !screen) return { x, y };
    const target = cardUnder(screen.x, screen.y);
    const valid = target && connectionOptions(current.anchor, target.node).length > 0;
    receiving.current.track(valid ? target.surface : null, screen.x, screen.y);
    if (!valid) return { x, y };
    const rectangle = view.rect([target.node.id]);
    if (!rectangle) return { x, y };
    return { x: x * .62 + (rectangle.x + (current.anchor.side === "source" ? 0 : rectangle.width)) * .38,
      y: y * .62 + (rectangle.y + rectangle.height / 2) * .38 };
  }
  function startConnector(event: MouseEvent | TouchEvent, anchor: Anchor) {
    const point = "touches" in event ? event.touches[0] : event;
    const rectangle = view.rect([anchor.id]);
    if (!point || !rectangle || busy || pick) return;
    connection.current = { anchor, point: { x: point.clientX, y: point.clientY }, revision,
      start: { x: rectangle.x + (anchor.side === "source" ? rectangle.width : 0), y: rectangle.y + rectangle.height / 2 } };
    setConnecting(true);
  }
  function openConnector(id: string, side: ConnectorSide, x: number, y: number, process = false) {
    if (busy || pick) return;
    const rectangle = view.rect([id]);
    if (!rectangle) return;
    setMenu({ x, y, at: pointOf(x, y), connector: { id, side }, centred: true, process,
      start: { x: rectangle.x + (side === "source" ? rectangle.width : 0), y: rectangle.y + rectangle.height / 2 } });
  }
  function endConnector(event: MouseEvent | TouchEvent) {
    const current = connection.current;
    connection.current = undefined;
    setConnecting(false);
    const released = receiving.current.release();
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    if (!current || !point || Math.hypot(point.clientX - current.point.x, point.clientY - current.point.y) <= 4) {
      if (released) settleSurface(released.surface, released.transform);
      return;
    }
    const x = point.clientX, y = point.clientY;
    const target = cardUnder(x, y);
    if (!target && document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) {
      setMenu({ x, y, at: pointOf(x, y), connector: current.anchor, start: current.start });
      if (released) settleSurface(released.surface, released.transform);
      return;
    }
    const options = target ? connectionOptions(current.anchor, target.node) : [];
    const apply = (command: CanvasCommand) => {
      setChoices(undefined);
      void commit([command], current.revision).then(() => { if (target) confirmConnection(target.surface, released?.transform); })
        .catch(() => { if (target) rejectConnection(target.surface, released?.transform); });
    };
    if (!options.length) {
      if (target) rejectConnection(target.surface, released?.transform);
      else if (released) settleSurface(released.surface, released.transform);
      return;
    }
    if (options.length === 1) { apply(options[0]!.command); return; }
    setChoices({ x, y, title: t("Connect to", "连接到"),
      items: options.map(({ label, detail, command }, index) => ({ key: String(index), label, detail, icon: GitBranch, run: () => apply(command) })),
      cancelled: released ? () => settleSurface(released.surface, released.transform) : undefined });
  }
  function openPane(event: ReactMouseEvent | MouseEvent) {
    if (busy || pick || !(event.target as Element).classList.contains("react-flow__pane")) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, at: pointOf(event.clientX, event.clientY) });
  }

  const cards = candidateModels();
  const assets = candidateMedia();
  const menuItems: AddNodeItem[] = menu ? [...cards.map(({ node, model }) => ({
    node, label: model.title, detail: fieldLabel(modelCategory(model)?.id ?? ""), model,
  })), ...assets.map(asset => ({ ...asset, model: undefined }))].flatMap(item => {
    const anchor = menu.connector;
    const icon = cardIcon(item.node, catalog);
    if (!anchor) return [{ key: item.label + item.detail, label: item.label, detail: item.detail, icon, run: () => create(item.node, menu.at) }];
    const modes = item.model?.fields.find(field => field.name === "mode")?.choices ?? [];
    const variants = anchor.side === "source" && "capability" in item.node && modes.length
      ? modes.map(mode => ({ node: { ...item.node, inputs: { mode: { value: mode } } }, mode }))
      : [{ node: item.node, mode: undefined }];
    return variants.flatMap(({ node, mode }) => connectionOptions(anchor, node, { ...board, nodes: [...board.nodes, node] })
      .map(({ command, label, detail }, index) => ({
        key: `${item.label}/${mode ?? ""}/${index}`, label: item.label,
        detail: [mode && fieldLabel(mode), label, detail].filter(Boolean).join(" / "), icon,
        run: () => create(node, menu.at, { anchor, command }),
      })));
  }) : [];
  async function importFiles(files: File[], at?: XYPosition) {
    if (!files.length || importing) return;
    setImporting(true);
    const entries = await Promise.allSettled(files.map(file => importMedia(file)));
    try {
      const failures = entries.flatMap(item => item.status === "rejected" ? [String(item.reason)] : []);
      const references = entries.flatMap(item => item.status === "fulfilled" ? [item.value] : []);
      if (at && references.length) {
        const occupied = obstacles();
        const commands: CanvasCommand[] = references.map((media, index) => {
          const node = { id: newId(), media };
          const placement = placeFrom({ ...at, x: at.x + index * 24, y: at.y + index * 24, ...nodeSize(node, catalog) }, occupied);
          occupied.push({ ...placement, id: media.path });
          return { kind: "node.add", node, placement };
        });
        await commit(commands);
        const ids = commands.flatMap(command => command.kind === "node.add" ? [command.node.id] : []);
        setPicked(ids); setInspecting(ids.length === 1 ? ids[0] : undefined); setLocating({ ids, fresh: true, origin: view.origin() });
      }
      await refresh();
      setRail(at ? undefined : "media");
      if (failures.length) notify(failures.join("\n"), true);
    } catch (error) { report(error); }
    finally { setImporting(false); }
  }

  function dropMedia(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.files.length && !busy && !importing) {
      event.preventDefault();
      void importFiles(Array.from(event.dataTransfer.files), pointOf(event.clientX, event.clientY));
      return;
    }
    const path = event.dataTransfer.getData(mediaDragType);
    if (!path || busy || !assets.some(asset => asset.node.media.path === path)) return;
    event.preventDefault();
    const existing = board.nodes.find(node => "media" in node && node.media.path === path);
    const point = pointOf(event.clientX, event.clientY);
    if (existing) void commit([{ kind: "node.move", node: existing.id, ...rounded(point) }], revision).then(() => focus(existing.id)).catch(() => {});
    else create({ id: newId(), media: { path } }, point);
  }

  function copy() {
    if (!selectedIds.length) return;
    clipboard.current = { nodes: board.nodes.filter(node => selectedIds.includes(node.id)), layouts: board.layout };
  }
  function paste() {
    const source = clipboard.current;
    if (!source || busy) return;
    const copies = new Map(source.nodes.map(node => [node.id, newId()]));
    const frame = bounds(source.nodes.map(node => ({ ...nodeSize(node, catalog), ...source.layouts[node.id]! })));
    if (!frame) return;
    const offset = pasteOffset(frame, obstacles()), origin = view.origin();
    const commands: CanvasCommand[] = source.nodes.map(node => {
      const id = copies.get(node.id)!;
      const placement = source.layouts[node.id]!;
      const copyNode: CanvasNode = "media" in node ? { ...node, id } : { ...node, id,
        inputs: Object.fromEntries(Object.entries(node.inputs).map(([field, binding]) => {
          const remap = (value: CanvasValue) =>
            "from" in value ? { ...value, from: { ...value.from, node: copies.get(value.from.node) ?? value.from.node } } : value;
          return [field, "items" in binding ? { items: binding.items.map(remap) } : remap(binding)];
        })) };
      return { kind: "node.add", node: copyNode, placement: { ...placement, x: placement.x + offset.x, y: placement.y + offset.y } };
    });
    void commit(commands, revision).then(() => {
      const ids = [...copies.values()];
      setPicked(ids); setInspecting(ids.length === 1 ? ids[0] : undefined);
      setLocating({ ids, origin, fresh: true });
    }).catch(() => {});
  }

  const modifier = /Mac|iPhone|iPad/u.test(navigator.platform) ? "⌘" : "Ctrl";
  const visibleIds = nodes.filter(node => !node.hidden).map(node => node.id);
  const zoomCommands: ZoomCommand[] = [
    { id: "in", label: t("Zoom in", "放大视图"), shortcut: modifier + " +", run: () => view.zoomBy(zoomStep) },
    { id: "out", label: t("Zoom out", "缩小视图"), shortcut: modifier + " -", run: () => view.zoomBy(1 / zoomStep) },
    { id: "fit", label: t("Fit canvas", "适配画布"), shortcut: "⇧ 1", disabled: !visibleIds.length, run: () => view.fit(visibleIds) },
    { id: "selected", label: t("Zoom to selection", "缩放至选中项"), shortcut: "⇧ 2", disabled: !selectedIds.length, run: () => view.fit(selectedIds) },
    ...[50, 100, 200].map(percent => ({ id: String(percent), label: t("Zoom to", "缩放至") + ` ${percent}%`,
      shortcut: percent === 100 ? modifier + " 1" : "", separatorBefore: percent === 50, run: () => view.zoomTo(percent / 100) })),
  ];
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      bypassSnap.current = event.altKey;
      if (event.defaultPrevented || (event.target as Element | null)?.closest("input, textarea, [contenteditable], [role=menu], dialog")) return;
      const meta = event.metaKey || event.ctrlKey, key = event.key.toLowerCase();
      const run = (id: string) => { const action = zoomCommands.find(command => command.id === id); if (action && !action.disabled) { event.preventDefault(); action.run(); } };
      if (key === "escape") { setPick(undefined); setRail(undefined); if (!menu && !choices) clear(); }
      if (meta && ["=", "+"].includes(key)) run("in");
      if (meta && ["-", "_"].includes(key)) run("out");
      if (meta && event.code === "Digit1") run("100");
      if (!meta && event.shiftKey && event.code === "Digit1") run("fit");
      if (!meta && event.shiftKey && event.code === "Digit2") run("selected");
      if (busy || pick) return;
      if (meta && key === "z") { event.preventDefault(); void editHistory(event.shiftKey ? "redo" : "undo").catch(() => {}); }
      if (meta && key === "y") { event.preventDefault(); void editHistory("redo").catch(() => {}); }
      if (meta && key === "c" && selectedIds.length) { event.preventDefault(); copy(); }
      if (meta && key === "v" && clipboard.current) { event.preventDefault(); paste(); }
      if (meta && key === "a") { event.preventDefault(); setPicked(nodes.filter(node => !node.hidden && node.type === "object").map(node => node.id)); }
      if (key === "backspace" || key === "delete") {
        if (selectedWire) {
          const command = disconnect(board, selectedWire);
          if (command) { event.preventDefault(); void commit([command], revision).catch(() => {}); }
        } else if (selectedIds.length) { event.preventDefault(); setRemoving(selectedIds); }
      }
    };
    const keyup = (event: KeyboardEvent) => { bypassSnap.current = event.altKey; };
    const blur = () => { bypassSnap.current = false; };
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", blur); };
  });

  const creationCategories = [...categories, { id: "all", icon: Box, label: t("Components", "组件") }] as const;
  const selectedPlacement = () => {
    if (!object) return undefined;
    const name = nodeTitle(object, catalog.models);
    if ("media" in object) {
      const asset = catalog.media.entries.find(entry => entry.reference.path === object.media.path);
      return asset?.state === "available" ? { name, media: asset.reference, picture: asset.picture !== undefined, audio: asset.audio } : undefined;
    }
    for (const selection of Object.values(board.results[object.id]?.selected ?? {})) {
      const run = entries[object.id]?.find(item => item.address.environment === selection.address.environment
        && item.address.invocation === selection.address.invocation);
      const resource = run && "publication" in run && selection.resource
        ? run.publication?.outputs[selection.output]?.resources[selection.resource] : undefined;
      const source = publicationPlacement(name, object.id, selection, resource?.mediaType);
      if (source) return source;
    }
  };
  const placeSource = selectedPlacement();
  const filtered = (rail === "media" ? assets : cards.filter(({ model }) => rail === "all" || modelCategory(model)?.id === rail)
    .map(({ node, model }) => ({ node, label: model.title, detail: model.id.split("/").slice(0,2).join("/") })))
    .filter(item => (item.label + " " + item.detail).toLowerCase().includes(query.toLowerCase()));

  return <ConnectorMenuContext.Provider value={openConnector}><ConnectionPreviewContext.Provider value={previewEnd}>
    <section ref={section} className={`generation-canvas${pick ? " picking-reference" : ""}${connecting ? " is-connecting" : ""}`}
      aria-label={t("Generation canvas", "生成画布")}>
      <CanvasZoom target={section}/>
      <div className="graph-body">
        <nav className="graph-create-rail" aria-label={t("Create and media", "创建与素材")}>
          {creationCategories.map(item => <button type="button" key={item.id} disabled={busy} aria-label={t("Add", "添加") + " " + item.label}
            title={item.label} aria-pressed={rail === item.id} onClick={() => { setRail(rail === item.id ? undefined : item.id); setQuery(""); }}>
            <item.icon size={20}/><span>{item.label}</span>
          </button>)}
          <div className="graph-rail-divider"/>
          <button type="button" aria-label={t("Media", "素材")} aria-pressed={rail === "media"} onClick={() => { setRail(rail === "media" ? undefined : "media"); setQuery(""); }}>
            <Images size={20}/><span>{t("Media", "素材")}</span>
          </button>
          <button type="button" aria-label={t("Import", "导入")} disabled={importing || busy} onClick={() => fileInput.current?.click()}>
            <Upload size={20}/><span>{t("Import", "导入")}</span>
          </button>
          <input ref={fileInput} type="file" accept="image/*,video/*,audio/*" multiple hidden onChange={event => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void importFiles(files);
          }}/>
        </nav>
        <AnimatePresence>{rail && <motion.aside key={rail} className="graph-library nowheel" style={{ transformOrigin: "0% 50%" }} {...popupMotion(reduced, .8)}>
          <div className="graph-library-heading"><strong>{rail === "media" ? t("Project Media", "项目素材") : creationCategories.find(item => item.id === rail)?.label}</strong>
            <IconButton label={t("Close", "关闭")} onClick={() => setRail(undefined)}><X size={15}/></IconButton></div>
          <div className="graph-catalog-panel"><div className="graph-catalog-search"><input value={query} onChange={event => setQuery(event.target.value)}
            aria-label={t("Search components or models", "搜索组件或模型")} placeholder={rail === "media" ? t("Search media", "搜索素材") : t("Search components or models", "搜索组件或模型")}/></div>
            <div className="graph-catalog">{filtered.map(item => <button type="button" disabled={busy} key={item.label + item.detail}
              draggable={"media" in item.node} onDragStart={event => { if ("media" in item.node) event.dataTransfer.setData(mediaDragType, item.node.media.path); }}
              onClick={() => {
                const media = "media" in item.node ? item.node.media.path : undefined;
                const existing = media && board.nodes.find(node => "media" in node && node.media.path === media);
                if (existing) { setRail(undefined); focus(existing.id); }
                else create(item.node, centre(), { centered: true });
              }}>
              {"media" in item.node && <MediaThumbnail path={item.node.media.path} title={item.label}/>}
              <span className="canvas-catalog-title"><strong>{item.label}</strong><small>{item.detail}</small></span><Plus size={15}/>
            </button>)}
              {!filtered.length && <p className="library-empty">{t("No matches", "没有匹配项")}</p>}
            </div>
          </div>
        </motion.aside>}</AnimatePresence>
        <div className="graph-surface" ref={stage} onDragOver={event => { if ((event.dataTransfer.types.includes(mediaDragType) || event.dataTransfer.types.includes("Files"))) event.preventDefault(); }} onDrop={dropMedia}>
          <AnimatePresence>{tracing && <motion.div className="graph-navigation" {...enterMotion(reduced)}>
            <IconButton label={t("All objects", "全部对象")} onClick={() => setTrace(undefined)}><ArrowLeft size={15}/></IconButton>
            <span className="graph-trace-title"><GitBranch size={14}/>{nodeTitle(byId.get(trace!)!, catalog.models)}</span>
          </motion.div>}</AnimatePresence>
          <div className="graph-toolbar">
            <ObjectSearch nodes={pick ? board.nodes.filter(mayPick) : board.nodes} catalog={catalog}
              choose={id => { if (pick) chooseOnCanvas(byId.get(id)!); else { setRail(undefined); focus(id); } }}/>
            <div className="graph-history">
              <IconButton label={t("Undo", "撤销")} disabled={!canUndo || busy} onClick={() => void editHistory("undo").catch(() => {})}><Undo2 size={16}/></IconButton>
              <IconButton label={t("Redo", "重做")} disabled={!canRedo || busy} onClick={() => void editHistory("redo").catch(() => {})}><Redo2 size={16}/></IconButton>
              <Menu.Root modal={false}>
                <Menu.Trigger className="icon-button" aria-label={t("View options", "视图选项")}><SlidersHorizontal size={16}/></Menu.Trigger>
                <Menu.Portal><Menu.Positioner className="dropdown-positioner" sideOffset={8} align="end" collisionPadding={12}>
                  <Menu.Popup className="dropdown-content dropdown-menu">
                    <Menu.CheckboxItem className="dropdown-item" checked={snap} onCheckedChange={setSnap}>{t("Snap to objects", "吸附到对象")}</Menu.CheckboxItem>
                    <Menu.Item className="dropdown-item" onClick={() => void refresh()}><RefreshCw size={14}/>{t("Refresh", "重载")}</Menu.Item>
                  </Menu.Popup></Menu.Positioner></Menu.Portal>
              </Menu.Root>
            </div>
          </div>
          <ReactFlow<FlowNode, ReferenceCanvasEdge>
            proOptions={{ hideAttribution: true }}
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} connectionLineComponent={ConnectionPreview}
            onInit={value => { flow.current = value; setFlowReady(true); }} defaultViewport={initial.viewport ?? { x: 0, y: 0, zoom: 1 }}
            minZoom={minZoom} maxZoom={maxZoom} panOnScroll panOnScrollSpeed={1} zoomOnScroll={false} zoomOnPinch={false}
            zoomOnDoubleClick={false} zoomActivationKeyCode={null} panActivationKeyCode="Space" autoPanOnNodeDrag={false}
            autoPanOnConnect={false} autoPanOnNodeFocus={false} elevateNodesOnSelect={false} selectionMode={SelectionMode.Partial}
            selectionKeyCode="Shift" panOnDrag={tool === "select" ? [1] : [0, 1]} selectionOnDrag={tool === "select" && !pick}
            elementsSelectable={tool === "select" && !pick} multiSelectionKeyCode={multiSelection} deleteKeyCode={null}
            nodesDraggable={!busy && !pick && tool === "select"} nodeDragThreshold={4} nodeClickDistance={4}
            connectOnClick={false} connectionRadius={0} onNodesChange={positions}
            onNodeDragStart={(_event, node) => beginMove(node)} onNodeDrag={(_event, node) => moveGroup(node)}
            onNodeDragStop={(_event, _node, changed) => finishMove(changed)}
            onSelectionDragStart={(_event, changed) => { if (changed[0]) beginMove(changed[0]); }}
            onSelectionDragStop={(_event, changed) => finishMove(changed)}
            onNodeClick={(_event, node) => {
              if (node.type !== "object") return;
              if (pick) { chooseOnCanvas(node.data.node); return; }
              if (tool === "select") { setInspecting(node.id); setWire(undefined); view.activate(node.id, 76); }
            }}
            onNodeDoubleClick={(_event, node) => { if (node.type === "object" && !pick) traceInputs(node.id); }}
            onDoubleClick={openPane} onPaneContextMenu={openPane} onPaneClick={() => { if (!pick) clear(); }}
            onMoveEnd={(_event, next) => { viewport.current = next; storeView(next); }}
            onConnectStart={(event, { nodeId, handleType }) => { if (nodeId && handleType) startConnector(event, { id: nodeId, side: handleType }); }}
            onConnectEnd={endConnector}
            onEdgeClick={(_event, edge) => { const link = links.find(link => wireId(link) === edge.id); if (link) { focus(link.target); setWire(edge.id); } }}>
            <CanvasDots/><ArrivalLayer/><FlowLayer/><SnapGuides guides={guides}/>
            {menu?.start && menu.connector && <ViewportPortal><PendingConnection from={menu.start} to={menu.at} side={menu.connector.side}/></ViewportPortal>}
          </ReactFlow>
          <div className="graph-navigation-controls">
            <IconButton label={tool === "select" ? t("Switch to hand tool", "切换到抓手工具") : t("Switch to select tool", "切换到选择工具")}
              aria-pressed={tool === "hand"} onClick={() => setTool(tool === "select" ? "hand" : "select")}>
              {tool === "select" ? <MousePointer2 size={16}/> : <Hand size={16}/>}
            </IconButton>
            <span className="graph-dock-divider" aria-hidden="true"/>
            <ZoomControl label={t("Zoom options", "缩放选项")} commands={zoomCommands} onZoomTo={percent => view.zoomTo(percent / 100)}/>
          </div>
        </div>
        <AnimatePresence>{selectedIds.length > 1 && !pick && <motion.div className="graph-selection-tools" {...enterMotion(reduced)}>
          <button type="button" className="button" onClick={() => setGroupName(t("Group", "分组"))}><Group size={15}/>{t("Group", "组合")}</button>
          {!!selectedRecipes.length && <button type="button" className="button" disabled={busy} onClick={() => setBatch(selectedRecipes)}>{t("Batch generate", "批量生成")}</button>}
          <IconButton label={t("Copy", "复制")} onClick={copy}><Copy size={15}/></IconButton>
          <IconButton label={t("Delete objects", "删除对象")} disabled={busy} onClick={() => setRemoving(selectedIds)}><Trash2 size={15}/></IconButton>
        </motion.div>}</AnimatePresence>
        <AnimatePresence>{pick && <motion.div {...enterMotion(reduced)} className="graph-reference-picking" role="status">
          <MousePointer2 size={15}/><span>{t("Select a reference on the canvas", "选择画布上的参考素材")}</span>
          <button type="button" className="button" onClick={() => setPick(undefined)}>{t("Cancel", "取消")}</button>
        </motion.div>}</AnimatePresence>
        <AnimatePresence>{menu && <AddNodeMenu key="new" x={menu.x} y={menu.y} title={menu.process ? t("Process output", "处理输出") : menu.connector ? t("Add node", "添加节点") : t("New node", "新建节点")} filterable={menu.process ?? false}
          items={menuItems} empty={t("Nothing to add", "没有可添加的项")} onClose={() => setMenu(undefined)}/>}
          {choices && <AddNodeMenu key="choices" x={choices.x} y={choices.y} title={choices.title} items={choices.items} empty=""
            onClose={() => { choices.cancelled?.(); setChoices(undefined); }}/>}</AnimatePresence>
        {!pick && object && selectedIds.length === 1 && <NodeActions nodeId={object.id} hidden={dragging === object.id || connecting}>
          <button type="button" className="graph-node-action text" onClick={() => traceInputs(object.id)}><GitBranch size={16}/><span>{t("Trace inputs", "追溯输入")}</span></button>
          <hr className="graph-node-action-divider"/>
          {outputsFor(object, catalog).length > 0 && <IconButton className="graph-node-action" label={t("Process output", "处理输出")}
            disabled={busy} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); openConnector(object.id, "source", rect.left, rect.bottom, true); }}>
            <Workflow size={16}/>
          </IconButton>}
          {placeSource && <IconButton className="graph-node-action" label={t("Add to editing", "加入剪辑")} disabled={busy}
            onClick={() => setPlacing(placeSource)}><Film size={16}/></IconButton>}
          <IconButton className="graph-node-action" label={t("Delete object", "删除对象")} disabled={busy} onClick={() => setRemoving([object.id])}><Trash2 size={16}/></IconButton>
        </NodeActions>}
        <AnimatePresence>{!pick && !connecting && object && selectedIds.length <= 1 && <Composer key={object.id}
          node={object} catalog={catalog} board={board} revision={revision} entries={entries[object.id] ?? []} refresh={refreshRuns} busy={busy}
          close={clear} locate={focus} pick={setPick} wire={selectedWire} onPlace={setPlacing}/>}</AnimatePresence>
      </div>
      {groupName !== undefined && <Dialog title={t("Group objects", "组合对象")} close={() => setGroupName(undefined)}>
        <form className="canvas-dialog-form" onSubmit={event => {
          event.preventDefault();
          if (!groupName.trim()) return;
          setGroups(current => [...current.map(group => ({ ...group, members: group.members.filter(id => !selectedIds.includes(id)) })).filter(group => group.members.length),
            { id: "group-" + crypto.randomUUID(), name: groupName.trim(), members: selectedIds, collapsed: false }]);
          setGroupName(undefined); clear();
        }}>
          <label>{t("Group name", "分组名称")}<input autoFocus value={groupName} onChange={event => setGroupName(event.target.value)}/></label>
          <button type="submit" className="button primary" disabled={!groupName.trim()}>{t("Save", "保存")}</button>
        </form>
      </Dialog>}
      {removing && <RemoveObjectsDialog ids={removing} board={board} catalog={catalog} revision={revision} busy={busy}
        close={() => setRemoving(undefined)} onRemoved={() => { clear(); setRemoving(undefined); }}/>}
      {placing && <PlaceMediaDialog source={placing} close={() => setPlacing(undefined)}/>}
      {batch && <GenerateDialog nodes={batch} catalog={catalog} done={refreshRuns} close={() => setBatch(undefined)}/>}
    </section>
  </ConnectionPreviewContext.Provider></ConnectorMenuContext.Provider>;
}
