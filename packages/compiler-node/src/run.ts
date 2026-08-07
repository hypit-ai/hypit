import type { Workspace, WorkspaceSession } from "@svml/host";
import {
  sealBuildRequest,
  sealCompiledGraph,
  start,
} from "@svml/core";
import type {
  ArtifactAttachment,
} from "@svml/host";
import type {
  BuildPlan,
  BuildRequest,
  BuildState,
  BuildState as ArchivedBuildState,
  Digest,
  StoredValue,
} from "@svml/protocol";
import { resolveRealization } from "@svml/realization";
import {
  collectRunModuleRequests,
  compileRunSource,
  resolveRunDocument,
} from "@svml/run";
import type {
  RunCompilation,
  RunFragmentRegistryLike,
  RunFrontendRegistryLike,
  RunSourceUnit,
} from "@svml/run";
import type { LinkedProgram } from "@svml/protocol";
import { NodeFilesystemWorkspace } from "@svml/workspace-fs-node";
import { resolve } from "node:path";

import type { NodeCompiledSourceClosure } from "./compiler.js";
import { NodeCompiler } from "./compiler.js";

export type NodeRunCompilerOptions = {
  readonly authorCompiler: NodeCompiler;
  readonly frontends: RunFrontendRegistryLike;
  readonly fragments: RunFragmentRegistryLike;
  readonly root?: string;
  readonly workspace?: Workspace;
  readonly readBuild?: (id: string) => Promise<ArchivedBuildState | undefined> | ArchivedBuildState | undefined;
};

export type NodeCompiledRun = {
  readonly source: string;
  readonly authorSource: string;
  readonly author: NodeCompiledSourceClosure;
  /** Author program rebound to the union closure required by Author and selected Run code. */
  readonly program: LinkedProgram;
  readonly run: RunCompilation;
  readonly attachments: readonly ArtifactAttachment[];
};

export type PlannedBuild = {
  readonly compilation: NodeCompiledRun;
  readonly request: BuildRequest;
  readonly plan: BuildPlan;
  readonly state: BuildState;
};

function decodeStoredValue(bytes: Uint8Array, from: string): StoredValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`${from} is not valid UTF-8 StoredValue JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${from} must contain one StoredValue object`);
  }
  return parsed as StoredValue;
}

async function storedValueFromWorkspace(
  workspace: WorkspaceSession,
  source: RunSourceUnit,
  from: string,
): Promise<StoredValue> {
  const resolved = await workspace.resolveAsset(source, { from, mediaType: "application/json" });
  const attachment = (await workspace.attachments()).find((item) => item.artifact.digest === resolved.artifact.digest);
  if (attachment === undefined) throw new Error(`Workspace did not retain bytes for ${from}`);
  return decodeStoredValue(attachment.bytes, from);
}

/** Node Host for the second, mandatory source graph. It never guesses a Frontend from a suffix. */
export class NodeRunCompiler {
  readonly #options: NodeRunCompilerOptions;

  constructor(options: NodeRunCompilerOptions) {
    if (options.workspace !== undefined && options.root !== undefined) {
      throw new Error("NodeRunCompiler accepts a Workspace or root, not both");
    }
    this.#options = options;
  }

  supportsFrontend(id: string): boolean {
    return this.#options.frontends.resolve(id) !== undefined;
  }

  async compileFile(file: string): Promise<NodeCompiledRun> {
    const workspace = this.#options.workspace === undefined
      ? await new NodeFilesystemWorkspace({
          ...(this.#options.root === undefined ? {} : { root: this.#options.root }),
        }).open(resolve(file))
      : await this.#options.workspace.open(file);
    return await this.compileSource(workspace.entry, workspace);
  }

  /** Compile both source graphs in one read-once Workspace session selected by the Host. */
  async compileSource(source: RunSourceUnit, workspace: WorkspaceSession): Promise<NodeCompiledRun> {
    const decoded = await compileRunSource(source, this.#options.frontends);
    const authorSource = await workspace.resolveSource(source, {
      from: decoded.document.author.source,
      alias: "author",
    });
    const author = await this.#options.authorCompiler.compileSource(authorSource, workspace);
    const program = this.#options.authorCompiler.extendExecutionProgram(
      author.program,
      collectRunModuleRequests(decoded.document, this.#options.fragments),
    );
    const executionCompilation = program === author.program ? author : { ...author, program };
    const readBuild = this.#options.readBuild;
    const run = await resolveRunDocument(decoded.document, {
      compilation: executionCompilation,
      sourceClosure: decoded.closure,
      fragments: this.#options.fragments,
      readStoredValue: async (from) => await storedValueFromWorkspace(workspace, source, from),
      async readBuild(id) {
        if (readBuild === undefined) throw new Error(`Run refers to Build ${id}, but the Host has no BuildArchive`);
        return await readBuild(id);
      },
    });
    return {
      source: source.id,
      authorSource: authorSource.id,
      author,
      program,
      run,
      attachments: await workspace.attachments(),
    };
  }

  planCompilation(compilation: NodeCompiledRun, implementationClosure?: Digest): PlannedBuild {
    const authorGraph = compilation.author.elaboration.graph;
    const realized = compilation.run.overlay === undefined
      ? authorGraph
      : resolveRealization(
          compilation.program,
          authorGraph,
          [compilation.run.overlay],
        ).graph;
    const graph = sealCompiledGraph({
      program: realized.program,
      source: authorGraph.id,
      realization: compilation.run.graph.id,
      outputs: realized.outputs,
      candidates: realized.candidates,
      operations: realized.operations,
    });
    const selected = compilation.run.graph.targetSets.find(
      (item) => item.id === compilation.run.graph.selectedTargets,
    );
    if (selected === undefined) throw new Error(`Run Graph selects absent Target Set ${compilation.run.graph.selectedTargets}`);
    const request = sealBuildRequest({
      graph: graph.id,
      ...(implementationClosure === undefined ? {} : { implementationClosure }),
      targets: selected.targets,
      satisfactions: compilation.run.graph.satisfactions,
    });
    const state = start(compilation.program, graph, request);
    return { compilation, request, plan: state.plan, state };
  }

  async planFile(file: string, implementationClosure?: Digest): Promise<PlannedBuild> {
    return this.planCompilation(await this.compileFile(file), implementationClosure);
  }
}
