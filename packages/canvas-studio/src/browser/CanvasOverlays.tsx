import { fadeMotion, popupMotion } from './motion.js';
import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Background, BackgroundVariant, NodeToolbar, Position, ViewportPortal, useStore } from '@xyflow/react';
import type { LucideIcon } from 'lucide-react';
import type { SnapGuide } from './snapping.js';

const zoomOf = (state: { transform: [number, number, number] }) => state.transform[2];

/** Chrome that keeps its screen size reads `--canvas-counter-scale` (1/zoom) and `--canvas-stroke-world` (1px on screen). */
export function CanvasZoom({ target }: { target: RefObject<HTMLElement | null> }) {
  const zoom = useStore(zoomOf);
  useLayoutEffect(() => {
    target.current?.style.setProperty('--canvas-counter-scale', String(1 / zoom));
    target.current?.style.setProperty('--canvas-stroke-world', `${1 / zoom}px`);
  }, [target, zoom]);
  return null;
}

/** Dots every 18 canvas units, each one screen pixel across. */
export function CanvasDots() {
  const zoom = useStore(zoomOf);
  return <Background variant={BackgroundVariant.Dots} color="var(--canvas-dot)" gap={18} size={1 / zoom}/>;
}

/** Dashed guides along aligned edges: one screen pixel wide. */
export function SnapGuides({ guides }: { guides: SnapGuide[] }) {
  const zoom = useStore(zoomOf);
  if (!guides.length) return null;
  const width = 1 / zoom;
  return <ViewportPortal>{guides.map(guide => <div key={guide.id} className="graph-snap-guide" aria-hidden="true" style={guide.axis === 'x'
    ? { left: guide.coordinate - width / 2, top: guide.start, width, height: guide.end - guide.start, borderLeft: `${width}px dashed currentColor` }
    : { left: guide.start, top: guide.coordinate - width / 2, width: guide.end - guide.start, height: width, borderTop: `${width}px dashed currentColor` }}/>)}
  </ViewportPortal>;
}

export type AddNodeItem = { key: string; label: string; detail?: string; icon: LucideIcon; disabled?: boolean; separatorBefore?: boolean; run(): void };

/** The add-node menu opens with its corner at the point it was asked for, kept 8px inside the window. */
export function AddNodeMenu({ x, y, title, items, empty, onClose }: { x: number; y: number; title: string; items: AddNodeItem[]; empty: string; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const place = () => {
      element.style.left = `${Math.max(8, Math.min(x, document.documentElement.clientWidth - element.offsetWidth - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - element.offsetHeight - 8))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [x, y]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const rows = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not([aria-disabled=true])') ?? []);
      if (!rows.length) return;
      event.preventDefault(); event.stopPropagation();
      const index = rows.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? event.key === 'ArrowDown' ? 0 : rows.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[next]?.focus();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', key, true); };
  }, [onClose]);
  return createPortal(<motion.div ref={ref} role="menu" aria-label={title} className="graph-add-menu" style={{ left: x, top: y }}
    {...popupMotion(null)}>
    <div className="graph-add-menu-title">{title}</div>
    <div className="graph-add-menu-items">
      {items.map(item => <Fragment key={item.key}>{item.separatorBefore && <div role="separator" className="graph-add-menu-separator"/>}<div role="menuitem" tabIndex={item.disabled ? -1 : 0} aria-disabled={item.disabled || undefined} title={item.detail ?? item.label}
        className="graph-add-menu-item" onClick={() => { if (!item.disabled) item.run(); }}
        onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !item.disabled) { event.preventDefault(); item.run(); } }}>
        <item.icon size={16}/><span>{item.label}</span>
      </div></Fragment>)}
      {!items.length && <div role="menuitem" aria-disabled="true" className="graph-add-menu-item"><span>{empty}</span></div>}
    </div>
  </motion.div>, document.body);
}

/** Actions for the single selected node, centred 36px above its card. */
export function NodeActions({ nodeId, hidden, children }: { nodeId: string; hidden: boolean; children: ReactNode }) {
  return <NodeToolbar nodeId={nodeId} isVisible position={Position.Top} offset={36} className="graph-node-actions-host nodrag nopan">
    <motion.div className="graph-node-actions" role="toolbar" {...fadeMotion(hidden)}
      style={{ pointerEvents: hidden ? 'none' : undefined }}>{children}</motion.div>
  </NodeToolbar>;
}
