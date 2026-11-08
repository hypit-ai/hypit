/** Local-file operations and observations. This port does not create Runtime or Build state. */
export { decodeMediaFrames } from "./file-frames.js";
export type { DecodedFrame } from "./file-frames.js";
export { snapshotFrameAnnotation, writeFrameGrid } from "./frame-grid.js";
export {
  cutClip,
  cutFrame,
  gridFrameCount,
  gridFrames,
  gridSampleTimes,
  intervalSamples,
  probeMedia,
  visualBoundaries,
} from "./files.js";
export { isMediaCommand, mediaCommands, runMediaCli, writeMediaHelp } from "./files.js";
export type { MediaCommand, MediaCommandOutput, MediaProbe, VisualBoundary } from "./files.js";
export {
  importLocalMediaAsset,
  localMediaImportSelection,
  mediaAssetIdFromFile,
  mediaFileExtension,
  mediaTypeFromFile,
} from "@hypit/media-local";
export type {
  LocalMediaAssetImportRequest,
  LocalMediaImportSelection,
} from "@hypit/media-local";
export { renderWaveform, renderWaveformView, writeWaveform } from "./waveform.js";
export type {
  AudioInspection,
  AudioStream,
  ObservationMarker,
  WaveformFilter,
  WaveformOptions,
  WaveformScale,
  WaveformViewOptions,
} from "./waveform.js";
export { renderSpectrogram, renderSpectrogramView, writeSpectrogram } from "./spectrogram.js";
export type {
  FrequencyScale,
  SpectrogramOptions,
  SpectrogramScale,
  SpectrogramViewOptions,
} from "./spectrogram.js";
export { speechEvidenceFile } from "./speech.js";
