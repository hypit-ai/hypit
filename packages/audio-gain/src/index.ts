export { audioGainComponent } from "./component.js";
export {
  AUDIO_GAIN_PROCESS_FORMAT,
  assertAudioGainControl,
  audioGainControlOperator,
  audioGainControlProcess,
  audioGainOperator,
  audioGainProcess,
  evaluateAudioGainControl,
  readAudioGainProcess,
  readAudioGainProgram,
  sealAudioGainControl,
} from "./gain.js";
export type * from "./gain.js";
export {
  audioGainOperatorSpecSchema,
  audioGainManifest,
  audioGainModuleRef,
  audioGainProducers,
  audioGainTypes,
} from "./manifest.js";
