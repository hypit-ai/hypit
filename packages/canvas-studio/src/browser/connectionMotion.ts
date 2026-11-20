/** A connection target leans toward the pointer while a connection hovers it, then bounces on accept or shakes on reject. */
export type SurfaceMotion = { rotateX: number; rotateY: number; rotateZ: number; scale: number; x: number; y: number; z: number };

export const restMotion: SurfaceMotion = Object.freeze({ rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1, x: 0, y: 0, z: 0 });

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
const fixed = (value: number, digits: number) => Number(value.toFixed(digits)).toString();

/** The pose for a pointer over `bounds`: up to 7.5° around Y, 6.5° around X, lifted 22px toward the viewer. */
export function pointerMotion(bounds: DOMRect, clientX: number, clientY: number): SurfaceMotion {
  const t = clamp((clientX - (bounds.left + bounds.width / 2)) / (bounds.width / 2), -1, 1);
  const n = clamp((clientY - (bounds.top + bounds.height / 2)) / (bounds.height / 2), -1, 1);
  return { rotateX: -6.5 * n, rotateY: 7.5 * t, rotateZ: -t * n * 1.5, scale: 1.024, x: 7 * t, y: 6 * n, z: 22 };
}

export function motionTransform(motion: SurfaceMotion) {
  return `perspective(760px) translate3d(${fixed(motion.x, 3)}px, ${fixed(motion.y, 3)}px, ${fixed(motion.z, 3)}px) rotateX(${fixed(motion.rotateX, 3)}deg) rotateY(${fixed(motion.rotateY, 3)}deg) rotateZ(${fixed(motion.rotateZ, 3)}deg) scale(${fixed(motion.scale, 4)})`;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The element motion duration: confirmation runs twice it and the head shake four times. */
const elementDuration = 200, softEasing = 'cubic-bezier(.4,0,.2,1)';

function clearSurface(surface: HTMLElement) {
  delete surface.dataset.connectionReceiving;
  surface.style.removeProperty('transform');
  surface.style.removeProperty('transform-origin');
  surface.style.removeProperty('transition');
  surface.style.removeProperty('will-change');
}

export class ReceivingMotion {
  private surface: HTMLElement | null = null;
  private current: SurfaceMotion = restMotion;
  private target: SurfaceMotion = restMotion;
  private settling = false;
  private frame: number | null = null;
  private pointer: { x: number; y: number } | null = null;

  /** Follows the pointer over `surface`, or settles the current surface back to rest when `surface` is null. */
  track(surface: HTMLElement | null, clientX: number, clientY: number) {
    if (surface !== this.surface) {
      if (this.surface) clearSurface(this.surface);
      this.surface = surface;
      this.current = restMotion;
    }
    if (!surface) return;
    if (reducedMotion()) { surface.dataset.connectionReceiving = 'true'; return; }
    this.settling = false;
    this.pointer = { x: clientX, y: clientY };
    this.schedule();
  }

  /** Lets the current surface ease back to rest. */
  settle() {
    if (!this.surface) return;
    this.settling = true;
    this.pointer = null;
    this.target = restMotion;
    delete this.surface.dataset.connectionReceiving;
    this.schedule();
  }

  /** Stops tracking and returns the transform the surface shows now, so a terminal animation can start from it. */
  release(): { surface: HTMLElement; transform: string } | null {
    const surface = this.surface;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (!surface) return null;
    const transform = motionTransform(this.current);
    this.surface = null;
    this.current = restMotion;
    this.target = restMotion;
    delete surface.dataset.connectionReceiving;
    return { surface, transform };
  }

  cancel() {
    const released = this.release();
    if (released) clearSurface(released.surface);
  }

  private schedule() {
    if (this.frame === null) this.frame = requestAnimationFrame(this.advance);
  }

  private advance = () => {
    this.frame = null;
    const surface = this.surface;
    if (!surface) return;
    if (this.pointer && !this.settling) this.target = pointerMotion(surface.getBoundingClientRect(), this.pointer.x, this.pointer.y);
    const rotate = this.settling ? .24 : .2, scale = this.settling ? .24 : .18, move = this.settling ? .22 : .18, depth = this.settling ? .2 : .16;
    const from = this.current, to = this.target;
    this.current = {
      rotateX: from.rotateX + (to.rotateX - from.rotateX) * rotate,
      rotateY: from.rotateY + (to.rotateY - from.rotateY) * rotate,
      rotateZ: from.rotateZ + (to.rotateZ - from.rotateZ) * rotate,
      scale: from.scale + (to.scale - from.scale) * scale,
      x: from.x + (to.x - from.x) * move,
      y: from.y + (to.y - from.y) * move,
      z: from.z + (to.z - from.z) * depth,
    };
    if (this.settling) delete surface.dataset.connectionReceiving;
    else surface.dataset.connectionReceiving = 'true';
    surface.style.transform = motionTransform(this.current);
    surface.style.transformOrigin = 'center';
    surface.style.transition = 'none';
    surface.style.willChange = 'transform';
    const c = this.current, t = this.target;
    const done = Math.abs(c.x - t.x) <= .08 && Math.abs(c.y - t.y) <= .08 && Math.abs(c.z - t.z) <= .08 && Math.abs(c.rotateX - t.rotateX) <= .08
      && Math.abs(c.rotateY - t.rotateY) <= .08 && Math.abs(c.rotateZ - t.rotateZ) <= .08 && Math.abs(c.scale - t.scale) <= .002;
    if (done && this.settling) { clearSurface(surface); this.surface = null; this.current = restMotion; this.settling = false; return; }
    if (!done || this.pointer) this.schedule();
  };
}

/** A held target returns to rest without feedback, when the connection is abandoned. */
export function settleSurface(surface: HTMLElement, from = motionTransform(restMotion)) {
  if (reducedMotion() || typeof surface.animate !== 'function') { clearSurface(surface); return; }
  surface.animate([{ transform: from }, { transform: motionTransform(restMotion) }], { duration: elementDuration, easing: softEasing }).onfinish = () => clearSurface(surface);
}

/** The target presses down 10px to 95% and springs back; 400ms. */
export function confirmConnection(surface: HTMLElement, from = motionTransform(restMotion)) {
  if (reducedMotion() || typeof surface.animate !== 'function') { clearSurface(surface); return; }
  const pressed = `${from} translateY(10px) scale(0.95)`;
  surface.animate([{ transform: from }, { offset: .3, transform: pressed }, { offset: .6, transform: from }, { transform: motionTransform(restMotion) }],
    { duration: 2 * elementDuration, easing: softEasing }).onfinish = () => clearSurface(surface);
}

/** The target shakes -3°, 6°, -3° and returns; 800ms. */
export function rejectConnection(surface: HTMLElement, from = motionTransform(restMotion)) {
  if (reducedMotion() || typeof surface.animate !== 'function') { clearSurface(surface); return; }
  surface.animate([{ transform: from }, { offset: .222, transform: `${from} rotateZ(-3deg)` }, { offset: .497, transform: `${from} rotateZ(6deg)` },
    { offset: .751, transform: `${from} rotateZ(-3deg)` }, { transform: motionTransform(restMotion) }],
    { duration: 4 * elementDuration, easing: softEasing }).onfinish = () => clearSurface(surface);
}
