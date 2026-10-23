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
export type { MediaProbe, VisualBoundary } from "./files.js";
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
