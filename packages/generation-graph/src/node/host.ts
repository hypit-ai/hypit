import { createResolvedClosure, link } from "@hypit/kernel";
import {
  verifyPackageContributions,
  type LoadedPackage,
} from "@hypit/loader";

import {
  createGenerationGraphLoweringHost,
  generationNodePackagesFromFacets,
  type InstalledGenerationNodePackage,
} from "../package.js";
import {
  prepareGenerationGraphTargets,
  type PreparedGenerationGraphBuild,
} from "../prepare.js";
import type {
  GenerationGraphLoweringHost,
  GenerationGraphProject,
  GenerationNodeAssetHost,
} from "../types.js";
import {
  readGenerationGraphProjectFile,
} from "./store.js";

export type NodeGenerationGraphProjectHost = {
  readonly program: import("@hypit/protocol").LinkedProgram;
  readonly lowering: GenerationGraphLoweringHost;
  prepare(
    project: GenerationGraphProject,
    targets: readonly string[],
  ): Promise<PreparedGenerationGraphBuild>;
};

/** Build one project Host from the exact package set already selected by the embedding application. */
export function createNodeGenerationGraphProjectHost(input: {
  readonly packages: readonly LoadedPackage[];
  readonly assets?: GenerationNodeAssetHost;
}): NodeGenerationGraphProjectHost {
  verifyPackageContributions(input.packages.map((item) => item.contribution));
  const manifests = input.packages.flatMap((item) =>
    (item.contribution.modules ?? []).map((module) => module.manifest));
  const program = link(createResolvedClosure(manifests), []);
  const installed: InstalledGenerationNodePackage[] = input.packages.flatMap((item) =>
    generationNodePackagesFromFacets(item.contribution.facets ?? []).map((implementation) => ({
      specifier: item.specifier,
      implementation,
    })));
  const lowering = createGenerationGraphLoweringHost(installed, input.assets);
  return {
    program,
    lowering,
    async prepare(project, targets) {
      return await prepareGenerationGraphTargets(project, program, lowering, targets);
    },
  };
}

export type GenerationGraphPublicationStoreLocation = {
  readonly root: string;
  readonly historyPath: string;
  readonly productsPath: string;
};

export type GenerationGraphRuntimeRequest = {
  readonly id: string;
  readonly definition: import("@hypit/protocol").BuildDefinition;
  readonly executionPackages: readonly string[];
  readonly authoring: {
    readonly sourcePath: string;
    readonly targets: readonly string[];
    readonly publication: import("@hypit/protocol").PublicationIntent;
  };
  readonly attachments: readonly import("../types.js").GenerationGraphResourceAttachment[];
  readonly publicationStores: GenerationGraphPublicationStoreLocation;
};

export type GenerationGraphRuntimePort<Submission extends { readonly id: string }> = {
  build(request: GenerationGraphRuntimeRequest): Promise<Submission>;
};

export function createGenerationGraphRuntimeRequest(input: {
  readonly projectPath: string;
  readonly prepared: PreparedGenerationGraphBuild;
  readonly publicationStores: GenerationGraphPublicationStoreLocation;
  readonly build: string;
}): GenerationGraphRuntimeRequest {
  return {
    id: input.build,
    definition: input.prepared.definition,
    executionPackages: input.prepared.executionPackages,
    authoring: {
      sourcePath: input.projectPath,
      targets: input.prepared.targets.map((target) => target.node),
      publication: input.prepared.publication,
    },
    attachments: input.prepared.attachments,
    publicationStores: input.publicationStores,
  };
}

export type ExecutedGenerationGraphBuild<Submission extends { readonly id: string }> = {
  readonly kind: "build";
  readonly prepared: PreparedGenerationGraphBuild;
  readonly submission: Submission;
  /** The exact recipe revision instantiated by this Build. It is never rewritten by submission. */
  readonly project: GenerationGraphProject;
};

/**
 * Complete local orchestration. A Build instantiates one saved revision without modifying author state.
 */
export async function executeNodeGenerationGraphTargets<Submission extends { readonly id: string }>(input: {
  readonly projectPath: string;
  readonly host: NodeGenerationGraphProjectHost;
  readonly targets: readonly string[];
  readonly runtime: GenerationGraphRuntimePort<Submission>;
  readonly publicationStores: GenerationGraphPublicationStoreLocation;
  /** Assigned by the common long-running submission boundary; unused when this selection is reused. */
  readonly build: string;
}): Promise<ExecutedGenerationGraphBuild<Submission>> {
  const project = await readGenerationGraphProjectFile(input.projectPath);
  const prepared = await input.host.prepare(project, input.targets);
  const build = input.build;
  const submission = await input.runtime.build(createGenerationGraphRuntimeRequest({
    projectPath: input.projectPath,
    prepared,
    publicationStores: input.publicationStores,
    build,
  }));
  if (submission.id !== build) {
    throw new Error(`Runtime accepted Generation Build as ${submission.id}, not ${build}.`);
  }
  return { kind: "build", prepared, submission, project };
}
