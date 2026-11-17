import { runBoundedMediaProcess } from "./process.js";

export type LocalMediaToolchainOptions = {
  readonly ffmpegPath?: string;
  readonly ffprobePath?: string;
};

export type LocalMediaToolchain = {
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
};

export type LocalMediaToolchainInspection =
  | { readonly state: "ready"; readonly ffmpegVersion: string; readonly ffprobeVersion: string }
  | { readonly state: "unavailable" | "mismatch"; readonly diagnostic: string };

function executable(value: string | undefined, fallback: string, subject: string): string {
  const selected = value?.trim() || fallback;
  if (selected.length === 0) throw new Error(`${subject} executable is empty.`);
  return selected;
}

/** Close one embedding-selected pair of local media executables. */
export function resolveLocalMediaToolchain(options: LocalMediaToolchainOptions = {}): LocalMediaToolchain {
  return {
    ffmpegPath: executable(options.ffmpegPath, "ffmpeg", "FFmpeg"),
    ffprobePath: executable(options.ffprobePath, "ffprobe", "FFprobe"),
  };
}

async function version(path: string): Promise<string> {
  const bytes = await runBoundedMediaProcess({
    executable: path,
    argv: ["-version"],
    timeoutMs: 15_000,
    maxStdoutBytes: 4 * 1024 * 1024,
  });
  return Buffer.from(bytes).toString("utf8").split(/\r?\n/u, 1)[0]?.trim() ?? "";
}

/** Inspect availability only; individual byte operations remain responsible for their required codecs and filters. */
export async function inspectLocalMediaToolchain(
  toolchain: LocalMediaToolchain,
): Promise<LocalMediaToolchainInspection> {
  try {
    const [ffmpegVersion, ffprobeVersion] = await Promise.all([
      version(toolchain.ffmpegPath),
      version(toolchain.ffprobePath),
    ]);
    if (ffmpegVersion.length === 0 || ffprobeVersion.length === 0) {
      return { state: "mismatch", diagnostic: "FFmpeg or FFprobe returned no version." };
    }
    return { state: "ready", ffmpegVersion, ffprobeVersion };
  } catch (error) {
    return {
      state: "unavailable",
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}
