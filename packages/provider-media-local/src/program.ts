import { probeMediaToolchain } from "@hypit/media-local";
import type { ManagedProgram } from "@hypit/execution-environment-local/extension";

/** A system/custom FFmpeg deployment is external: programs up probes it but never mutates a package manager. */
export function localMediaToolchainProgram(input: {
  readonly id: string;
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
}): ManagedProgram {
  return {
    id: input.id,
    async probe() {
      const state = await probeMediaToolchain({ ffmpegPath: input.ffmpegPath, ffprobePath: input.ffprobePath });
      return state.state === "ready"
        ? { state: "ready" as const }
        : { state: state.state, detail: state.detail };
    },
  };
}
