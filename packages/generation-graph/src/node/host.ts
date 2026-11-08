import { randomBytes } from "node:crypto";

import { createResolvedClosure, link } from "@hypit/kernel";
import {
  verifyPackageContributions,
  type LoadedPackage,
} from "@hypit/loader";
import type { ProductHistory } from "@hypit/product";
import { orderedBuildId } from "@hypit/protocol";

import {
  createGenerationGraphLoweringHost,
  generationNodePackagesFromFacets,
  type InstalledGenerationNodePackage,
} from "../package.js";
import {
  acceptGenerationGraphBuild,
  prepareGenerationGraphTargets,
  type PreparedGenerationGraphSelection,
} from "../prepare.js";
import type {
  GenerationGraphLoweringHost,
  GenerationGraphProject,
} from "../types.js";
import {
  commitAcceptedGenerationGraphBuild,
  createNodeGenerationGraphProductResolver,
  readGenerationGraphProjectFile,
} from "./store.js";

export type NodeGenerationGraphProjectHost = {
  readonly program: import("@hypit/protocol").LinkedProgram;
  readonly lowering: GenerationGraphLoweringHost;
  prepare(
    project: GenerationGraphProject,
    targets: readonly string[],
  ): Promise<PreparedGenerationGraphSelection>;
};

/** Build one project Host from the exact package set already selected by the embedding application. */
export function createNodeGenerationGraphProjectHost(input: {
  readonly projectPath: string;
  readonly packages: readonly LoadedPackage[];
  readonly products: ProductHistory;
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
  const lowering = createGenerationGraphLoweringHost(
    installed,
    createNodeGenerationGraphProductResolver(input.projectPath, input.products),
  );
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

export type ExecutedGenerationGraphSelection<Submission extends { readonly id: string }> =
  | {
      readonly kind: "reuse";
      readonly prepared: Extract<PreparedGenerationGraphSelection, { readonly kind: "reuse" }>;
    }
  | {
      readonly kind: "build";
      readonly prepared: Extract<PreparedGenerationGraphSelection, { readonly kind: "build" }>;
      readonly submission: Submission;
      readonly project: GenerationGraphProject;
    };

export class AcceptedGenerationGraphBuildNotAttached extends Error {
  constructor(
    readonly build: string,
    cause: unknown,
  ) {
    super(`Runtime accepted Generation Build ${build}, but the project revision could not attach it.`, { cause });
    this.name = "AcceptedGenerationGraphBuildNotAttached";
  }
}

export function createGenerationGraphBuildId(now = Date.now()): string {
  return orderedBuildId(now, randomBytes(5).toString("hex").toUpperCase());
}

/**
 * Complete local orchestration. Runtime acceptance precedes the author transaction; accepted work is never
 * rolled back or silently attached to another revision when concurrent editing wins.
 */
export async function executeNodeGenerationGraphTargets<Submission extends { readonly id: string }>(input: {
  readonly projectPath: string;
  readonly host: NodeGenerationGraphProjectHost;
  readonly targets: readonly string[];
  readonly runtime: GenerationGraphRuntimePort<Submission>;
  readonly publicationStores: GenerationGraphPublicationStoreLocation;
  readonly build?: string;
}): Promise<ExecutedGenerationGraphSelection<Submission>> {
  const project = await readGenerationGraphProjectFile(input.projectPath);
  const prepared = await input.host.prepare(project, input.targets);
  if (prepared.kind === "reuse") return { kind: "reuse", prepared };
  const build = input.build ?? createGenerationGraphBuildId();
  const submission = await input.runtime.build({
    id: build,
    definition: prepared.definition,
    executionPackages: prepared.executionPackages,
    authoring: {
      sourcePath: input.projectPath,
      targets: prepared.targets.map((target) => target.node),
      publication: prepared.publication,
    },
    attachments: prepared.attachments,
    publicationStores: input.publicationStores,
  });
  if (submission.id !== build) {
    throw new Error(`Runtime accepted Generation Build as ${submission.id}, not ${build}.`);
  }
  try {
    const updated = await commitAcceptedGenerationGraphBuild(
      input.projectPath,
      acceptGenerationGraphBuild(prepared, build),
    );
    return { kind: "build", prepared, submission, project: updated };
  } catch (error) {
    throw new AcceptedGenerationGraphBuildNotAttached(build, error);
  }
}
