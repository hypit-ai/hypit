import type { AudiovisualProgram } from "@hypit/audiovisual";
import {
  partitionAudiovisualExecution,
  planAudiovisualDemand,
  type AudiovisualExecutionPlan,
} from "@hypit/audiovisual-execution";
import type { TemporalRange } from "@hypit/temporal/algebra";

import { resolveAudiovisualAudioSource } from "./source.js";
import type { AudiovisualAudioSourceSet } from "./source.js";

export type AudiovisualAudioDemand = {
  readonly range: TemporalRange;
};

/** Plan the currently supported continuous Audio terminal execution explicitly. */
export function planAudiovisualAudioExecution(
  program: AudiovisualProgram,
  sources: AudiovisualAudioSourceSet,
  demand: AudiovisualAudioDemand,
): AudiovisualExecutionPlan {
  const planned = planAudiovisualDemand(program, {
    audio: { range: demand.range },
  });
  return partitionAudiovisualExecution(planned, [
    ...planned.nodes.map((node) => ({ node: node.id, terminal: "audio-terminal" })),
    ...planned.sourceTasks.map((source) => {
      resolveAudiovisualAudioSource(sources, source.source, source.output);
      return {
        node: source.id,
        terminal: "audio-terminal",
        sourceAccess: source.temporal.kind === "constant"
          ? { kind: "constant" as const }
          : { kind: "range" as const },
      };
    }),
  ]);
}
