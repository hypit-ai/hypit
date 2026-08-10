import type { RecipeFacet } from "@narratage/component-kit";
import type { MediaLayerProgram, MediaSampleLayerProgram } from "@narratage/media-track";
import type { CanonicalValue } from "@narratage/protocol";
import type { SvsRecipe } from "@narratage/svs";

import {
  decodeDepthStackCardSpec,
  decodeDepthStackMaterial,
  decodeDepthStackSpec,
} from "./author.js";
import { depthStackEffective } from "./recipe-effective.js";
import { depthStackRecipeSchema } from "./recipe-schema.js";
import type { DepthStackCard, DepthStackProgram } from "./types.js";

/**
 * Writing a DepthStack Recipe, without a stylesheet around it.
 *
 * The Surface reaches the same three decoders from an authored element; this
 * reaches them from loose properties, so an editor can show what a Recipe does
 * before there is a `.svml` to put it in. The lowering is shared rather than
 * repeated, which is what keeps the preview honest.
 *
 * An element gives the stack one Recipe and lets any Card replace it with
 * another. One set of properties cannot say that, so what is written here
 * reaches every Card alike — which is the common case and the one worth tuning.
 * A Card's label is not part of it: labels come from their own Surface, carry
 * exact font Artifacts, and are left exactly as they were found.
 */

const STACK_ID = "preview";

function asProgram(value: CanonicalValue | undefined): Partial<DepthStackProgram> {
  return value !== null && typeof value === "object" ? value as Partial<DepthStackProgram> : {};
}

/**
 * Material already in hand.
 *
 * A Recipe names an image or a clip; it does not carry one. Each layer keeps
 * the source it was built around and the id the Build minted for it, and the
 * Recipe decides only how that source is fitted, filtered and framed. Trim is
 * taken from the decoded spec rather than carried, because an author who stops
 * writing `trim-start` is asking for none.
 */
function restyle(recipe: SvsRecipe, stackId: string, card: DepthStackCard): DepthStackCard {
  const samples = card.material.layers
    .filter((layer): layer is MediaSampleLayerProgram => layer.kind === "sample");
  const first = samples[0];
  if (first === undefined) throw new Error(`DepthStack Card ${card.id} has no sampled source to restyle.`);
  const material = decodeDepthStackMaterial(recipe, `${stackId}.${card.id}`, first.source.kind);
  const paint = material.framePaint;
  const layers: MediaLayerProgram[] = [
    ...(paint === undefined ? [] : [{
      id: paint.id, kind: "paint" as const, paint: paint.paint, opacity: paint.opacity,
    }]),
    ...samples.map((layer) => {
      // A Surface that runs in frames has to say how it occupies its span
      // whether or not a Recipe mentions playback, which is why
      // `appendSurfaceMediaLayer` settles it when the Recipe stays silent. What
      // it settled on is left standing rather than taken away here.
      const occupancy = material.sample.occupancy ?? layer.occupancy;
      return {
        id: layer.id,
        kind: "sample" as const,
        source: layer.source,
        fit: material.fit,
        ...(material.sample.trim === undefined ? {} : { trim: material.sample.trim }),
        ...(occupancy === undefined ? {} : { occupancy }),
        appearance: material.sample.appearance,
        // Sampling keyframes are a Build's; no Recipe property names them.
        ...(layer.samplingMotion === undefined ? {} : { samplingMotion: layer.samplingMotion }),
      };
    }),
  ];
  return {
    ...card,
    material: { contract: "svml.media-layer-set@1", layers },
    playback: decodeDepthStackCardSpec(recipe, card.id).playback,
  };
}

/**
 * Nothing, because a Depth Stack requires nothing.
 *
 * Every reader answers with a fallback, so the empty Recipe lowers and what it
 * lowers to is the deck this module draws. Writing a frame treatment here would
 * read better and say less: it would hide which of those values are the
 * module's own and freeze them against its later judgement.
 *
 * That the schema still requires nothing this leaves unsaid is checked at load,
 * so a new requirement cannot leave this behind.
 */
export const depthStackDefaultRecipe: Readonly<Record<string, CanonicalValue>> = {};

const schemaFields = (depthStackRecipeSchema as {
  fields: Record<string, { optional?: true }>;
}).fields;

const stray = Object.keys(depthStackDefaultRecipe).filter((name) => !Object.hasOwn(schemaFields, name));
if (stray.length > 0) {
  throw new Error(`DepthStack default Recipe states unknown ${stray.join(", ")}`);
}

const unsaid = Object.entries(schemaFields)
  .filter(([, field]) => field.optional !== true)
  .map(([name]) => name)
  .filter((name) => !Object.hasOwn(depthStackDefaultRecipe, name));
if (unsaid.length > 0) {
  throw new Error(`DepthStack default Recipe leaves required ${unsaid.join(", ")} unset`);
}

export const depthStackRecipeFacet: RecipeFacet = {
  surface: "track",
  schema: depthStackRecipeSchema,
  defaults: depthStackDefaultRecipe,
  effective: depthStackEffective,
  apply: (properties, current) => {
    const program = asProgram(current["program"]);
    const stackId = typeof program.id === "string" ? program.id : STACK_ID;
    const recipe: SvsRecipe = {
      contract: "svml.svs-recipe@1", path: `depth-stack.${stackId}`, properties,
    };
    const cards = (Array.isArray(program.cards) ? program.cards : [])
      .map((card: DepthStackCard) => restyle(recipe, stackId, card));
    return {
      program: {
        ...program, spec: decodeDepthStackSpec(recipe), cards,
      } as unknown as CanonicalValue,
    };
  },
};
