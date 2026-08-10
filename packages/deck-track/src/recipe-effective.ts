import { mediaEdgeAmount } from "@narratage/media-track";
import type {
  MediaFramePresentation,
  MediaGradientStop,
  MediaLifecycleMotion,
  MediaPaint,
  MediaSampleLayerSpec,
  MediaVisualOccupancy,
} from "@narratage/media-track";
import type { CanonicalValue } from "@narratage/protocol";
import type { ContentFit } from "@narratage/spatial";
import type { SvsRecipe } from "@narratage/svs";

import {
  decodeDepthStackCardSpec,
  decodeDepthStackMaterial,
  decodeDepthStackSpec,
  depthStackRecipeKeys,
} from "./author.js";
import type { DepthStackCardPlayback, DepthStackPoseStep, DepthStackSpec } from "./types.js";

/**
 * What each property came to, read back off what the decoders built.
 *
 * A Recipe writes as few properties as it likes — a Depth Stack requires none at
 * all — and the three decoders answer for the rest, so a form built from the
 * schema alone is seventy-four blanks and an author cannot see what any of them
 * will do. None of it is knowable from the schema, and a table of literals
 * beside the decoders could only be a second opinion of them, so every value
 * below is taken from a real lowering and named by where that lowering puts it.
 *
 * No media is needed to do it. The three decoders are told an id and a kind of
 * source and nothing more; only `apply` needs Cards, because only `apply`
 * rewrites them.
 */

const REPORT_ID = "effective";

/**
 * Material that is asked only what a Recipe already asked it.
 *
 * A still refuses `playback` and the trim pair outright, and which kind a Card
 * holds is known only to the Build that made it, which no report has. Asking as
 * timed would answer all three, and those answers cannot then be written back
 * down over a deck of stills — the reader refuses the Recipe its own report
 * produced, and a deck of stills is the deck this module is most often built
 * around. So the material is read as the kind that asks nothing, and the three
 * are answered only where a Recipe named them, which is to say only where the
 * Card's material had already permitted them.
 */
const TIMED_KEYS = ["playback", "trim-start", "trim-end"] as const;

/**
 * What is reported where no reader has run.
 *
 * An edge that names no operator reads none of its controls, so an operator can
 * be stood in front of them to be told what they come to, and beside an edge
 * that does nothing what it came to does nothing either. An origin an edge does
 * not use is `none`, which is a word the reader takes, so it is stated rather
 * than left out.
 *
 * A source with no trim runs to a length only its media knows, so the trim pair
 * stays unanswered, as does any control of an operator that is running and took
 * none: the decoder holds no value there, and supplying one would put a
 * direction or a distance into a lowering that had neither.
 */
const NO_OPERATOR = "none";
const NO_ORIGIN = "none";
const ONE_FRAME = 1;
const FIRST_DIRECTION = "left";

/**
 * A colour to reach a border style beside, and never to report.
 *
 * Colour is the one frame property with no fallback: the reader demands it as
 * soon as a border has width, and says nothing at all while the width is zero.
 * A colour therefore has to be in the probe before the style beside it can be
 * read, and which one it is never reaches that style. It is not spoken back,
 * because a width standing alone is refused rather than coloured, and reporting
 * a colour the module denies having would be inventing one.
 */
const PROBE_BORDER_COLOR = "#00000000";

type Decoded = {
  readonly written: Readonly<Record<string, CanonicalValue>>;
  readonly spec: DepthStackSpec;
  /** The same Recipe with every conditional reader's condition met. */
  readonly probe: DepthStackSpec;
  readonly playback: DepthStackCardPlayback;
  readonly fit: ContentFit;
  readonly sample: MediaSampleLayerSpec;
  readonly framePaint: MediaPaint | undefined;
};

type Places = Readonly<Record<string, (decoded: Decoded) => CanonicalValue | undefined>>;

/**
 * Back into the syntax they were read from.
 *
 * A pixel box, a shadow list, a paint and a sustain list are each a small syntax
 * of their own, kept as pieces once read. An author writes the syntax, so the
 * report writes it too. The four spellings sit together because they invert one
 * grammar that lives in `@narratage/media-track`, and following a change to it
 * should be one place rather than four.
 */
function spellPadding(padding: MediaFramePresentation["padding"]): string {
  const { topPx, rightPx, bottomPx, leftPx } = padding;
  if (topPx === rightPx && rightPx === bottomPx && bottomPx === leftPx) return `${topPx}`;
  // Three counts are not a spelling the reader accepts, so anything else states four.
  if (topPx === bottomPx && rightPx === leftPx) return `${topPx} ${rightPx}`;
  return `${topPx} ${rightPx} ${bottomPx} ${leftPx}`;
}

function spellShadows(shadows: MediaFramePresentation["shadows"]): string {
  if (shadows.length === 0) return "none";
  return shadows
    .map((shadow) => `${shadow.offsetX} ${shadow.offsetY} ${shadow.blurPx} ${shadow.spreadPx} ${shadow.color}`)
    .join(";");
}

function spellStops(stops: readonly MediaGradientStop[]): string {
  return stops.map((stop) => `${stop.color}@${stop.offset}`).join(",");
}

function spellPaint(paint: MediaPaint | undefined): string {
  if (paint === undefined) return "transparent";
  if (paint.kind === "linear-gradient") return `linear(${paint.angleDeg};${spellStops(paint.stops)})`;
  if (paint.kind === "radial-gradient") {
    return `radial(${paint.center.x},${paint.center.y};${spellStops(paint.stops)})`;
  }
  return paint.color;
}

function spellSustain(sustain: MediaLifecycleMotion["sustain"]): string {
  if (sustain.length === 0) return "none";
  return sustain
    .map((motion) => `${motion.operator} ${motion.amount} ${motion.cycles}`
      + `${motion.direction === undefined ? "" : ` ${motion.direction}`}`)
    .join(",");
}

/** Occupancy is one enum an author writes and two fields a reader keeps. */
function spellPlayback(occupancy: MediaVisualOccupancy): string {
  return occupancy.mode === "stretch" ? "stretch" : `${occupancy.mode}-${occupancy.align}`;
}

/**
 * The same Recipe, with the conditions the conditional readers wait on.
 *
 * A radius is read once the clip is rounded, a border's style and colour once it
 * has width, an edge's timing once an operator is named. Meeting those and
 * decoding again is how their answers are had from the decoder rather than
 * guessed. What the author wrote sits between the two layers, so a value already
 * written survives into the probe and a value the probe needs is only supplied
 * where there was none.
 */
function probed(properties: Readonly<Record<string, CanonicalValue>>): Record<string, CanonicalValue> {
  return {
    "border-color": PROBE_BORDER_COLOR,
    "enter-frames": ONE_FRAME,
    "exit-frames": ONE_FRAME,
    ...properties,
    "clip": "rounded",
    "border-width": 1,
    "enter": "fade",
    "exit": "fade",
  };
}

function recipeOf(properties: Readonly<Record<string, CanonicalValue>>): SvsRecipe {
  return { contract: "svml.svs-recipe@1", path: `depth-stack.${REPORT_ID}`, properties };
}

function decode(properties: Readonly<Record<string, CanonicalValue>>): Decoded {
  const recipe = recipeOf(properties);
  const timed = TIMED_KEYS.some((name) => properties[name] !== undefined);
  const material = decodeDepthStackMaterial(recipe, REPORT_ID, timed ? "timed" : "still");
  return {
    written: properties,
    spec: decodeDepthStackSpec(recipe),
    probe: decodeDepthStackSpec(recipeOf(probed(properties))),
    playback: decodeDepthStackCardSpec(recipe, REPORT_ID).playback,
    fit: material.fit,
    sample: material.sample,
    framePaint: material.framePaint?.paint,
  };
}

const DECK: Places = {
  "visible-previous": (d) => d.spec.visibility.previous,
  "visible-next": (d) => d.spec.visibility.next,
  "wrap": (d) => d.spec.visibility.wrap,
  "current-x": (d) => d.spec.poses.current.xPx,
  "current-y": (d) => d.spec.poses.current.yPx,
  "current-scale": (d) => d.spec.poses.current.scale,
  "current-rotation": (d) => d.spec.poses.current.rotationDeg,
  "current-opacity": (d) => d.spec.poses.current.opacity,
  "current-stacking": (d) => d.spec.poses.current.stacking,
  "current-brightness": (d) => d.spec.poses.current.tone.brightness,
  "current-contrast": (d) => d.spec.poses.current.tone.contrast,
  "current-saturation": (d) => d.spec.poses.current.tone.saturation,
  "reflow-frames": (d) => d.spec.reflow.durationFrames,
  "reflow-easing": (d) => d.spec.reflow.easing,
  "stack-order": (d) => d.spec.stackingOrder,
  "playback-future": (d) => d.playback.future,
  "playback-past": (d) => d.playback.past,
};

/** Both neighbours take the same step, from the same side of the pose model. */
function stepPlaces(prefix: "previous" | "next"): Places {
  const step = (decoded: Decoded): DepthStackPoseStep => decoded.spec.poses[prefix];
  return {
    [`${prefix}-x-step`]: (d) => step(d).xPerDepthPx,
    [`${prefix}-y-step`]: (d) => step(d).yPerDepthPx,
    [`${prefix}-scale-step`]: (d) => step(d).scalePerDepth,
    [`${prefix}-rotation-step`]: (d) => step(d).rotationPerDepthDeg,
    [`${prefix}-rotation-mode`]: (d) => step(d).rotationMode,
    [`${prefix}-opacity-step`]: (d) => step(d).opacityPerDepth,
    [`${prefix}-stacking-step`]: (d) => step(d).stackingPerDepth,
    [`${prefix}-brightness-step`]: (d) => step(d).tonePerDepth.brightness,
    [`${prefix}-contrast-step`]: (d) => step(d).tonePerDepth.contrast,
    [`${prefix}-saturation-step`]: (d) => step(d).tonePerDepth.saturation,
  };
}

const FIT: Places = {
  "fit": (d) => d.fit.sizing,
  "frame-x": (d) => d.fit.framePoint.x,
  "frame-y": (d) => d.fit.framePoint.y,
  "content-x": (d) => d.fit.contentPoint.x,
  "content-y": (d) => d.fit.contentPoint.y,
  "fit-offset-x": (d) => d.fit.offsetPx.x,
  "fit-offset-y": (d) => d.fit.offsetPx.y,
  "fit-constraint": (d) => d.fit.constraint,
};

const SAMPLE: Places = {
  "opacity": (d) => d.sample.appearance.opacity,
  "blur": (d) => d.sample.appearance.filter.blurPx,
  "brightness": (d) => d.sample.appearance.filter.brightness,
  "contrast": (d) => d.sample.appearance.filter.contrast,
  "saturation": (d) => d.sample.appearance.filter.saturation,
  // Only material with a duration settles an occupancy, and material is what no
  // report holds, so this answers where a Recipe has already claimed one.
  "playback": (d) => d.sample.occupancy === undefined ? undefined : spellPlayback(d.sample.occupancy),
  // One window written as two names. A source with no window is played whole, to
  // a length only its own media knows, and zero would name an empty one instead.
  "trim-start": (d) => d.sample.trim?.startFrame,
  "trim-end": (d) => d.sample.trim?.endFrameExclusive,
};

/** The probe rounds its clip, so the radius a reader would use is always on it. */
function probedRadius(probe: DepthStackSpec): number | undefined {
  const clip = probe.presentation.clip;
  return clip.kind === "rounded" ? clip.radiusPx : undefined;
}

const FRAME: Places = {
  "clip": (d) => d.spec.presentation.clip.kind,
  "radius": (d) => probedRadius(d.probe),
  "padding": (d) => spellPadding(d.spec.presentation.padding),
  // A width of zero is what makes the reader drop the border entirely, so a
  // frame with no border is a frame whose border width came to nothing.
  "border-width": (d) => d.spec.presentation.border?.widthPx ?? 0,
  "border-style": (d) => d.probe.presentation.border!.style,
  "border-color": (d) =>
    d.written["border-color"] === undefined ? undefined : d.probe.presentation.border!.color,
  "shadows": (d) => spellShadows(d.spec.presentation.shadows),
  "frame-paint": (d) => spellPaint(d.framePaint),
};

/**
 * Both edges take the same controls, and only the operator decides whether any
 * of them is read. The operator itself is reported from the real lowering — an
 * edge the decoder left out is an edge nothing runs — and the rest from the
 * probe, which names an operator so that they are answered at all.
 *
 * A distance comes from the one place the module keeps them, so what is reported
 * is the distance the operator would have travelled rather than a number chosen
 * here. An edge beginning off the Canvas measures its distance from the Canvas
 * instead and is refused outright if given one of its own, so beside an origin
 * no amount is reported: stating one would turn a Recipe that renders into a
 * Recipe that cannot be built.
 */
function edgePlaces(prefix: "enter" | "exit"): Places {
  const edge = (decoded: Decoded): NonNullable<MediaLifecycleMotion["enter"]> => decoded.probe.motion[prefix]!;
  const running = (decoded: Decoded): boolean => decoded.spec.motion[prefix] !== undefined;
  return {
    [prefix]: (d) => d.spec.motion[prefix]?.operator ?? NO_OPERATOR,
    [`${prefix}-frames`]: (d) => edge(d).durationFrames,
    [`${prefix}-easing`]: (d) => edge(d).easing,
    [`${prefix}-direction`]: (d) => edge(d).direction ?? (running(d) ? undefined : FIRST_DIRECTION),
    [`${prefix}-amount`]: (d) => edge(d).origin === undefined ? mediaEdgeAmount(edge(d)) : undefined,
    [`${prefix}-origin`]: (d) => edge(d).origin ?? NO_ORIGIN,
  };
}

const MOTION: Places = {
  ...edgePlaces("enter"),
  ...edgePlaces("exit"),
  "sustain": (d) => spellSustain(d.spec.motion.sustain),
};

const PLACES: Places = {
  ...DECK,
  ...stepPlaces("previous"),
  ...stepPlaces("next"),
  ...FIT,
  ...SAMPLE,
  ...FRAME,
  ...MOTION,
};

/**
 * A property the decoders accept and this has no place for is one an author
 * would always be shown a blank for, so it fails at load rather than at the
 * form. A place that answers nothing on a Recipe that gave it nothing to read is
 * different, and stays.
 */
const unplaced = depthStackRecipeKeys.filter((name) => !Object.hasOwn(PLACES, name));
if (unplaced.length > 0) {
  throw new Error(`DepthStack Recipe report has no place for ${unplaced.join(", ")}`);
}

const named = new Set<string>(depthStackRecipeKeys);
const unwritable = Object.keys(PLACES).filter((name) => !named.has(name));
if (unwritable.length > 0) {
  throw new Error(`DepthStack Recipe report answers for unwritable ${unwritable.join(", ")}`);
}

export function depthStackEffective(
  properties: Readonly<Record<string, CanonicalValue>>,
): Readonly<Record<string, CanonicalValue>> {
  const decoded = decode(properties);
  const reported: Record<string, CanonicalValue> = {};
  for (const [name, read] of Object.entries(PLACES)) {
    const value = read(decoded);
    if (value !== undefined) reported[name] = value;
  }
  return reported;
}
