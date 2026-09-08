import type { PlannedBuild } from "@hypit/compiler-node";
import { NodeRunCompiler } from "@hypit/compiler-node";
import type { Candidate, OperationNode, Satisfaction, BuildTarget } from "@hypit/protocol";
import type { ArtifactAttachment } from "@hypit/workspace";
import {
  installRunFragmentHostFacets,
  runFrontendsFromHostFacets,
  RunFragmentRegistry,
  RunFrontendRegistry,
} from "@hypit/run";

import type { StudioBuildLibrary } from "./build-library.js";
import { observedCompiledSource } from "./compile.js";
import type { CompiledSource } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import { createObserver } from "./observe.js";

export type RunCompilation = {
  readonly graph: {
    readonly candidates: readonly Candidate[];
    readonly operations: readonly OperationNode[];
    readonly satisfactions: readonly Satisfaction[];
    readonly targets: readonly BuildTarget[];
  };
};

export type RunPlan = {
  readonly runPath: string;
  readonly authorSource: string;
  /** The observed Author graph used by this exact Run compilation. */
  readonly source: CompiledSource;
  readonly run: RunCompilation;
  readonly targets: readonly string[];
  readonly attachments: readonly ArtifactAttachment[];
  readonly plan: (run: RunCompilation, targets: readonly string[]) => PlannedBuild;
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
    installRunFragmentHostFacets(contribution.hostFacets ?? [], fragments);
    for (const frontend of runFrontendsFromHostFacets(contribution.hostFacets ?? [])) {
      frontends.register(frontend);
    }
  }
  const observer = createObserver(input.domain.surfaces, input.registry);
  const compiler = new NodeRunCompiler({
    authorCompiler: input.domain.createCompiler(observer.surfaces),
    fragments,
    frontends,
    ...(input.buildLibrary === undefined ? {} : {
      resolveHistoricalOutput: input.buildLibrary.resolveHistoricalOutput,
    }),
  });
  const compiled = await compiler.compileFile(input.run);
  const source = await observedCompiledSource(compiled.author, observer.observations());
  const targets = compiled.run.graph.targets.map((target) => target.output);
  return {
    runPath: input.run,
    authorSource: compiled.authorSource,
    source,
    run: compiled.run as RunCompilation,
    targets,
    attachments: compiled.attachments,
    plan(run, selected) {
      return compiler.planCompilation({
        ...compiled,
        run: {
          ...compiled.run,
          graph: {
            ...run.graph,
            targets: selected.map((output) => ({ output })),
          },
        },
      } as never);
    },
  };
}
