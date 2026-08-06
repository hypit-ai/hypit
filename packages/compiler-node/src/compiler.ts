import { resolve } from "node:path";

import {
  sealBuildRequest,
  start,
} from "@svml/core";
import {
  compileSourceClosure,
  resolveCompiledSourceExport,
} from "@svml/elaborator";
import type {
  AuthorFrontendRegistryLike,
  AuthorSourceDiscovery,
  AuthorSourceUnit,
  CompiledSourceClosure,
  AuthorRecordAdmitter,
} from "@svml/elaborator";
import type { ArtifactAttachment, Workspace, WorkspaceSession } from "@svml/host";
import type {
  BuildPlan,
  BuildRequest,
  BuildState,
  Satisfaction,
  NeedAcceptance,
} from "@svml/protocol";
import { resolveRealization } from "@svml/realization";
import type { RealizationOverlay } from "@svml/realization";
import {
  TypeValidatorRegistry,
  createRecordAdmitter,
} from "@svml/validation";
import type { TypeValidatorRegistryLike } from "@svml/validation";
import { NodeFilesystemWorkspace } from "@svml/workspace-fs-node";

import { NodeCompilerError } from "./error.js";
import type { ModulePackageRegistryLike } from "./modules.js";

type DiscoveredUnit = {
  readonly source: AuthorSourceUnit;
  readonly frontend: string;
  readonly discovery: AuthorSourceDiscovery;
};

async function discoverClosure(
  entry: AuthorSourceUnit,
  frontendId: string,
  frontends: AuthorFrontendRegistryLike,
  workspace: WorkspaceSession,
): Promise<readonly DiscoveredUnit[]> {
  const units = new Map<string, DiscoveredUnit>();
  const visiting = new Set<string>();
  const visit = async (source: AuthorSourceUnit, selectedFrontend: string): Promise<void> => {
    const key = `${source.id}\u0000${selectedFrontend}`;
    if (units.has(key)) return;
    if (visiting.has(key)) {
      throw new NodeCompilerError("SOURCE_IMPORT_CYCLE", `Source imports cycle through ${source.name}`, source.id);
    }
    const frontend = frontends.resolve(selectedFrontend);
    if (frontend === undefined) {
      throw new NodeCompilerError("UNKNOWN_FRONTEND", `Frontend ${selectedFrontend} is not registered`, selectedFrontend);
    }
    visiting.add(key);
    const discovery = await frontend.discover(source);
    for (const request of discovery.sources) {
      await visit(await workspace.resolveSource(source, request), request.frontend);
    }
    visiting.delete(key);
    units.set(key, { source, frontend: selectedFrontend, discovery });
  };
  await visit(entry, frontendId);
  return [...units.values()];
}

export type NodeCompilerOptions = {
  readonly modules: ModulePackageRegistryLike;
  readonly frontends: AuthorFrontendRegistryLike;
  readonly entryFrontend: string;
  /** Files reachable through source imports must resolve inside this root. Defaults to entry dirname. */
  readonly root?: string;
  /** Replaces the default Node filesystem definition environment. */
  readonly workspace?: Workspace;
  /** Trusted Type-owner validators used to admit authored Records before linking. */
  readonly validators?: TypeValidatorRegistryLike;
  /** Low-level Host hook for a sandboxed or remote admission implementation. */
  readonly admitRecord?: AuthorRecordAdmitter;
};

export type PlanFileOptions = {
  readonly targets: readonly string[];
  readonly accepts?: NeedAcceptance;
  readonly satisfactions?: readonly Satisfaction[];
  readonly implementationClosure?: import("@svml/protocol").Digest;
  /** External Candidate attachments; never discovered from the author source. */
  readonly realizations?: readonly RealizationOverlay[];
};

export type PlannedSource = {
  readonly compilation: NodeCompiledSourceClosure;
  readonly request: BuildRequest;
  readonly plan: BuildPlan;
  readonly state: BuildState;
};

export type NodeCompiledSourceClosure = CompiledSourceClosure & {
  /** Host-side transfer bundle; bytes are not serialized into Core BuildState. */
  readonly attachments: readonly ArtifactAttachment[];
};

/** Domain-neutral Node facade from a real source file to a verified Source Closure or BuildPlan. */
export class NodeCompiler {
  readonly #options: NodeCompilerOptions;
  readonly #admitRecord: AuthorRecordAdmitter;

  constructor(options: NodeCompilerOptions) {
    if (options.validators !== undefined && options.admitRecord !== undefined) {
      throw new NodeCompilerError(
        "AMBIGUOUS_RECORD_ADMISSION",
        "NodeCompiler accepts validators or a custom Record admitter, not both",
      );
    }
    if (options.workspace !== undefined && options.root !== undefined) {
      throw new NodeCompilerError(
        "AMBIGUOUS_WORKSPACE",
        "NodeCompiler accepts a Workspace or the root option for its default filesystem Workspace, not both",
      );
    }
    this.#options = options;
    this.#admitRecord = options.admitRecord
      ?? createRecordAdmitter(options.validators ?? new TypeValidatorRegistry());
  }

  async compileFile(file: string): Promise<NodeCompiledSourceClosure> {
    const workspace = this.#options.workspace === undefined
      ? await new NodeFilesystemWorkspace({
          ...(this.#options.root === undefined ? {} : { root: this.#options.root }),
        }).open(resolve(file))
      : await this.#options.workspace.open(file);
    const entry = workspace.entry;
    const discovered = await discoverClosure(
      entry,
      this.#options.entryFrontend,
      this.#options.frontends,
      workspace,
    );
    const closure = this.#options.modules.createClosure(
      discovered.flatMap((unit) => unit.discovery.modules),
    );
    const compilation = await compileSourceClosure({
      entry,
      frontend: this.#options.entryFrontend,
      closure,
      frontends: this.#options.frontends,
      resolveSource: workspace.resolveSource,
      resolveAsset: workspace.resolveAsset,
      admitRecord: this.#admitRecord,
    });
    return { ...compilation, attachments: await workspace.attachments() };
  }

  async planFile(file: string, options: PlanFileOptions): Promise<PlannedSource> {
    if (options.targets.length === 0) {
      throw new NodeCompilerError("EMPTY_BUILD_TARGETS", "plan requires at least one public source export");
    }
    const compilation = await this.compileFile(file);
    return this.planCompilation(compilation, options);
  }

  planCompilation(compilation: NodeCompiledSourceClosure, options: PlanFileOptions): PlannedSource {
    if (options.targets.length === 0) {
      throw new NodeCompilerError("EMPTY_BUILD_TARGETS", "plan requires at least one public source export");
    }
    const graph = options.realizations === undefined || options.realizations.length === 0
      ? compilation.elaboration.graph
      : resolveRealization(
          compilation.program,
          compilation.elaboration.graph,
          options.realizations,
        ).graph;
    const targets = options.targets.map((name) => {
      const exported = resolveCompiledSourceExport(compilation, name);
      if (exported.ref.kind !== "logical-output") {
        throw new NodeCompilerError(
          "TARGET_IS_AUTHORED_RECORD",
          `${name} is an authored Record, not a realizable component output`,
          name,
        );
      }
      return { output: exported.ref.id, accepts: options.accepts ?? "exact" } as const;
    });
    const request = sealBuildRequest({
      graph: graph.id,
      ...(options.implementationClosure === undefined
        ? {}
        : { implementationClosure: options.implementationClosure }),
      targets,
      satisfactions: options.satisfactions ?? [],
    });
    const state = start(
      compilation.program,
      graph,
      request,
    );
    return { compilation, request, plan: state.plan, state };
  }
}
