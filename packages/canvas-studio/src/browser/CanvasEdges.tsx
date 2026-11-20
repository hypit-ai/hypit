import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BaseEdge, Position, getBezierPath, type ConnectionLineComponentProps, type Edge, type EdgeProps } from '@xyflow/react';
import { flowStroke, setFlowEntry } from './FlowLayer.js';

export type ReferenceEdgeData = { endpointActive?: boolean };
export type ReferenceCanvasEdge = Edge<ReferenceEdgeData, 'reference'>;

/**
 * A reference reads at 16% until it becomes active: selected, attached to a selected node, or hovered.
 * Active references use the accent color; after 200ms of hover they also carry the sweep.
 */
export function ReferenceEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps<ReferenceCanvasEdge>) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: .25 });
  const [hovered, setHovered] = useState(false), [hoverSweep, setHoverSweep] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const endpoint = data?.endpointActive === true;
  const active = selected || endpoint || hovered, sweep = selected || endpoint || hoverSweep;
  useEffect(() => { setFlowEntry(`edge:${id}`, sweep ? path : undefined); }, [id, sweep, path]);
  useEffect(() => () => setFlowEntry(`edge:${id}`, undefined), [id]);
  return <g className={`graph-edge${hovered ? ' hovered' : ''}`}
    onPointerEnter={() => { setHovered(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setHoverSweep(true), 200); }}
    onPointerLeave={() => { window.clearTimeout(timer.current); setHovered(false); setHoverSweep(false); }}>
    <BaseEdge id={id} path={path} interactionWidth={20} className="graph-edge-path"
      style={{ stroke: active ? flowStroke : 'currentColor', strokeOpacity: active ? 1 : .16 }}/>
  </g>;
}

/** While a connection is drawn, its free end is pulled 38% toward the side of the node under the pointer. */
export const ConnectionPreviewContext = createContext<(x: number, y: number) => { x: number; y: number }>((x, y) => ({ x, y }));

const opposite: Record<Position, Position> = { [Position.Left]: Position.Right, [Position.Right]: Position.Left, [Position.Top]: Position.Bottom, [Position.Bottom]: Position.Top };

export function ConnectionPreview({ fromX, fromY, toX, toY, fromPosition }: ConnectionLineComponentProps) {
  const resolve = useContext(ConnectionPreviewContext);
  const end = resolve(toX, toY);
  const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, sourcePosition: fromPosition, targetX: end.x, targetY: end.y, targetPosition: opposite[fromPosition], curvature: .25 });
  useEffect(() => { setFlowEntry('preview', path); }, [path]);
  useEffect(() => () => setFlowEntry('preview', undefined), []);
  return <path className="graph-connection-path" d={path} fill="none" stroke={flowStroke}/>;
}

/** The line that stays from the anchor to the drop point while the add-node menu is open. */
export function PendingConnection({ from, to, side }: { from: { x: number; y: number }; to: { x: number; y: number }; side: 'source' | 'target' }) {
  const [path] = side === 'source'
    ? getBezierPath({ sourceX: from.x, sourceY: from.y, sourcePosition: Position.Right, targetX: to.x, targetY: to.y, targetPosition: Position.Left, curvature: .25 })
    : getBezierPath({ sourceX: to.x, sourceY: to.y, sourcePosition: Position.Right, targetX: from.x, targetY: from.y, targetPosition: Position.Left, curvature: .25 });
  useEffect(() => { setFlowEntry('pending', path); }, [path]);
  useEffect(() => () => setFlowEntry('pending', undefined), []);
  return <svg className="graph-pending-connection" aria-hidden="true"><path className="graph-connection-path" d={path} fill="none" stroke={flowStroke}/></svg>;
}
