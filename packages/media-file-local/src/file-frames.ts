import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { runProcessOutput } from "@hypit/media-local/process";

export type DecodedFrame = { readonly at: number; readonly path: string };

/** Decode a source interval once, retaining each decoded frame and its actual source timestamp. */
export async function decodeMediaFrames(source: string, start: number, end: number, directory: string): Promise<readonly DecodedFrame[]> {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start) throw new Error("Native frames need 0 <= start < end");
  await mkdir(directory, { recursive: true });
  const times: number[] = [];
  let numerator = 0, denominator = 0;
  await runProcessOutput("ffmpeg", ["-hide_banner", "-loglevel", "info", "-nostdin", "-copyts", "-start_at_zero",
    ...(start > 0 ? ["-ss", String(start)] : []), "-i", source,
    "-map", "0:v:0", "-an", "-vf", `trim=start=${start}:end=${end},showinfo=checksum=0`,
    "-fps_mode", "passthrough", "-pix_fmt", "yuvj420p", "-q:v", "3", "-start_number", "0", join(directory, "%09d.jpg"),
  ], 300_000, line => {
    const base = /config in time_base:\s*(\d+)\/(\d+)/u.exec(line);
    if (base !== null) { numerator = Number(base[1]); denominator = Number(base[2]); }
    const pts = /\bn:\s*\d+\s+pts:\s*(-?\d+)/u.exec(line);
    if (pts !== null && denominator > 0) times.push(Number(pts[1]) * numerator / denominator);
  });
  if (times.length === 0) throw new Error(`No video frames in [${start}, ${end}) s`);
  return times.map((at, index) => ({ at, path: join(directory, `${String(index).padStart(9, "0")}.jpg`) }));
}
