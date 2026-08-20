/**
 * Stand-in footage, so a Source can be seen before anything has been shot.
 *
 * A Track cannot be built without the material it places, and refusing to draw
 * anything until every shot exists would make the preview useless for the part
 * of the work it is meant for. So material nobody has supplied becomes a black
 * frame of the right shape - announced as a placeholder, never as footage.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Placeholder = { readonly bytes: Uint8Array; readonly mediaType: string };

/** One black stand-in per shape and length, since each costs an ffmpeg run. */
const cache = new Map<string, Placeholder | null>();

/**
 * A picture the Source already points at, held for as long as the shot it
 * stands in for. A reference frame is not the take, but it is the right subject
 * in the right shape, which is what makes a preview worth looking at before
 * anything has been generated.
 */
export function heldPicture(
  bytes: Uint8Array,
  seconds: number,
  frameRate: { readonly numerator: number; readonly denominator: number },
  size: { readonly width: number; readonly height: number },
): Placeholder | undefined {
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-held-"));
  const source = join(directory, "reference");
  const path = join(directory, "held.mp4");
  writeFileSync(source, bytes);
  try {
    execFileSync("ffmpeg", [
      "-v", "error", "-y",
      "-loop", "1", "-i", source,
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-t", String(Math.max(1, seconds)),
      "-r", `${frameRate.numerator}/${frameRate.denominator}`,
      "-vf", `scale=${size.width}:${size.height}:force_original_aspect_ratio=increase,`
        + `crop=${size.width}:${size.height},setsar=1`,
      "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path,
    ], { timeout: 120_000, windowsHide: true });
    return { bytes: readFileSync(path), mediaType: "video/mp4" };
  } catch {
    // Without ffmpeg there is no stand-in of any kind, which the caller already
    // handles by leaving the material unsupplied.
    return undefined;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * Black at the Source's own frame rate, with silence, for as long as the shot
 * it stands in for declares. A stand-in of the wrong length would make the
 * timeline disagree with the picture about how long the programme is.
 */
export function blackFrames(
  frameRate: { readonly numerator: number; readonly denominator: number },
  size: { readonly width: number; readonly height: number },
  seconds: number,
): Placeholder | undefined {
  const key = `${frameRate.numerator}/${frameRate.denominator}:${size.width}x${size.height}:${seconds}`;
  const kept = cache.get(key);
  if (kept !== undefined) return kept ?? undefined;
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-black-"));
  const path = join(directory, "black.mp4");
  const rate = `${frameRate.numerator}/${frameRate.denominator}`;
  try {
    execFileSync("ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-i",
      `color=c=black:s=${size.width}x${size.height}:r=${rate}:d=${Math.max(1, seconds)}`,
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path,
    ], { timeout: 60_000, windowsHide: true });
    cache.set(key, { bytes: readFileSync(path), mediaType: "video/mp4" });
  } catch {
    // No ffmpeg, so there is no stand-in either, and the Tracks that needed
    // material will say what they were waiting for.
    cache.set(key, null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return cache.get(key) ?? undefined;
}
