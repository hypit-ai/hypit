/** The `MM:SS:FF` readout for a Timeline frame at an exact frame rate. */
export function frameTimecode(frame: number, rate: { readonly numerator: number; readonly denominator: number }): string {
  const seconds = Math.floor((frame * rate.denominator) / rate.numerator);
  // Count frames from the first frame of this second. At 30000/1001 a second holds 29 or 30
  // frames, so `frame % 30` would wrap early and make the readout step backwards.
  const frames = frame - Math.ceil((seconds * rate.numerator) / rate.denominator);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}
