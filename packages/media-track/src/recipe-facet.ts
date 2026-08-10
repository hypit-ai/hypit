import type { RecipeFacet } from "@narratage/component-kit";
import type { CanonicalValue, ValueSchema } from "@narratage/protocol";
import type { SvsRecipe } from "@narratage/svs";

import {
  decodeMediaFit,
  decodeMediaFramePaint,
  decodeMediaMotion,
  decodeMediaPresentation,
  decodeMediaSampleSpec,
  decodeMediaStackingOrder,
  isMediaFramePaintLayerId,
  mediaFramePaintLayerId,
  spellMediaFramePaint,
  spellMediaPadding,
  spellMediaPlayback,
  spellMediaShadows,
  spellMediaSustain,
} from "./author.js";
import { mediaEdgeAmount } from "./motion.js";
import {
  mediaAppearanceRecipeSchema,
  mediaMotionRecipeSchema,
} from "./recipe-schema.js";
import type {
  MediaEdgeMotion,
  MediaFramePresentation,
  MediaItemProgram,
  MediaLayerProgram,
  MediaSampleLayerProgram,
  MediaSequenceProgram,
  MediaTrackProgram,
} from "./types.js";

/**
 * Writing the two Media Recipes, without a stylesheet around them.
 *
 * The Surface reaches these decoders from an authored Track and hands what they
 * return to the Producers that build a Track up layer by layer. Nothing so
 * assembled is left by the time a Track is projected: `project-media-visual-track`
 * takes a Program in which every spec has already been flattened into the Items
 * and Sequences. So the lowering is shared but its result is applied differently
 * — the decoders speak, and what they say is written over an Item that exists.
 *
 * Everything a Recipe does not speak for stays as the Build left it: the bytes,
 * the extents, the spans, the placement Frames and the sampling keyframes are
 * all carried through untouched.
 */

const APPEARANCE_PATH = "media.preview";
const MOTION_PATH = "motion.preview";

function asProgram(value: CanonicalValue | undefined): Partial<MediaTrackProgram> {
  return value !== null && typeof value === "object" ? value as Partial<MediaTrackProgram> : {};
}

function items(program: Partial<MediaTrackProgram>): readonly MediaItemProgram[] {
  return Array.isArray(program.items) ? program.items : [];
}

function sequences(program: Partial<MediaTrackProgram>): readonly MediaSequenceProgram[] {
  return Array.isArray(program.sequences) ? program.sequences : [];
}

function written(properties: Readonly<Record<string, CanonicalValue>>, path: string): SvsRecipe {
  return { contract: "svml.svs-recipe@1", path, properties };
}

/**
 * A Path clip is bound by `clip={Path}` and a Recipe is forbidden from naming
 * one alongside it, so a Path already in place survives a Recipe that says
 * nothing about clipping rather than being flattened back to a rectangle.
 */
function presentation(recipe: SvsRecipe, current: MediaFramePresentation): MediaFramePresentation {
  const decoded = decodeMediaPresentation(recipe);
  return current.clip.kind === "path" && recipe.properties["clip"] === undefined
    ? { ...decoded, clip: current.clip }
    : decoded;
}

function sample(recipe: SvsRecipe, layer: MediaSampleLayerProgram): MediaSampleLayerProgram {
  // What the material is decides what may be asked of it: a still refuses
  // playback and trim, and only the Build knows which it holds.
  const spec = decodeMediaSampleSpec(recipe, layer.id, layer.source.kind, layer.samplingMotion, true);
  return {
    id: layer.id,
    kind: "sample",
    source: layer.source,
    fit: decodeMediaFit(recipe),
    ...(spec.trim === undefined ? {} : { trim: spec.trim }),
    ...(spec.occupancy === undefined ? {} : { occupancy: spec.occupancy }),
    appearance: spec.appearance,
    ...(spec.samplingMotion === undefined ? {} : { samplingMotion: spec.samplingMotion }),
  };
}

/**
 * Silence about `frame-paint` means transparent, exactly as it does on the
 * Surface, so the backdrop is rebuilt from the Recipe every time rather than
 * left standing under one that no longer asks for it. Paint Layers an author
 * wrote are a different Recipe's and are none of this one's business.
 */
function layers(
  recipe: SvsRecipe,
  current: readonly MediaLayerProgram[],
  unitId: string,
): readonly MediaLayerProgram[] {
  const painted = decodeMediaFramePaint(recipe, mediaFramePaintLayerId(unitId));
  const kept = current
    .filter((layer) => !isMediaFramePaintLayerId(layer.id))
    .map((layer) => layer.kind === "paint" ? layer : sample(recipe, layer));
  return painted === undefined
    ? kept
    : [{ id: painted.id, kind: "paint", paint: painted.paint, opacity: painted.opacity }, ...kept];
}

/** The names a schema gives no fallback for, read back from the schema itself. */
function demanded(schema: ValueSchema): readonly string[] {
  const fields = (schema as { fields: Record<string, { optional?: true }> }).fields;
  return Object.keys(fields).filter((name) => fields[name]?.optional !== true).sort();
}

/**
 * A media frame that is somewhere sensible in the stack.
 *
 * Only `stack-order` has no fallback, so only `stack-order` is stated: every
 * other name answers for itself, and a Recipe that repeated those answers would
 * be unlike anything an author writes and would hide what the decoder does when
 * left alone. Forty is what both `media.card` and `media.product` in the example
 * stylesheets give a framed insert — above a full-bleed backdrop at ten, under
 * the captions at seventy.
 */
export const mediaAppearanceDefaultRecipe: Readonly<Record<string, CanonicalValue>> = {
  "stack-order": 40,
};

const statedAppearance = Object.keys(mediaAppearanceDefaultRecipe).sort().join(" ");
if (statedAppearance !== demanded(mediaAppearanceRecipeSchema).join(" ")) {
  throw new Error("Media appearance default Recipe must state exactly the required properties");
}

/**
 * The unit a report is read off.
 *
 * Nothing is being built, so the name only has to be a legal one and the same
 * one throughout, a frame's backdrop Layer being named after the unit it backs.
 */
const REPORTED_ID = "preview";

/**
 * A colour to reach a border style beside, and never to report.
 *
 * The style and the radius are read only once a frame has a border, and a
 * border may not have width without a colour, so a colour has to be in the
 * Recipe before either can be asked for. Which one it is does not reach the
 * style, so this one is never spoken back: `border-color` is reported only
 * where an author wrote it, that being the only place a colour exists. The
 * decoder has no fallback to report — it refuses a width standing alone — and
 * saying otherwise would put a colour on screen that the module denies having.
 */
const PROBE_BORDER_COLOR = "#00000000";

function effectiveAppearance(
  properties: Readonly<Record<string, CanonicalValue>>,
): Readonly<Record<string, CanonicalValue>> {
  // `stack-order` is the one name with nothing behind it, so where a Recipe has
  // not written one there is nothing to read but the Recipe a form opens on,
  // which is the only place that judgement is kept.
  const stated: Record<string, CanonicalValue> = { ...mediaAppearanceDefaultRecipe, ...properties };
  const recipe = written(stated, APPEARANCE_PATH);
  const wroteColor = stated["border-color"] !== undefined;
  const standing = wroteColor ? stated : { ...stated, "border-color": PROBE_BORDER_COLOR };
  const frame = decodeMediaPresentation(written(standing, APPEARANCE_PATH));
  // A square frame with no border never reaches the radius or the border style
  // the decoder holds ready for one, so both are read off a frame made to have
  // them. What the Recipe came to is still read from the frame it asked for.
  const shaped = decodeMediaPresentation(written({
    ...standing, "clip": "rounded", "border-width": frame.border?.widthPx ?? 1,
  }, APPEARANCE_PATH));
  const border = frame.border ?? shaped.border!;
  const fit = decodeMediaFit(recipe);
  // Whether playback and trim may be asked for at all is the material's to say,
  // and no material is in reach. Reading the sample as timed would answer for
  // all three, but a still refuses all three, so those answers cannot be written
  // back down over half the Tracks this module builds. The sample is read as the
  // kind that asks nothing instead, which leaves the three to be reported only
  // where an author wrote them and the material therefore already allowed them.
  const timed = ["playback", "trim-start", "trim-end"].some((name) => stated[name] !== undefined);
  const sample = decodeMediaSampleSpec(recipe, REPORTED_ID, timed ? "timed" : "still", undefined, true);
  return {
    "fit": fit.sizing,
    "frame-x": fit.framePoint.x,
    "frame-y": fit.framePoint.y,
    "content-x": fit.contentPoint.x,
    "content-y": fit.contentPoint.y,
    "fit-offset-x": fit.offsetPx.x,
    "fit-offset-y": fit.offsetPx.y,
    "fit-constraint": fit.constraint,
    "opacity": sample.appearance.opacity,
    "blur": sample.appearance.filter.blurPx,
    "brightness": sample.appearance.filter.brightness,
    "contrast": sample.appearance.filter.contrast,
    "saturation": sample.appearance.filter.saturation,
    ...(sample.occupancy === undefined ? {} : { "playback": spellMediaPlayback(sample.occupancy) }),
    ...(sample.trim === undefined
      ? {}
      : { "trim-start": sample.trim.startFrame, "trim-end": sample.trim.endFrameExclusive }),
    "stack-order": decodeMediaStackingOrder(recipe),
    "clip": frame.clip.kind,
    "radius": shaped.clip.kind === "rounded" ? shaped.clip.radiusPx : 0,
    "padding": spellMediaPadding(frame.padding),
    // No border is a border of no width, which is how the decoder says it.
    "border-width": frame.border?.widthPx ?? 0,
    "border-style": border.style,
    ...(wroteColor ? { "border-color": border.color } : {}),
    "shadows": spellMediaShadows(frame.shadows),
    "frame-paint": spellMediaFramePaint(recipe, mediaFramePaintLayerId(REPORTED_ID)),
  };
}

export const mediaAppearanceRecipeFacet: RecipeFacet = {
  surface: "track",
  schema: mediaAppearanceRecipeSchema,
  defaults: mediaAppearanceDefaultRecipe,
  apply: (properties, current) => {
    const program = asProgram(current["program"]);
    const recipe = written(properties, APPEARANCE_PATH);
    const order = decodeMediaStackingOrder(recipe);
    return {
      program: {
        ...program,
        items: items(program).map((item) => ({
          ...item,
          presentation: presentation(recipe, item.presentation),
          layers: layers(recipe, item.layers, item.id),
          stacking: { ...item.stacking, order },
        })),
        sequences: sequences(program).map((sequence) => ({
          ...sequence,
          presentation: presentation(recipe, sequence.presentation),
          members: sequence.members.map((member) => ({
            ...member, layers: layers(recipe, member.layers, member.id),
          })),
          stacking: { ...sequence.stacking, order },
        })),
      } as unknown as CanonicalValue,
    };
  },
  effective: effectiveAppearance,
};

/**
 * Nothing, because motion requires nothing.
 *
 * Silence about an edge is a legal Recipe meaning the edge does nothing, so the
 * empty one lowers. Naming an operator would create the very demand that would
 * then justify naming a duration beside it — a pair no author asked for, and a
 * form opening on a fade nobody wrote.
 */
export const mediaMotionDefaultRecipe: Readonly<Record<string, CanonicalValue>> = {};

const statedMotion = new Set(Object.keys(mediaMotionDefaultRecipe));
if (demanded(mediaMotionRecipeSchema).some((name) => !statedMotion.has(name))) {
  throw new Error("Media motion default Recipe must state every required property");
}

/**
 * An edge to read the answers off where a Recipe has asked for none.
 *
 * `enter` and `exit` decide whether anything else in their group is looked at,
 * and a duration is the one thing an operator demands rather than answers for,
 * so with either missing the decoder never reaches the easing it would have
 * chosen. Standing both in front of it lets it choose, and beside an edge that
 * does nothing what it chose does nothing either. Neither of the two is spoken
 * back: the operator because the edge does not have one, and the duration
 * because the decoder refuses a duration rather than settling on one.
 */
const STANDING_OPERATOR = "fade";
const STANDING_FRAMES = 1;

/**
 * What one edge of a lifecycle comes to.
 *
 * An absent operator is an absent edge, so `enter` says `none` and the names
 * under it say what they are worth beside it, which is nothing. An amount is
 * the distance that operator travels on its own, which is what an author
 * writing one down would be replacing.
 *
 * Two of the six can only be reported where an author wrote them. A duration is
 * demanded by every operator and answered for by none, so on an edge that runs
 * without one the module errors rather than choosing, and a number here would
 * promise what it then refuses. A direction is the same wherever an operator
 * needs one and is never read where an operator does not, so the decoder holds
 * one exactly when it was written.
 *
 * An edge that starts outside the Canvas measures its distance from the Canvas
 * rather than carrying one, and the two together are refused outright, so no
 * amount is reported beside an origin: stating one turns a Recipe that renders
 * into a Recipe that cannot be built.
 */
function edgeReported(
  prefix: "enter" | "exit",
  asked: MediaEdgeMotion | undefined,
  standing: MediaEdgeMotion,
  wroteFrames: boolean,
): Record<string, CanonicalValue> {
  return {
    [prefix]: asked?.operator ?? "none",
    ...(wroteFrames ? { [`${prefix}-frames`]: standing.durationFrames } : {}),
    [`${prefix}-easing`]: standing.easing,
    ...(standing.direction === undefined ? {} : { [`${prefix}-direction`]: standing.direction }),
    ...(standing.origin === undefined ? { [`${prefix}-amount`]: mediaEdgeAmount(standing) } : {}),
    [`${prefix}-origin`]: standing.origin ?? "none",
  };
}

function effectiveMotion(
  properties: Readonly<Record<string, CanonicalValue>>,
): Readonly<Record<string, CanonicalValue>> {
  const stated: Record<string, CanonicalValue> = { ...mediaMotionDefaultRecipe, ...properties };
  const durations: Record<string, CanonicalValue> = {
    ...stated,
    ...(stated["enter-frames"] === undefined ? { "enter-frames": STANDING_FRAMES } : {}),
    ...(stated["exit-frames"] === undefined ? { "exit-frames": STANDING_FRAMES } : {}),
  };
  // Which edges exist is the decoder's to say, and it says it by answering with
  // an edge or with nothing, so it is asked before anything is stood in.
  const asked = decodeMediaMotion(written(durations, MOTION_PATH));
  const standing = decodeMediaMotion(written({
    ...durations,
    ...(asked.enter === undefined ? { "enter": STANDING_OPERATOR } : {}),
    ...(asked.exit === undefined ? { "exit": STANDING_OPERATOR } : {}),
  }, MOTION_PATH));
  return {
    ...edgeReported("enter", asked.enter, standing.enter!, stated["enter-frames"] !== undefined),
    "sustain": spellMediaSustain(asked.sustain),
    ...edgeReported("exit", asked.exit, standing.exit!, stated["exit-frames"] !== undefined),
  };
}

export const mediaMotionRecipeFacet: RecipeFacet = {
  surface: "track",
  schema: mediaMotionRecipeSchema,
  defaults: mediaMotionDefaultRecipe,
  apply: (properties, current) => {
    const program = asProgram(current["program"]);
    // `enter-origin` becomes a distance from the Canvas edge, and no Canvas
    // reaches a projection, so a Recipe naming one is refused by
    // `project-media-visual-track` in its own words rather than resolved here
    // against a Canvas this has guessed.
    const motion = decodeMediaMotion(written(properties, MOTION_PATH));
    return {
      program: {
        ...program,
        items: items(program).map((item) => ({ ...item, motion })),
        sequences: sequences(program).map((sequence) => ({ ...sequence, motion })),
      } as unknown as CanonicalValue,
    };
  },
  effective: effectiveMotion,
};
