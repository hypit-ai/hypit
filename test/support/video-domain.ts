import { artifactManifest } from "@narratage/artifact";
import { compositionComponent, compositionManifest } from "@narratage/composition";
import { mediaComponent, mediaManifest } from "@narratage/media";
import { narrativeManifest } from "@narratage/narrative";
import { programSpaceManifest } from "@narratage/program-space";
import { semanticMapManifest } from "@narratage/semantic-map";
import { spatialComponent, spatialManifest } from "@narratage/spatial";
import { speechManifest } from "@narratage/speech";
import { speechEvidenceManifest } from "@narratage/speech-evidence";
import { temporalManifest } from "@narratage/temporal";
import { visualIrManifest } from "@narratage/visual-ir";

/** Shared test fixture only; production packages import only the contracts they use. */
export const videoContractManifests = [
  artifactManifest,
  narrativeManifest,
  mediaManifest,
  programSpaceManifest,
  speechManifest,
  speechEvidenceManifest,
  semanticMapManifest,
  spatialManifest,
  temporalManifest,
  visualIrManifest,
  compositionManifest,
] as const;

export { compositionComponent, mediaComponent, spatialComponent };
