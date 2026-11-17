export function peakWaveformFilter(width: number, height: number): string {
  if (!Number.isSafeInteger(width) || width < 16 || width > 2048) {
    throw new Error("Waveform width must be an integer from 16 through 2048.");
  }
  if (!Number.isSafeInteger(height) || height < 16 || height > 512) {
    throw new Error("Waveform height must be an integer from 16 through 512.");
  }
  return `showwavespic=s=${width}x${height}:colors=white:filter=peak`;
}
