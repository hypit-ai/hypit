import type { RecipeFacet } from "@narratage/component-kit";
import type { CanonicalValue } from "@narratage/protocol";
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
} from "./author.js";
import {
  mediaAppearanceRecipeSchema,
  mediaMotionRecipeSchema,
} from "./recipe-schema.js";
import type {
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

export const mediaAppearanceRecipeFacet: RecipeFacet = {
  surface: "track",
  schema: mediaAppearanceRecipeSchema,
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
};

export const mediaMotionRecipeFacet: RecipeFacet = {
  surface: "track",
  schema: mediaMotionRecipeSchema,
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
};
