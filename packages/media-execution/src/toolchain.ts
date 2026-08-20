import { execFile } from "node:child_process";

export type MediaToolchainState =
  | { readonly state: "ready"; readonly ffprobeVersion: string; readonly ffmpegVersion?: string }
  | { readonly state: "down" | "mismatch"; readonly detail: string };

const REQUIRED_ENCODERS = ["aac", "libx264", "pcm_s16le"] as const;
const REQUIRED_FILTERS = ["aformat", "amix", "aresample", "asetpts", "atempo", "atrim", "scale", "setsar"] as const;

function run(executable: string, args: readonly string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(executable, [...args], {
      timeout: 15_000,
      shell: false,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve(error === null
        ? { ok: true, output: stdout.trim() }
        : { ok: false, output: (stderr.trim() || error.message).split("\n").at(-1) ?? "" });
    });
  });
}

function firstLine(value: string): string {
  return value.split(/\r?\n/u, 1)[0]?.trim() ?? "";
}

function missingNames(output: string, required: readonly string[]): readonly string[] {
  return required.filter((name) => !new RegExp(`(?:^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:\\s|$)`, "mu")
    .test(output));
}

/**
 * Compatibility probe for a deployment-owned FFmpeg toolchain. It deliberately
 * checks the commands the shared execution body uses instead of requiring one
 * blessed version number. A managed distribution may pin binaries separately;
 * a custom installation remains valid when it supplies the same capability.
 */
export async function probeMediaToolchain(options: {
  readonly ffprobePath: string;
  readonly ffmpegPath?: string;
}): Promise<MediaToolchainState> {
  const probeVersion = await run(options.ffprobePath, ["-version"]);
  if (!probeVersion.ok) {
    return { state: "down", detail: `${options.ffprobePath} is unavailable: ${probeVersion.output}` };
  }
  const ffprobeVersion = firstLine(probeVersion.output);
  if (ffprobeVersion.length === 0) return { state: "mismatch", detail: "ffprobe returned no version" };
  if (options.ffmpegPath === undefined) return { state: "ready", ffprobeVersion };

  const [ffmpegVersionResult, encoders, filters] = await Promise.all([
    run(options.ffmpegPath, ["-version"]),
    run(options.ffmpegPath, ["-hide_banner", "-encoders"]),
    run(options.ffmpegPath, ["-hide_banner", "-filters"]),
  ]);
  if (!ffmpegVersionResult.ok) {
    return { state: "down", detail: `${options.ffmpegPath} is unavailable: ${ffmpegVersionResult.output}` };
  }
  if (!encoders.ok || !filters.ok) {
    return { state: "mismatch", detail: "ffmpeg could not enumerate its encoders and filters" };
  }
  const missingEncoders = missingNames(encoders.output, REQUIRED_ENCODERS);
  const missingFilters = missingNames(filters.output, REQUIRED_FILTERS);
  if (missingEncoders.length > 0 || missingFilters.length > 0) {
    return {
      state: "mismatch",
      detail: [
        missingEncoders.length === 0 ? "" : `missing encoders ${missingEncoders.join(", ")}`,
        missingFilters.length === 0 ? "" : `missing filters ${missingFilters.join(", ")}`,
      ].filter(Boolean).join("; "),
    };
  }
  const ffmpegVersion = firstLine(ffmpegVersionResult.output);
  return ffmpegVersion.length === 0
    ? { state: "mismatch", detail: "ffmpeg returned no version" }
    : { state: "ready", ffprobeVersion, ffmpegVersion };
}
