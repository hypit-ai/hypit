export { createLocalMediaProvider, localMediaProviderModuleRef } from "./provider.js";
export type { CreateLocalMediaProviderOptions } from "./provider.js";
export { supportsLocalAudioProgram } from "./support.js";
export { createMediaExecutionEnvironment } from "./environment.js";
export type { CreateMediaExecutionEnvironmentOptions } from "./environment.js";
export { executeMuxProgramMedia, executeRenderTimelineAudio } from "./execute.js";
export type {
  MediaArtifactGateway,
  MediaExecutionEnvironment,
  MediaOperationResult,
} from "./execute.js";
