import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Handle, NodeResizeControl, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, Plus, Ungroup } from "lucide-react";
import type { CanvasNode, CanvasPlacement, CanvasSelection } from "@hypit/canvas";
import { followConnector, releaseConnector, type ConnectorSide } from "./connectorGlyph.js";
import { cardIcon, fieldLabel, MediaPreview, usePreview } from "./presentation.js";
import { t } from "./ui.js";
import { nodeTitle, type Catalog } from "./wiring.js";

type CardData = {
  node: CanvasNode;
  catalog: Catalog;
  accepts: boolean;
  supplies: boolean;
  result?: CanvasSelection | undefined;
  phase?: string | undefined;
  issue?: string | undefined;
  resizeStart: () => void;
  resizeFinish: (placement: CanvasPlacement) => void;
};
export type ObjectCanvasNode = Node<CardData, "object">;

export const ConnectorMenuContext = createContext<(id: string, side: ConnectorSide, x: number, y: number) => void>(() => {});

function Connector({ id, side }: { id: string; side: ConnectorSide }) {
  const open = useContext(ConnectorMenuContext);
  const down = useRef<{ x: number; y: number } | undefined>(undefined);
  const origin = side === "source";
  const label = origin ? t("Connect an output", "连接下游") : t("Connect an input", "连接上游");
  return <Handle type={side} position={origin ? Position.Right : Position.Left} id={origin ? "out" : "in"}
    className={`graph-connector ${side}`} aria-label={label} title={label}>
    <span className="graph-connector-hitbox" data-connector-side={side}
      onPointerDown={event => { down.current = { x: event.clientX, y: event.clientY }; }}
      onPointerMove={event => followConnector(event.currentTarget, side, event.clientX, event.clientY)}
      onPointerLeave={event => releaseConnector(event.currentTarget, side)}
      onClick={event => {
        const at = down.current;
        down.current = undefined;
        if (!at || Math.hypot(event.clientX - at.x, event.clientY - at.y) > 3) return;
        event.stopPropagation();
        open(id, side, event.clientX, event.clientY);
      }}><Plus className="canvas-connector-plus" size={12} aria-hidden="true"/></span>
  </Handle>;
}

export function ObjectNode({ id, data, selected }: NodeProps<ObjectCanvasNode>) {
  const { node, catalog } = data;
  const Icon = cardIcon(node, catalog);
  const title = nodeTitle(node, catalog.models);
  const details = "media" in node ? t("Project Media", "项目素材") : catalog.models.find(model => model.id === node.capability)?.title ?? node.capability;
  const media = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!media.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } });
    observer.observe(media.current);
    return () => observer.disconnect();
  }, []);
  const { resource, error } = usePreview(id, data.result, visible && ("media" in node || data.result !== undefined), "media" in node ? node.media.path : "");
  const updatePorts = useUpdateNodeInternals();
  useEffect(() => { updatePorts(id); }, [id, data.accepts, data.supplies, updatePorts]);
  return <article data-graph-node={id} className={`graph-object${selected ? " selected" : ""}${resource ? " graph-object-has-media" : ""}`}>
    <header><Icon size={16}/><span>{title}</span></header>
    <div className="canvas-object-content" ref={media}>
      {resource ? <div className="graph-object-media"><MediaPreview resource={resource} title={title}/></div>
        : <div className="graph-object-placeholder" title={error || undefined}><Icon size={24}/></div>}
    </div>
    {data.accepts && <Connector id={id} side="target"/>}
    {data.supplies && <Connector id={id} side="source"/>}
    <div className="graph-object-footer">
      <div className={`graph-node-status${data.phase ? " active" : ""}`} title={data.issue}>
        {data.phase && <span>{fieldLabel(data.phase)}</span>}<span className="graph-node-model">{details}</span>
      </div>
    </div>
    {selected && <NodeResizeControl className="canvas-object-resize" position="bottom-right" minWidth={160} minHeight={96}
      onResizeStart={data.resizeStart} onResizeEnd={(_, placement) => data.resizeFinish(placement)}/>}
  </article>;
}

export type CanvasGroup = { id: string; name: string; members: string[]; collapsed: boolean };
export type GroupNode = Node<{ group: CanvasGroup; toggle: () => void; remove: () => void }, "assembly">;

export function AssemblyNode({ data }: NodeProps<GroupNode>) {
  const { group, toggle, remove } = data;
  const Fold = group.collapsed ? ChevronRight : ChevronDown;
  return <div className="graph-assembly"><header>
    <button type="button" className="nodrag" onClick={toggle} aria-label={group.collapsed ? t("Expand group", "展开分组") : t("Collapse group", "折叠分组")}><Fold size={15}/></button>
    <span>{group.name}</span><small>{group.members.length}</small>
    <button type="button" className="nodrag" onClick={remove} aria-label={t("Ungroup", "解除分组")}><Ungroup size={14}/></button>
  </header>{group.collapsed && <>
    <Handle type="target" position={Position.Left} isConnectable={false}/>
    <Handle type="source" position={Position.Right} isConnectable={false}/>
  </>}</div>;
}
