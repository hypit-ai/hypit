import { artifactManifest } from "@narratage/artifact";
import { compositionComponent, compositionManifest } from "@narratage/composition";
import { mediaComponent, mediaManifest } from "@narratage/media";
import { narrativeManifest } from "@narratage/narrative";
import { programSpaceManifest } from "@narratage/program-space";
import { semanticMapManifest } from "@narratage/semantic-map";
import { speechManifest } from "@narratage/speech";
import { speechEvidenceManifest } from "@narratage/speech-evidence";
import { visualIrManifest } from "@narratage/visual-ir";

/** Test-only explicit video contract closure. Production packages import only the contracts they use. */
export const videoContractManifests = [
  artifactManifest,
  narrativeManifest,
  mediaManifest,
  programSpaceManifest,
  speechManifest,
  speechEvidenceManifest,
  semanticMapManifest,
  visualIrManifest,
  compositionManifest,
] as const;

export { compositionComponent, mediaComponent };
