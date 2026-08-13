/**
 * Stand-in footage, so a Source can be seen before anything has been shot.
 *
 * A Track cannot be built without the material it places, and refusing to draw
 * anything until every shot exists would make the preview useless for the part
 * of the work it is meant for. So material nobody has supplied becomes a black
 * frame of the right shape - announced as a placeholder, never as footage.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Placeholder = { readonly bytes: Uint8Array; readonly mediaType: string };

let cached: Placeholder | undefined | null;

/**
 * One second of black at the Source's own frame rate, with silence, so the
 * media pipeline can inspect and normalize it like any other recording.
 */
export function blackFrames(frameRate: { readonly numerator: number; readonly denominator: number },
  size: { readonly width: number; readonly height: number }): Placeholder | undefined {
  if (cached !== undefined) return cached ?? undefined;
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-black-"));
  const path = join(directory, "black.mp4");
  const rate = `${frameRate.numerator}/${frameRate.denominator}`;
  try {
    execFileSync("ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-i", `color=c=black:s=${size.width}x${size.height}:r=${rate}:d=1`,
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path,
    ], { timeout: 60_000 });
    cached = { bytes: readFileSync(path), mediaType: "video/mp4" };
  } catch {
    // No ffmpeg, so there is no placeholder either, and the Tracks that needed
    // material will say what they were waiting for.
    cached = null;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return cached ?? undefined;
}
