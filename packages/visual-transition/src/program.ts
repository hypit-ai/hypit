import type { VisualProgram } from "@hypit/composition";
import { htmlVisual } from "@hypit/html-program";

export type TransitionEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type TransitionDirection = "left" | "right" | "up" | "down";
export type IrisShape = "circle" | "box" | "diamond";

const easings = ["linear", "ease-in", "ease-out", "ease-in-out"] as const;
const directions = ["left", "right", "up", "down"] as const;
const irisShapes = ["circle", "box", "diamond"] as const;

export function assertTransitionEasing(value: string): asserts value is TransitionEasing {
  if (!easings.includes(value as TransitionEasing)) throw new Error(`Transition easing ${value} is invalid.`);
}

export function assertTransitionDirection(value: string): asserts value is TransitionDirection {
  if (!directions.includes(value as TransitionDirection)) throw new Error(`Transition direction ${value} is invalid.`);
}

export function assertIrisShape(value: string): asserts value is IrisShape {
  if (!irisShapes.includes(value as IrisShape)) throw new Error(`Iris shape ${value} is invalid.`);
}

export function assertTransitionColor(value: string): void {
  if (!/^#[\da-f]{6}(?:[\da-f]{2})?$/iu.test(value)) {
    throw new Error(`Transition color ${value} must be a six- or eight-digit hexadecimal color.`);
  }
}

function finiteRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

const twoInputHtml = '<div data-hypit-transition-layer="outgoing">{{outgoing}}</div><div data-hypit-transition-layer="incoming">{{incoming}}</div>';
const twoInputCss = `:scope { position: absolute; inset: 0; overflow: hidden; isolation: isolate; }
:scope > [data-hypit-transition-layer] { position: absolute; inset: 0; transform-origin: center; }
:scope > [data-hypit-transition-layer="outgoing"] { z-index: 0; }
:scope > [data-hypit-transition-layer="incoming"] { z-index: 1; }`;
const additiveCss = `${twoInputCss}
:scope > [data-hypit-transition-layer="incoming"] { mix-blend-mode: plus-lighter; }`;

const progressRuntime = `const ease = progress => {
  if (data.easing === 'ease-in') return progress * progress;
  if (data.easing === 'ease-out') return 1 - (1 - progress) * (1 - progress);
  if (data.easing === 'ease-in-out') return progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  return progress;
};
const progressAt = localFrame => {
  const denominator = Math.max(1, context.durationFrames - 1);
  const progress = context.durationFrames <= 1 ? 1 : Math.max(0, Math.min(1, localFrame / denominator));
  return ease(progress);
};`;

function transitionSetup(body: string, selectors = `const outgoing = root.querySelector('[data-hypit-transition-layer="outgoing"]');
const incoming = root.querySelector('[data-hypit-transition-layer="incoming"]');
if (outgoing === null || incoming === null) throw new Error('Transition requires outgoing and incoming inputs.');`): string {
  return `${selectors}
${progressRuntime}
return localFrame => {
  const progress = progressAt(localFrame);
${body}
};`;
}

export function crossDissolveEffect(easing: TransitionEasing = "linear"): VisualProgram {
  assertTransitionEasing(easing);
  return htmlVisual({
    html: twoInputHtml,
    css: additiveCss,
    setup: transitionSetup(`  outgoing.style.opacity = String(1 - progress);
  incoming.style.opacity = String(progress);`),
    data: { easing },
  });
}

/** Fade through one explicit opaque colour. */
export function dipToColorEffect(color = "#000000", easing: TransitionEasing = "linear"): VisualProgram {
  assertTransitionColor(color);
  assertTransitionEasing(easing);
  return htmlVisual({
    html: '<div data-hypit-transition-layer="outgoing">{{outgoing}}</div><div data-hypit-transition-color></div><div data-hypit-transition-layer="incoming">{{incoming}}</div>',
    css: `${additiveCss}
:scope > [data-hypit-transition-color] { position: absolute; inset: 0; z-index: 1; mix-blend-mode: plus-lighter; }
:scope > [data-hypit-transition-layer="incoming"] { z-index: 2; }`,
    setup: transitionSetup(`  const outgoingWeight = Math.max(0, 1 - progress * 2);
  const incomingWeight = Math.max(0, progress * 2 - 1);
  const colorWeight = 1 - outgoingWeight - incomingWeight;
  outgoing.style.opacity = String(outgoingWeight);
  color.style.opacity = String(colorWeight);
  incoming.style.opacity = String(incomingWeight);`, `const outgoing = root.querySelector('[data-hypit-transition-layer="outgoing"]');
const incoming = root.querySelector('[data-hypit-transition-layer="incoming"]');
const color = root.querySelector('[data-hypit-transition-color]');
if (outgoing === null || incoming === null || color === null) throw new Error('Dip To Color requires outgoing, color and incoming layers.');
color.style.background = data.color;`),
    data: { color, easing },
  });
}

function translation(direction: TransitionDirection, progress: string, incoming: boolean): string {
  const amount = incoming ? `(1 - ${progress}) * 100` : `-${progress} * 100`;
  const inverse = incoming ? `-(1 - ${progress}) * 100` : `${progress} * 100`;
  if (direction === "left") return `translate3d(\${${amount}}%, 0, 0)`;
  if (direction === "right") return `translate3d(\${${inverse}}%, 0, 0)`;
  if (direction === "up") return `translate3d(0, \${${amount}}%, 0)`;
  return `translate3d(0, \${${inverse}}%, 0)`;
}

function movementSetup(direction: TransitionDirection, easing: TransitionEasing, push: boolean): string {
  assertTransitionDirection(direction);
  assertTransitionEasing(easing);
  const incoming = translation(direction, "progress", true);
  const outgoing = push ? translation(direction, "progress", false) : "none";
  return transitionSetup(`  outgoing.style.transform = \`${outgoing}\`;
  incoming.style.transform = \`${incoming}\`;`);
}

/** Move both pictures as one continuous strip. Direction names picture travel. */
export function pushEffect(direction: TransitionDirection = "left", easing: TransitionEasing = "ease-in-out"): VisualProgram {
  return htmlVisual({ html: twoInputHtml, css: twoInputCss, setup: movementSetup(direction, easing, true), data: { direction, easing } });
}

/** Move the incoming picture over a stationary outgoing picture. Direction names incoming travel. */
export function slideEffect(direction: TransitionDirection = "left", easing: TransitionEasing = "ease-in-out"): VisualProgram {
  return htmlVisual({ html: twoInputHtml, css: twoInputCss, setup: movementSetup(direction, easing, false), data: { direction, easing } });
}

/** Reveal the incoming picture with one straight boundary travelling in direction. */
export function linearWipeEffect(direction: TransitionDirection = "right", easing: TransitionEasing = "ease-in-out"): VisualProgram {
  assertTransitionDirection(direction);
  assertTransitionEasing(easing);
  return htmlVisual({
    html: twoInputHtml,
    css: twoInputCss,
    setup: transitionSetup(`  const hidden = (1 - progress) * 100;
  incoming.style.clipPath = data.direction === 'right' ? \`inset(0 \${hidden}% 0 0)\`
    : data.direction === 'left' ? \`inset(0 0 0 \${hidden}%)\`
    : data.direction === 'down' ? \`inset(0 0 \${hidden}% 0)\`
    : \`inset(\${hidden}% 0 0 0)\`;`),
    data: { direction, easing },
  });
}

/** Reveal the incoming picture from the centre through one geometric aperture. */
export function irisEffect(shape: IrisShape = "circle", easing: TransitionEasing = "ease-in-out"): VisualProgram {
  assertIrisShape(shape);
  assertTransitionEasing(easing);
  return htmlVisual({
    html: twoInputHtml,
    css: twoInputCss,
    setup: transitionSetup(`  if (data.shape === 'circle') incoming.style.clipPath = \`circle(\${progress * 100}% at 50% 50%)\`;
  else if (data.shape === 'box') {
    const hidden = (1 - progress) * 50;
    incoming.style.clipPath = \`inset(\${hidden}% \${hidden}% \${hidden}% \${hidden}%)\`;
  } else {
    const spread = progress * 100;
    incoming.style.clipPath = \`polygon(50% \${50 - spread}%, \${50 + spread}% 50%, 50% \${50 + spread}%, \${50 - spread}% 50%)\`;
  }`),
    data: { shape, easing },
  });
}

/** Dissolve while the outgoing picture expands and the incoming picture settles from a smaller scale. */
export function zoomDissolveEffect(strength = 0.16, easing: TransitionEasing = "ease-in-out"): VisualProgram {
  finiteRange(strength, 0, 1, "Zoom Dissolve strength");
  assertTransitionEasing(easing);
  return htmlVisual({
    html: twoInputHtml,
    css: additiveCss,
    setup: transitionSetup(`  outgoing.style.opacity = String(1 - progress);
  incoming.style.opacity = String(progress);
  outgoing.style.transform = \`scale(\${1 + data.strength * progress})\`;
  incoming.style.transform = \`scale(\${1 - data.strength * (1 - progress)})\`;`),
    data: { strength, easing },
  });
}

/** Dissolve through a blur peak without changing either picture's spatial relation. */
export function blurDissolveEffect(radius = 20, easing: TransitionEasing = "ease-in-out"): VisualProgram {
  finiteRange(radius, 0, 200, "Blur Dissolve radius");
  assertTransitionEasing(easing);
  return htmlVisual({
    html: twoInputHtml,
    css: additiveCss,
    setup: transitionSetup(`  const blur = Math.sin(Math.PI * progress) * data.radius;
  outgoing.style.opacity = String(1 - progress);
  incoming.style.opacity = String(progress);
  outgoing.style.filter = \`blur(\${blur}px)\`;
  incoming.style.filter = \`blur(\${blur}px)\`;`),
    data: { radius, easing },
  });
}
