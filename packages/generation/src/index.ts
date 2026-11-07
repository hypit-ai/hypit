export { generationComponent } from "./component.js";
export {
  assertGenerationBlobRef,
  sealGeneratedAudioSet,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
  verifyGeneratedImageSet,
  verifyGeneratedAudioSet,
  verifyGeneratedVideoSet,
} from "./identity.js";
export { generationManifest, generationModuleRef, generationProducers, generationTypes } from "./manifest.js";
export {
  generatedImageSetSchema,
  generatedAudioSetSchema,
  generatedVideoSetSchema,
} from "./schema.js";
export type * from "./types.js";

/** Generation-domain answer for products that enter generation history after execution. */
export const generationProductPublication = Object.freeze({
  publisher: "hypit.generation-product@1",
});
