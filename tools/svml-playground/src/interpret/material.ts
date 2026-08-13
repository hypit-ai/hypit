import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";

import type { SynchronizedMedia } from "@narratage/media";
import type { Digest } from "@narratage/protocol";
import type { ProgramSpace } from "@narratage/program-space";

import type { ProvidedFile } from "./run.js";

export type Material = {
  readonly media: SynchronizedMedia;
  readonly path: string;
};

/** Why a file an author supplied could not be shown, in their words. */
export type MaterialRefusal = { readonly output: string; readonly reason: string };

export type MaterialSet = {
  /** Material for one Logical Output, when it can be shown as authored. */
  get(output: string): Material | undefined;
  /** Files that were supplied but cannot be shown, and why. */
  readonly refusals: readonly MaterialRefusal[];
  /** Digest to path, for serving the bytes the composition references. */
  readonly files: ReadonlyMap<string, { readonly path: string; readonly mediaType: string }>;
};

type Probe = {
  readonly width: number;
  readonly height: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly frameCount: number;
};

function probe(path: string): Probe | undefined {
  let raw: string;
  try {
    raw = execFileSync("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,r_frame_rate,nb_frames:format=duration",
      "-of", "json", path,
    ], { encoding: "utf8", timeout: 10_000 });
  } catch {
    // No ffprobe, or nothing it recognizes. The Item keeps its placeholder.
    return undefined;
  }
  const parsed = JSON.parse(raw) as {
    streams?: readonly { width?: number; height?: number; r_frame_rate?: string; nb_frames?: string }[];
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const rate = /^(\d+)\/(\d+)$/u.exec(stream?.r_frame_rate ?? "");
  if (stream?.width === undefined || stream.height === undefined || rate === null) return undefined;
  const numerator = Number(rate[1]);
  const denominator = Number(rate[2]);
  if (numerator <= 0 || denominator <= 0) return undefined;
  // Containers do not always carry a frame count; duration times the rate is
  // exact enough for a preview, and never zero.
  const declared = Number(stream.nb_frames);
  const frameCount = Number.isSafeInteger(declared) && declared > 0
    ? declared
    : Math.max(1, Math.round(Number(parsed.format?.duration ?? 0) * numerator / denominator));
  return { width: stream.width, height: stream.height, numerator, denominator, frameCount };
}

/**
 * Identity for a file the Playground serves.
 *
 * A content hash would mean reading every byte of every source on every reread.
 * The preview only needs an identity that is stable for unchanged bytes and
 * different for changed ones, which path, size and mtime already give.
 */
function identity(path: string, size: number, modified: number): Digest {
  const hex = createHash("sha256").update(`${path} ${size} ${modified}`).digest("hex");
  return `sha256:${hex}`;
}

/**
 * Turn the files a Run Source names into material the Track packages accept.
 *
 * A Media Item shows real frames only when its source already lives in the
 * program's frame domain. Normalizing it is the media pipeline's job and takes
 * a real transcode, so the preview refuses instead of quietly resampling — and
 * says so, because a silent placeholder next to a file the author supplied looks
 * like a bug rather than a boundary.
 */
export function collectMaterial(
  provided: readonly ProvidedFile[],
  space: ProgramSpace,
): MaterialSet {
  const material = new Map<string, Material>();
  const files = new Map<string, { path: string; mediaType: string }>();
  const refusals: MaterialRefusal[] = [];

  for (const file of provided) {
    if (!file.mediaType.startsWith("video/")) continue;
    const info = statSync(file.path, { throwIfNoEntry: false });
    if (info === undefined) continue;
    const measured = probe(file.path);
    if (measured === undefined) {
      refusals.push({ output: file.output, reason: "could not be probed; is ffprobe installed?" });
      continue;
    }
    if (measured.numerator !== space.frameRate.numerator
      || measured.denominator !== space.frameRate.denominator) {
      refusals.push({
        output: file.output,
        reason: `is ${measured.numerator}/${measured.denominator} fps, and the program is`
          + ` ${space.frameRate.numerator}/${space.frameRate.denominator}; a build would normalize it`,
      });
      continue;
    }
    const digest = identity(file.path, info.size, info.mtimeMs);
    files.set(digest, { path: file.path, mediaType: file.mediaType });
    material.set(file.output, {
      path: file.path,
      media: {
        contract: "svml.synchronized-media@1",
        timeline: {
          frameRate: { numerator: measured.numerator, denominator: measured.denominator },
          frameCount: measured.frameCount,
        },
        visual: {
          artifact: { kind: "blob", digest, size: info.size, mediaType: file.mediaType },
          width: measured.width,
          height: measured.height,
        },
      },
    });
  }

  return { get: (output) => material.get(output), refusals, files };
}
