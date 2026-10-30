import type { ManagedProgramState } from "@hypit/runtime-local/extension";
import { runProcess } from "./process.js";

type MediaToolVersion =
  | { readonly state: "ready"; readonly version: string }
  | { readonly state: "down" | "mismatch"; readonly detail: string };

async function mediaToolVersion(path: string): Promise<MediaToolVersion> {
  try {
    const result = await runProcess({
      executable: path,
      argv: ["-version"],
      timeoutMs: 15_000,
      maxOutputBytes: 4 * 1024 * 1024,
    });
    const version = Buffer.from(result.stdout).toString("utf8").split(/\r?\n/u, 1)[0]?.trim() ?? "";
    return version.length > 0
      ? { state: "ready", version }
      : { state: "mismatch", detail: `${path} returned no version` };
  } catch (error) {
    return { state: "down", detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function probeHtmlMediaTools(
  ffprobePath: string,
  ffmpegPath: string | undefined,
): Promise<ManagedProgramState> {
  const ffprobe = await mediaToolVersion(ffprobePath);
  if (ffprobe.state !== "ready") return { state: ffprobe.state, detail: ffprobe.detail };
  if (ffmpegPath === undefined) return { state: "ready" };
  const ffmpeg = await mediaToolVersion(ffmpegPath);
  if (ffmpeg.state !== "ready") return { state: ffmpeg.state, detail: ffmpeg.detail };
  return { state: "ready" };
}
