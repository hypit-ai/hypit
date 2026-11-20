import { useEffect, useRef } from 'react';
import { useStoreApi } from '@xyflow/react';

/**
 * Connections that are active draw a sweep: a bright segment that travels from source to target every 2.6s.
 * Its core widens to 2px in the middle; a soft glow surrounds it.
 */
export const flowStroke = '#DE3C66';

type Listener = () => void;
const entries = new Map<string, string>();
const listeners = new Set<Listener>();

/** Registers a bezier path in canvas coordinates under `id`, or removes it when `path` is undefined. */
export function setFlowEntry(id: string, path: string | undefined) {
  if (path === undefined ? !entries.delete(id) : entries.get(id) === path) return;
  if (path !== undefined) entries.set(id, path);
  for (const listener of listeners) listener();
}

function bezier(path: string) {
  const values = path.replace(/[MC,]/g, ' ').trim().split(/\s+/).map(Number);
  return values.length === 8 && values.every(Number.isFinite) ? values as [number, number, number, number, number, number, number, number] : null;
}

const loop = 2600;

export function FlowLayer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const store = useStoreApi();
  useEffect(() => {
    const element = canvas.current, context = element?.getContext('2d');
    if (!element || !context) return;
    let frame: number | null = null;
    const draw = (now: number) => {
      frame = null;
      const { transform: [panX, panY, zoom], width, height } = store.getState();
      const ratio = window.devicePixelRatio || 1;
      if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
        element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      if (!entries.size) return;
      const progress = (now % loop) / loop;
      context.lineCap = 'round';
      for (const path of entries.values()) {
        const curve = bezier(path);
        if (!curve) continue;
        const [x0, y0, x1, y1, x2, y2, x3, y3] = curve;
        const points: { x: number; y: number; d: number }[] = [];
        let length = 0;
        for (let index = 0; index <= 64; index++) {
          const t = index / 64, u = 1 - t;
          const x = (u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3) * zoom + panX;
          const y = (u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3) * zoom + panY;
          if (points.length) length += Math.hypot(x - points[points.length - 1]!.x, y - points[points.length - 1]!.y);
          points.push({ x, y, d: length });
        }
        const sweep = Math.min(Math.max(length * .55, 120), 312), head = progress * (length + sweep + 72), tail = head - sweep;
        for (let pass = 0; pass < 2; pass++) for (let index = 1; index < points.length; index++) {
          const a = points[index - 1]!, b = points[index]!;
          const from = Math.max(a.d, tail, 0), to = Math.min(b.d, head, length);
          if (to <= from) continue;
          const span = b.d - a.d || 1, s = ((from + to) / 2 - tail) / sweep;
          const p = (from - a.d) / span, q = (to - a.d) / span;
          context.beginPath();
          context.moveTo(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p);
          context.lineTo(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q);
          const core = 1 + Math.sin(Math.PI * Math.min(Math.max(s, 0), 1));
          if (pass === 0) { context.strokeStyle = 'rgba(222, 60, 102, .22)'; context.lineWidth = core + 3; }
          else { context.strokeStyle = flowStroke; context.lineWidth = core; }
          context.stroke();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    const start = () => { if (frame === null) frame = requestAnimationFrame(draw); };
    listeners.add(start);
    const unsubscribe = store.subscribe(start);
    start();
    return () => { listeners.delete(start); unsubscribe(); if (frame !== null) cancelAnimationFrame(frame); };
  }, [store]);
  return <canvas ref={canvas} className="graph-flow-layer" aria-hidden="true"/>;
}
