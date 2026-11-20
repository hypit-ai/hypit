import { useEffect, useRef } from 'react';
import { useStoreApi } from '@xyflow/react';
import mark from './logo-mark.svg?raw';

/**
 * When a node is added, the background dots around its centre light up in the shape of the Hypit symbol: a ring
 * that widens over 680ms and a fainter ripple that spreads over 1250ms, both easing out. Lit dots grow slightly and
 * take the theme palette, shifting with their direction from the node.
 */
const listeners = new Set<(id: string) => void>();
export function announceArrival(id: string) { for (const listener of listeners) listener(id); }

// The symbol's silhouette is blurred by 40px into a 716 × 707 alpha mask, filling it around the node.
const maskWidth = 716, maskHeight = 707;
let mask: Uint8ClampedArray | null | undefined;
function symbolMask() {
  if (mask !== undefined) return mask;
  const path = /\sd="([^"]+)"/.exec(mark)?.[1], view = /viewBox="([^"]+)"/.exec(mark)?.[1]?.split(/\s+/).map(Number);
  const canvas = document.createElement('canvas'); canvas.width = maskWidth; canvas.height = maskHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!path || !view || view.length !== 4 || !context) return mask = null;
  const [left = 0, top = 0, width = 0, height = 0] = view, scale = Math.min(561 / width, 550 / height);
  context.filter = 'blur(40px)';
  context.fillStyle = context.strokeStyle = 'white';
  context.lineJoin = 'round';
  context.lineWidth = 24;
  context.setTransform(scale, 0, 0, scale, maskWidth / 2 - (left + width / 2) * scale, maskHeight / 2 - (top + height / 2) * scale);
  // The ring needs a solid silhouette: each contour is filled on its own and widened so the bands close up.
  for (const contour of path.split(/(?=M)/)) { const shape = new Path2D(contour); context.fill(shape); context.stroke(shape); }
  return mask = context.getImageData(0, 0, maskWidth, maskHeight).data;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const random = (x: number, y: number) => Math.abs(43758.5453 * Math.sin(x * 12.9898 + y * 78.233) % 1);

export function ArrivalLayer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const store = useStoreApi();
  useEffect(() => {
    const element = canvas.current, context = element?.getContext('2d');
    if (!element || !context) return;
    let arrival: { origin: { x: number; y: number }; startedAt: number; scale: number } | undefined;
    let frame: number | null = null, timer: ReturnType<typeof setTimeout> | undefined;
    const draw = (now: number) => {
      frame = null;
      const { transform: [panX, panY, zoom], width, height } = store.getState();
      const ratio = window.devicePixelRatio || 1;
      if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) { element.width = Math.round(width * ratio); element.height = Math.round(height * ratio); }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const data = symbolMask();
      if (!arrival || !data) return;
      const elapsed = Math.max(0, now - arrival.startedAt) / arrival.scale;
      if (elapsed >= 1250) { arrival = undefined; return; }
      const star = Math.min(1, elapsed / 680), ripple = Math.min(1, elapsed / 1250), origin = arrival.origin;
      const base = Math.min(width * .5, maskWidth);
      const intensity = (x: number, y: number, z: number, scale: number) => {
        const w = base * scale, u = (x - origin.x) / w + .5, v = (y - origin.y) / (w * maskHeight / maskWidth) + .5;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
        return (data[(maskWidth * Math.min(maskHeight - 1, Math.floor(maskHeight * v)) + Math.min(maskWidth - 1, Math.floor(maskWidth * u))) * 4 + 3]! / 255) ** .82 * (.9 + .14 * z);
      };
      const eStar = easeOut(star), eRipple = easeOut(ripple), burstScale = .62 + 1.42 * eStar, waveScale = .16 + 2.22 * eRipple;
      const burstAlpha = .24 * Math.sin(Math.PI * star), envelope = Math.sin(Math.PI * ripple);
      const reach = 2.4 * base, reachY = reach * maskHeight / maskWidth, gap = 18 * zoom;
      if (gap < 8) return;
      // Background dots sit half a gap off the canvas origin, half a pixel left and up.
      const offsetX = ((panX + gap / 2 - .5) % gap + gap) % gap, offsetY = ((panY + gap / 2 - .5) % gap + gap) % gap;
      const theme = getComputedStyle(element);
      const dot = theme.color, accent = theme.getPropertyValue('--pink');
      for (let row = Math.max(0, Math.floor((origin.y - reachY / 2 - offsetY) / gap)); row <= Math.min(Math.ceil((origin.y + reachY / 2 - offsetY) / gap), Math.floor((height - offsetY) / gap)); row++)
        for (let column = Math.max(0, Math.floor((origin.x - reach / 2 - offsetX) / gap)); column <= Math.min(Math.ceil((origin.x + reach / 2 - offsetX) / gap), Math.floor((width - offsetX) / gap)); column++) {
          const x = offsetX + column * gap, y = offsetY + row * gap, z = random((x - panX) / zoom, (y - panY) / zoom);
          const burst = 2.5 * Math.max(0, intensity(x, y, z, burstScale) - intensity(x, y, z, Math.max(.2, burstScale - .34))) + intensity(x, y, z, .72) * (1 - eStar) * .42;
          const pulse = 3.05 * Math.max(0, intensity(x, y, z, waveScale) - intensity(x, y, z, Math.max(.05, waveScale - .3)));
          const glow = intensity(x, y, z, .32) * (1 - eRipple), lit = Math.max(burst * burstAlpha, pulse * envelope);
          if (lit <= .012 && glow <= .001) continue;
          const alpha = .2 + .018 * z + burst * burstAlpha + pulse * (.38 + .62 * envelope) * (.86 + .2 * z) * .34 + .048 * glow;
          context.beginPath();
          context.arc(x, y, .5 + burst * Math.sin(Math.PI * star) * .28 + pulse * envelope * .26, 0, Math.PI * 2);
          context.fillStyle = lit > .012 ? accent : dot;
          context.globalAlpha = lit > .012 ? Math.min(alpha + .24 * lit, .78) : Math.min(alpha, .62);
          context.fill();
        }
      context.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    const begin = (id: string) => {
      clearTimeout(timer);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches, deadline = performance.now() + 1500;
      // The node needs to be measured before its centre is known; give up after 1.5s.
      const attempt = () => {
        const state = store.getState(), node = state.nodeLookup.get(id), [panX, panY, zoom] = state.transform;
        const width = node?.measured.width, height = node?.measured.height;
        if (!node || !width || !height) { if (performance.now() < deadline) timer = setTimeout(attempt, 16); return; }
        const position = node.internals.positionAbsolute;
        arrival = { origin: { x: panX + (position.x + width / 2) * zoom, y: panY + (position.y + height / 2) * zoom }, startedAt: performance.now(), scale: reduced ? .128 : 1 };
        if (frame === null) frame = requestAnimationFrame(draw);
      };
      timer = setTimeout(attempt, 120);
    };
    listeners.add(begin);
    return () => { listeners.delete(begin); clearTimeout(timer); if (frame !== null) cancelAnimationFrame(frame); };
  }, [store]);
  return <canvas ref={canvas} className="graph-arrival-layer" aria-hidden="true"/>;
}
