import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";

import type { StudioArchive } from "./archive.js";
import type { ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import type { Observations } from "./observe.js";
import { preview } from "./programme.js";
import { renderPreview } from "./preview/render.js";
import type { RunPlan } from "./run.js";
import type { StudioSnapshot } from "./shared.js";
import type { StudioAdapterRegistry } from "./studio-registry.js";
import { snapshot } from "./snapshot.js";
import { inspectStudioRun } from "./studio-preflight.js";
import type { StudioProjection } from "./studio-preflight.js";
import type { StudioSourceFile } from "./parameters.js";

function sourceFiles(run: RunPlan): readonly StudioSourceFile[] {
  const paths = [run.runPath, run.authorSource, ...run.source.compiled.closure.units.map((unit) => unit.id)];
  return [...new Set(paths)].flatMap((path): StudioSourceFile[] => {
    if (!existsSync(path)) return [];
    try {
      const language = path.endsWith(".svs") ? "svs" : path.endsWith(".svrun") ? "svrun" : "svml";
      const unit = run.source.compiled.closure.units.find((candidate) => candidate.id === path);
      return [{
        path,
        text: readFileSync(path, "utf8"),
        language,
        role: path === run.runPath ? "run" : path === run.authorSource ? "author" : "dependency",
        ...(unit === undefined ? {} : { imports: unit.imports }),
      }];
    } catch {
      return [];
    }
  });
}

export type StudioSession = {
  readonly snapshot: StudioSnapshot;
  readonly material: ReadonlyMap<string, ServedFile>;
  readonly observations: Observations;
  readonly projections: readonly StudioProjection[];
};

export async function readStudioSession(input: {
  readonly domain: StudioDomain;
  readonly registry: StudioAdapterRegistry;
  readonly run: RunPlan;
  readonly archive?: StudioArchive;
  readonly revision: number;
  readonly sourcePath?: string;
  readonly workspaceRoot: string;
}): Promise<StudioSession> {
  const source = input.run.source;
  const inspection = inspectStudioRun(input.registry, source, input.run);
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
  const files = sourceFiles(input.run);
  return {
    snapshot: snapshot(input.registry, built, {
      revision: input.revision,
      path: input.sourcePath ?? input.run.authorSource,
      text,
      run: {
        path: relative(input.workspaceRoot, input.run.runPath),
        targets: input.run.targets,
        satisfactions: input.run.run.graph.satisfactions.map((item) => ({
          output: item.output,
          candidate: item.candidate,
        })),
      },
      canvas: built.canvas,
      frameRate: built.frameRate,
      preview: { kind: "hyperframes", srcdoc: rendered },
      workspaceRoot: input.workspaceRoot,
      sourceFiles: files,
      surfaces: input.domain.surfaces,
    }),
    material: built.served,
    observations: source.observations,
    projections: inspection.projections,
  };
}
