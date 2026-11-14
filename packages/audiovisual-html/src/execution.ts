import type { AudiovisualProgram } from "@hypit/audiovisual";
import {
  partitionAudiovisualExecution,
  planAudiovisualDemand,
  type AudiovisualExecutionPlan,
  type AudiovisualPictureDemand,
} from "@hypit/audiovisual-execution";

import { resolveAudiovisualHtmlSource } from "./source.js";
import type { AudiovisualHtmlSourceSet } from "./source.js";

/** Plan the currently supported single-HTML-terminal execution explicitly. */
export function planAudiovisualHtmlExecution(
  program: AudiovisualProgram,
  sources: AudiovisualHtmlSourceSet,
  demand: AudiovisualPictureDemand,
): AudiovisualExecutionPlan {
  const planned = planAudiovisualDemand(program, {
    picture: {
      range: demand.range,
      ...(demand.samples === undefined ? {} : { samples: demand.samples }),
    },
  });
  return partitionAudiovisualExecution(planned, [
    ...planned.nodes.map((node) => ({ node: node.id, terminal: "html-terminal" })),
    ...planned.sourceTasks.map((source) => {
      const implementation = resolveAudiovisualHtmlSource(
        sources,
        source.source,
        source.output,
      ).implementation;
      const sourceAccess = source.temporal.kind === "constant"
        ? { kind: "constant" as const }
        : implementation.kind === "prepared-media" || implementation.kind === "picture-product"
          ? { kind: "range" as const }
          : { kind: "point" as const };
      return { node: source.id, terminal: "html-terminal", sourceAccess };
    }),
  ]);
}
