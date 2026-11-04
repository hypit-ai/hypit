export { audioProgramComponent } from "./component.js";
export {
  audioProgramCapabilities,
  audioProgramDependency,
  audioProgramManifest,
  audioProgramModuleRef,
  audioProgramProducers,
  audioRenderRangeSchema,
  audioProgramSchema,
  audioProgramTypes,
} from "./manifest.js";
export {
  audioProgramGraphFromMediaSources,
  audioProgramMediaSources,
  audioProgramSampleFrames,
  audioProgramUseSampleSpan,
  sealAudioProgram,
  verifyAudioProgram,
} from "./program.js";
export type * from "./types.js";
export {
  isPointwiseOperatorTemporalSupport,
  pointwiseOperatorTemporalSupport,
} from "@hypit/audiovisual";
