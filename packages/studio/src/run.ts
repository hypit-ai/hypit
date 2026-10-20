import type { PreparedBuild } from "@hypit/hypit/compiler";
import { RunCompiler } from "@hypit/hypit/compiler";
import type { RunGraph } from "@hypit/hypit/protocol";
import type { BlobAttachment } from "@hypit/hypit/workspace";
import {
  installRunFragmentFacets,
  runFrontendsFromFacets,
  RunFragmentRegistry,
  RunFrontendRegistry,
} from "@hypit/hypit/run";

import type { StudioBuildLibrary } from "./build-library.js";
import { observedCompiledSource } from "./compile.js";
import type { CompiledSource } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import { createObserver } from "./observe.js";

export type RunCompilation = {
  readonly graph: RunGraph;
};

export type RunPlan = {
  readonly runPath: string;
  readonly authorSource: string;
  /** The observed Author graph used by this exact Run compilation. */
  readonly source: CompiledSource;
  readonly run: RunCompilation;
  readonly targets: readonly string[];
  readonly attachments: readonly BlobAttachment[];
  readonly prepare: (run: RunCompilation, targets: readonly string[]) => PreparedBuild;
};

/** Compile the exact Run Source selected for Studio, using normal Run facets. */
export async function loadStudioRun(input: {
  readonly run: string;
  readonly domain: StudioDomain;
  readonly registry: import("./studio-registry.js").StudioCompanionRegistry;
  readonly buildLibrary?: StudioBuildLibrary;
}): Promise<RunPlan> {
  const fragments = new RunFragmentRegistry();
  const frontends = new RunFrontendRegistry();
  for (const contribution of input.domain.contributions) {
    installRunFragmentFacets(contribution.facets ?? [], fragments);
    for (const frontend of runFrontendsFromFacets(contribution.facets ?? [])) {
      frontends.register(frontend);
    }
  }
  const observer = createObserver(input.domain.surfaces, input.registry);
  const compiler = new RunCompiler({
    authorCompiler: input.domain.createCompiler(observer.surfaces),
    fragments,
    frontends,
    ...(input.buildLibrary === undefined ? {} : {
      locateHistoricalOutput: input.buildLibrary.locateHistoricalOutput,
      resolveHistoricalOutput: input.buildLibrary.resolveHistoricalOutput,
    }),
  });
  const compiled = await compiler.compileEntry(input.run);
  const source = await observedCompiledSource(compiled.author, observer.observations());
  const targets = compiled.run.graph.targets.map((target) => target.output);
  return {
    runPath: input.run,
    authorSource: compiled.authorSource,
    source,
    run: compiled.run as RunCompilation,
    targets,
    attachments: compiled.attachments,
    prepare(run, selected) {
      return compiler.prepareVariant(compiled, {
        ...run.graph,
        targets: selected.map((output) => ({ output })),
      });
    },
  };
}
