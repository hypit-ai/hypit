/**
 * The connector glyph follows the pointer inside the 60×120 hitbox around a card edge, eased with an 80ms time constant.
 * It stays between the card edge and 30px outside it, and returns 22px outside the edge when the pointer leaves.
 */
export type ConnectorSide = 'source' | 'target';

type Track = { pointerX: number; pointerY: number; targetX?: number | undefined; targetY?: number | undefined; currentX?: number | undefined; currentY?: number | undefined; frame?: number | undefined; lastAt?: number | undefined; sample: boolean };
const tracks = new WeakMap<HTMLElement, Track>();
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

export const connectorDefault = (side: ConnectorSide) => ({ x: side === 'source' ? 52 : 8, y: 60 });

function place(element: HTMLElement, x: number, y: number) {
  element.style.setProperty('--connector-x', `${Number(x.toFixed(2))}px`);
  element.style.setProperty('--connector-y', `${Number(y.toFixed(2))}px`);
}

export function followConnector(element: HTMLElement, side: ConnectorSide, clientX: number, clientY: number) {
  let track = tracks.get(element);
  if (!track) { track = { pointerX: clientX, pointerY: clientY, sample: true }; tracks.set(element, track); }
  else { track.pointerX = clientX; track.pointerY = clientY; track.sample = true; }
  element.dataset.connectorTracking = 'true';
  if (track.frame !== undefined) return;
  const step = (now: number) => {
    const state = tracks.get(element);
    if (!state || !element.isConnected) { tracks.delete(element); return; }
    state.frame = undefined;
    if (state.sample) {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) { tracks.delete(element); return; }
      const x = (state.pointerX - bounds.left) / bounds.width * 60, y = (state.pointerY - bounds.top) / bounds.height * 120;
      state.targetX = side === 'source' ? clamp(x, 30, 90) : clamp(x, -30, 30);
      state.targetY = clamp(y, 0, 120);
      state.sample = false;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { place(element, state.targetX!, state.targetY!); tracks.delete(element); return; }
    if (state.currentX === undefined || state.currentY === undefined) ({ x: state.currentX, y: state.currentY } = connectorDefault(side));
    const elapsed = state.lastAt === undefined ? 1000 / 60 : clamp(now - state.lastAt, 0, 64);
    state.lastAt = now;
    const ease = 1 - Math.exp(-elapsed / 80);
    state.currentX! += (state.targetX! - state.currentX!) * ease;
    state.currentY! += (state.targetY! - state.currentY!) * ease;
    if (Math.abs(state.targetX! - state.currentX!) <= .05 && Math.abs(state.targetY! - state.currentY!) <= .05) {
      state.currentX = state.targetX; state.currentY = state.targetY; state.lastAt = undefined;
      place(element, state.currentX!, state.currentY!);
      return;
    }
    place(element, state.currentX!, state.currentY!);
    state.frame = requestAnimationFrame(step);
  };
  track.frame = requestAnimationFrame(step);
}

export function releaseConnector(element: HTMLElement, side: ConnectorSide) {
  const track = tracks.get(element);
  if (track?.frame !== undefined) cancelAnimationFrame(track.frame);
  tracks.delete(element);
  delete element.dataset.connectorTracking;
  const { x, y } = connectorDefault(side);
  place(element, x, y);
}
