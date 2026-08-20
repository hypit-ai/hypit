import { artifactManifest } from "@hypit/artifact";
import { compositionComponent, compositionManifest } from "@hypit/composition";
import { mediaComponent, mediaManifest } from "@hypit/media";
import { narrativeManifest } from "@hypit/narrative";
import { programSpaceManifest } from "@hypit/program-space";
import { semanticTrackManifest } from "@hypit/semantic-track";
import { spatialComponent, spatialManifest } from "@hypit/spatial";
import { speechManifest } from "@hypit/speech";
import { speechEvidenceManifest } from "@hypit/speech-evidence";
import { temporalManifest } from "@hypit/temporal";
import { visualIrManifest } from "@hypit/visual-ir";

/** Shared test fixture only; production packages import only the contracts they use. */
export const videoContractManifests = [
  artifactManifest,
  narrativeManifest,
  mediaManifest,
  programSpaceManifest,
  speechManifest,
  speechEvidenceManifest,
  semanticTrackManifest,
  spatialManifest,
  temporalManifest,
  visualIrManifest,
  compositionManifest,
] as const;

export { compositionComponent, mediaComponent, spatialComponent };
