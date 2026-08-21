import { readFileSync } from "node:fs";

import type { StudioArchive } from "./archive.js";
import type { ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import type { Observations } from "./observe.js";
import { preview } from "./programme.js";
import { renderPreview } from "./preview/render.js";
import type { RunPlan } from "./run.js";
import type { StudioSnapshot } from "./shared.js";
import { snapshot } from "./snapshot.js";
import { inspectStudioRun } from "./studio-preflight.js";
import type { StudioProjection } from "./studio-preflight.js";

export type StudioSession = {
  readonly snapshot: StudioSnapshot;
  readonly material: ReadonlyMap<string, ServedFile>;
  readonly observations: Observations;
  readonly projections: readonly StudioProjection[];
};

export async function readStudioSession(input: {
  readonly domain: StudioDomain;
  readonly run: RunPlan;
  readonly archive?: StudioArchive;
  readonly revision: number;
  readonly sourcePath?: string;
}): Promise<StudioSession> {
  const source = input.run.source;
  const inspection = inspectStudioRun(source, input.run);
  const outputRefs = [
    inspection.filmComposition,
    ...inspection.projections.map((projection) => projection.ref),
  ];
  const built = await preview({
    source,
    run: input.run,
    domain: input.domain,
    outputRefs,
    compositionRef: inspection.filmComposition,
    projections: inspection.projections,
    ...(input.archive === undefined ? {} : { archive: input.archive }),
  });
  const rendered = renderPreview({
    composition: built.composition,
    space: built.space as never,
    served: new Set(built.served.keys()),
  });
  const text = readFileSync(input.run.authorSource, "utf8");
  return {
    snapshot: snapshot(built, {
      revision: input.revision,
      path: input.sourcePath ?? input.run.authorSource,
      text,
      canvas: built.canvas,
      frameRate: built.frameRate,
      preview: { kind: "hyperframes", srcdoc: rendered },
    }),
    material: built.served,
    observations: source.observations,
    projections: inspection.projections,
  };
}
