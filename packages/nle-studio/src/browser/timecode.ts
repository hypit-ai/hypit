/** `hh:mm:ss:ff` for a frame count at the given frame rate. */
export function timecode(frame: number, fps: number) {
  const rate = Math.max(1, Math.round(fps)), value = Math.max(0, Math.round(frame)), seconds = Math.floor(value / rate);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, value % rate].map(part => String(part).padStart(2, '0')).join(':');
}
