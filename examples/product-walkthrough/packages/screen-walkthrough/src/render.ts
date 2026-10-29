import { sealVisualTrack } from "@hypit/composition";
import type { VisualElement } from "@hypit/composition";
import { htmlVisual } from "@hypit/html-program";
import type { SynchronizedMedia } from "@hypit/media";
import type { SpatialFrame } from "@hypit/spatial";
import type { TemporalWindow } from "@hypit/temporal";
import type { Timeline } from "@hypit/timeline";

export type WalkthroughOptions = {
  id: string;
  /** Camera magnification on each pointer action; 1 keeps the whole screen in view. */
  zoom: number;
  cursor: boolean;
  stackingOrder: number;
  /** `card`: the screen on a framed card with margin; `full`: the screen fills the Frame (cropped to cover). */
  layout: "card" | "full";
};

/** One recorded step as `hypit capture plan` writes it into steps.svs. */
export type WalkthroughStep = {
  index: number;
  action: string;
  /** Seconds on the recording's clock. */
  start: number;
  end: number;
  /** CSS pixels of the recorded page. */
  pointer?: [number, number];
  box?: [number, number, number, number];
};

export type WalkthroughTake = {
  viewport: { width: number; height: number; scale: number };
  steps: WalkthroughStep[];
};

/** `[frame, ...values]` keys, eased between neighbours; the page script samples them per frame. */
export type Keys = number[][];

export type WalkthroughMotion = {
  camera: Keys;
  cursor: Keys;
  presses: number[];
};

/** Actions the camera moves in for; a pause or wait leaves the whole screen in view. */
const FOCUS = new Set(["hover", "click", "dblclick", "fill", "type", "drag", "upload"]);
const PRESS = new Set(["click", "dblclick", "fill", "type", "drag", "upload"]);

/** Validate the Recipe written by `hypit capture plan`; a failed take is never presented as a demonstration. */
export function readWalkthroughTake(properties: Readonly<Record<string, unknown>>, path: string): WalkthroughTake {
  if (properties.passed !== true) throw new Error(`${path} is a failed take; record it again before presenting it.`);
  const viewport = properties.viewport as WalkthroughTake["viewport"] | undefined;
  if (!viewport || ![viewport.width, viewport.height, viewport.scale].every((n) => typeof n === "number" && n > 0)) {
    throw new Error(`${path}.viewport must have positive width, height and scale.`);
  }
  if (!Array.isArray(properties.steps)) throw new Error(`${path}.steps must be a list.`);
  const pair = (value: unknown, size: number) => Array.isArray(value) && value.length === size && value.every((n) => typeof n === "number");
  const steps = properties.steps.map((raw, i) => {
    const step = raw as WalkthroughStep;
    if (typeof step?.action !== "string" || typeof step.start !== "number" || typeof step.end !== "number" || step.end < step.start) {
      throw new Error(`${path}.steps.${i + 1} needs action, start and end seconds.`);
    }
    if (step.pointer !== undefined && !pair(step.pointer, 2)) throw new Error(`${path}.steps.${i + 1}.pointer must be [x, y].`);
    if (step.box !== undefined && !pair(step.box, 4)) throw new Error(`${path}.steps.${i + 1}.box must be [x, y, width, height].`);
    return step;
  });
  return { viewport, steps };
}

/**
 * Derive cursor travel, presses and camera framing from the recorded steps. Every value is a
 * Present-local frame, so the motion stays locked to the footage however the Window moves.
 * The pointer arrives where the recorder acted; the camera anticipates each action and lets go
 * after a pause, so a run of nearby actions pans instead of zooming in and out repeatedly.
 */
export function walkthroughMotion(take: WalkthroughTake, toFrame: (seconds: number) => number, zoom: number): WalkthroughMotion {
  const { width, height } = take.viewport;
  const travel = 14, settle = 6, lead = 12, hold = 24, ease = 18, join = 30;
  const center = [width / 2, height / 2];
  const pointed = take.steps.filter((step) => step.pointer !== undefined && FOCUS.has(step.action));
  const cursor: Keys = [];
  const presses: number[] = [];
  let last: number[] | undefined;
  for (const step of pointed) {
    const arrive = toFrame(step.start), [x, y] = step.pointer!;
    const depart = last === undefined ? arrive - travel : Math.max(last[0]! + 2, arrive - travel);
    // First appearance comes in from below and to the right of the first target.
    cursor.push([depart, ...(last === undefined ? [Math.min(width, x + 140), Math.min(height, y + 120)] : last.slice(1))]);
    cursor.push([Math.max(depart + 1, arrive), x, y]);
    if (PRESS.has(step.action)) presses.push(Math.min(toFrame(step.end), arrive + settle));
    last = cursor.at(-1)!;
  }

  const clamp = (value: number, size: number) => {
    const half = size / (2 * zoom);
    return Math.min(Math.max(value, half), size - half);
  };
  const camera: Keys = [[0, 1, center[0]!, center[1]!]];
  const push = (frame: number, scale: number, x: number, y: number) => {
    const previous = camera.at(-1)!;
    camera.push([Math.max(previous[0]!, Math.round(frame)), scale, x, y]);
  };
  if (zoom > 1) {
    type Group = { start: number; end: number; points: Array<{ arrive: number; x: number; y: number }> };
    const groups: Group[] = [];
    for (const step of pointed) {
      const arrive = toFrame(step.start), start = arrive - lead, end = toFrame(step.end) + hold;
      const point = { arrive, x: clamp(step.pointer![0], width), y: clamp(step.pointer![1], height) };
      const group = groups.at(-1);
      if (group !== undefined && start - group.end < join) { group.end = Math.max(group.end, end); group.points.push(point); }
      else groups.push({ start, end, points: [point] });
    }
    for (const group of groups) {
      const [first, ...rest] = group.points;
      push(group.start - ease, 1, center[0]!, center[1]!);
      push(group.start, zoom, first!.x, first!.y);
      let previous = first!;
      for (const point of rest) {
        push(point.arrive - travel, zoom, previous.x, previous.y);
        push(point.arrive, zoom, point.x, point.y);
        previous = point;
      }
      push(group.end, zoom, previous.x, previous.y);
      push(group.end + ease, 1, center[0]!, center[1]!);
    }
  }
  return { camera, cursor, presses };
}

/** Sample eased keys at a frame; the same function runs in the page script. */
export const SAMPLE_SOURCE = `function sample(keys, frame) {
  if (frame <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (frame < b[0]) {
      const t = b[0] === a[0] ? 1 : (frame - a[0]) / (b[0] - a[0]), e = t * t * (3 - 2 * t);
      return a.slice(1).map((value, j) => value + (b[j + 1] - value) * e);
    }
  }
  return keys[keys.length - 1].slice(1);
}`;

/**
 * A recorded product walkthrough on a framed screen card: the footage plays at its recorded pace
 * while a cursor, click ripples and a following camera are drawn from the take's steps.
 */
export function renderWalkthrough(timeline: Timeline, within: SpatialFrame, window: TemporalWindow,
  media: SynchronizedMedia, sourceWindow: TemporalWindow, take: WalkthroughTake, options: WalkthroughOptions) {
  if (window.start.timelineId !== timeline.id || sourceWindow.start.timelineId !== timeline.id) {
    throw new Error("Walkthrough timing must belong to its Timeline.");
  }
  if (!(options.zoom >= 1 && options.zoom <= 3)) throw new Error("Walkthrough zoom must be between 1 and 3.");
  if (media.visual === undefined) throw new Error("Walkthrough media has no visual stream.");
  if (media.frameDomain.frameCount !== sourceWindow.span.endFrameExclusive - sourceWindow.span.startFrame
    || media.frameDomain.frameRate.numerator !== timeline.frameRate.numerator
    || media.frameDomain.frameRate.denominator !== timeline.frameRate.denominator) {
    throw new Error("Walkthrough media requires an equal-length native source Window.");
  }
  const fps = timeline.frameRate.numerator / timeline.frameRate.denominator;
  // Recorded seconds → this Present's local frames, through the footage's own source Window.
  const toFrame = (seconds: number) => sourceWindow.span.startFrame + Math.round(seconds * fps) - window.span.startFrame;
  const motion = walkthroughMotion(take, toFrame, options.zoom);

  const clipStart = Math.max(sourceWindow.span.startFrame, window.span.startFrame);
  const clipEnd = Math.min(sourceWindow.span.endFrameExclusive, window.span.endFrameExclusive);
  const { width, height } = take.viewport;
  const videos: VisualElement[] = clipEnd <= clipStart ? [] : [{
    id: "take", parent: "scene", kind: "video", order: 1, artifact: media.visual.artifact, muted: true,
    style: [{ name: "position", value: "absolute" }, { name: "left", value: 0 }, { name: "top", value: 0 },
      { name: "width", value: `${width}px` }, { name: "height", value: `${height}px` }],
    sourceTime: { sourceFrameRate: timeline.frameRate, sourceFrameCount: media.frameDomain.frameCount,
      pieces: [{ target: { startFrame: clipStart - window.span.startFrame, endFrameExclusive: clipEnd - window.span.startFrame },
        sourceAtStart: { numerator: clipStart - sourceWindow.span.startFrame, denominator: 1 }, rate: { numerator: 1, denominator: 1 } }] },
  }];

  // `card` fits the recorded viewport inside the Frame with a margin for its shadow; `full` covers
  // the whole Frame, so a phone-shaped take on a phone-shaped Canvas fills the screen edge to edge.
  const full = options.layout === "full";
  const fit = full ? Math.max(within.widthPx / width, within.heightPx / height)
    : Math.min(within.widthPx * 0.9 / width, within.heightPx * 0.9 / height);
  const card = full ? { width: within.widthPx, height: within.heightPx } : { width: Math.round(width * fit), height: Math.round(height * fit) };
  const program = htmlVisual({
    html: `<div class="card"><div class="layer">${videos.map((video) => `{{${video.id}}}`).join("")}</div>
      <div class="ripple"></div><svg class="cursor" viewBox="0 0 22 30"><path d="M2 2 L2 24 L8 18 L12 28 L16 26 L12 17 L20 17 Z"/></svg></div>`,
    css: `:scope { background: radial-gradient(120% 90% at 50% 0%, #2a3150 0%, #12141c 70%); overflow: hidden; }
      .card { position: absolute; overflow: hidden; background: #000;${full ? "" : `
        border-radius: ${Math.round(14 * Math.max(fit, 0.6))}px;
        box-shadow: 0 ${Math.round(24 * fit)}px ${Math.round(70 * fit)}px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08);`} }
      .layer { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
      .cursor { position: absolute; left: 0; top: 0; width: ${Math.round(22 * Math.max(fit, 0.75) * 1.25)}px; overflow: visible;
        transform-origin: 2px 2px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.5)); }
      .cursor path { fill: #fff; stroke: #111; stroke-width: 1.5; stroke-linejoin: round; }
      .ripple { position: absolute; left: 0; top: 0; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%;
        border: 3px solid rgba(110, 120, 255, .9); background: rgba(110, 120, 255, .18); opacity: 0; }`,
    data: { frame: { width: within.widthPx, height: within.heightPx }, card, fit, cursor: options.cursor,
      camera: motion.camera, pointer: motion.cursor, presses: motion.presses },
    setup: `${SAMPLE_SOURCE}
      const card = root.querySelector('.card'), layer = root.querySelector('.layer');
      const cursor = root.querySelector('.cursor'), ripple = root.querySelector('.ripple');
      Object.assign(card.style, { left: ((data.frame.width - data.card.width) / 2) + 'px', top: ((data.frame.height - data.card.height) / 2) + 'px',
        width: data.card.width + 'px', height: data.card.height + 'px' });
      return frame => {
        const [scale, cx, cy] = sample(data.camera, frame), k = scale * data.fit;
        const ox = data.card.width / 2 - cx * k, oy = data.card.height / 2 - cy * k;
        layer.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + k + ')';
        if (!data.cursor || data.pointer.length === 0) { cursor.style.opacity = '0'; ripple.style.opacity = '0'; return; }
        const [px, py] = sample(data.pointer, frame), sx = ox + px * k, sy = oy + py * k;
        const press = data.presses.filter(p => p <= frame).pop();
        const since = press === undefined ? Infinity : frame - press;
        cursor.style.opacity = String(Math.max(0, Math.min(1, (frame - data.pointer[0][0]) / 6)));
        cursor.style.transform = 'translate(' + (sx - 2) + 'px,' + (sy - 2) + 'px) scale(' + (since < 5 ? 0.82 : 1) + ')';
        const t = since / 14;
        ripple.style.opacity = t < 1 ? String(1 - t) : '0';
        ripple.style.transform = 'translate(' + sx + 'px,' + sy + 'px) scale(' + (0.3 + t * 0.9) + ')';
      };`,
  });
  return sealVisualTrack({ id: options.id, timelineId: timeline.id, visualIr: "hypit.visual-ir@1",
    presents: [{ id: options.id, order: 0, z: options.stackingOrder, span: window.span,
      elements: [{ id: "scene", kind: "program", order: 0, program,
        style: [{ name: "position", value: "absolute" }, { name: "left", value: `${within.xPx}px` },
          { name: "top", value: `${within.yPx}px` }, { name: "width", value: `${within.widthPx}px` },
          { name: "height", value: `${within.heightPx}px` }] }, ...videos] }] });
}
