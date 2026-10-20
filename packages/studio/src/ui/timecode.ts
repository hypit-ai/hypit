/** The `MM:SS:FF` readout for a Timeline frame on its exact rational clock. */
export function frameTimecode(
  frame: number,
  rate: { readonly numerator: number; readonly denominator: number },
): string {
  const seconds = Math.floor((frame * rate.denominator) / rate.numerator);
  const frames = frame - Math.ceil((seconds * rate.numerator) / rate.denominator);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}
