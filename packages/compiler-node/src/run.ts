import type { Workspace, WorkspaceSession } from "@narratage/host";
import {
  compileBuild,
  createResolvedClosure,
  EMPTY_REALIZATION_DIGEST,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealTypedModule,
  start,
} from "@narratage/core";
import type {
  ArtifactAttachment,
} from "@narratage/host";
import type {
  BuildPlan,
  BuildRequest,
  BuildState,
  BuildState as ArchivedBuildState,
  Digest,
  ModuleRef,
  StoredValue,
} from "@narratage/protocol";
import { resolveRealization } from "@narratage/run";
import {
  collectRunModuleRequests,
  compileRunSource,
  resolveRunDocument,
} from "@narratage/run";
import type {
  RunCompilation,
  RunFragmentRegistryLike,
  RunFrontendRegistryLike,
  RunSourceUnit,
} from "@narratage/run";
import type { LinkedProgram } from "@narratage/protocol";
import { NodeFilesystemWorkspace } from "@narratage/workspace-fs-node";
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
  readonly resolveBuildOutput?: (
    build: string,
    output: string,
  ) => Promise<string | undefined> | string | undefined;
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

function moduleKey(ref: ModuleRef): string {
  return `${ref.name}\u0000${ref.version}`;
}

/**
 * Materialize the exact execution slice selected by one BuildRequest.
 *
 * Author compilation deliberately keeps the whole document available. A durable
 * Build does not need unrelated Tracks, renderers and their schemas merely
 * because the Author Source imported them. Keeping those bytes in every state
 * revision made a four-node estimate Build carry megabytes of unrelated video
 * declarations. The Build graph below retains the selected Candidates plus the
 * primary Candidates required to verify their Logical Output promises, and no
 * other executable branch.
 */
function executionSlice(
  program: LinkedProgram,
  graph: ReturnType<typeof sealCompiledGraph>,
  request: BuildRequest,
): { readonly program: LinkedProgram; readonly graph: ReturnType<typeof sealCompiledGraph> } {
  const preliminary = compileBuild(program, graph, request);
  const outputById = new Map(graph.outputs.map((item) => [item.id, item]));
  const candidateById = new Map(graph.candidates.map((item) => [item.id, item]));
  const operationById = new Map(graph.operations.map((item) => [item.id, item]));
  const satisfactionByOutput = new Map(request.satisfactions.map((item) => [item.output, item]));
  const selectionByOutput = new Map(preliminary.selections.map((item) => [item.output, item]));
  const outputs = new Set<string>();
  const candidates = new Set<string>();
  const operations = new Set<string>();
  const records = new Set<string>();

  const visitRef = (ref: import("@narratage/protocol").GraphValueRef): void => {
    if (ref.kind === "record") {
      records.add(ref.id);
    } else if (ref.kind === "logical-output") {
      visitOutput(ref.id);
    } else {
      visitOperation(ref.operation);
    }
  };
  const visitOperation = (id: string): void => {
    if (operations.has(id)) return;
    const operation = operationById.get(id);
    if (operation === undefined) throw new Error(`execution slice refers to absent Operation ${id}`);
    operations.add(id);
    Object.values(operation.inputs).forEach(visitRef);
  };
  const visitCandidate = (id: string): void => {
    if (candidates.has(id)) return;
    const candidate = candidateById.get(id);
    if (candidate === undefined) throw new Error(`execution slice refers to absent Candidate ${id}`);
    candidates.add(id);
    if (candidate.root.kind === "operation") visitOperation(candidate.root.result.operation);
  };
  const visitOutput = (id: string): void => {
    if (outputs.has(id)) return;
    const output = outputById.get(id);
    if (output === undefined) throw new Error(`execution slice refers to absent Logical Output ${id}`);
    outputs.add(id);
    // The primary remains the exact promise witness even when this Run chooses
    // an explicit substitute Candidate.
    visitCandidate(output.primary);
    visitCandidate(
      selectionByOutput.get(id)?.candidate
        ?? satisfactionByOutput.get(id)?.candidate
        ?? output.primary,
    );
    output.semanticInputs.forEach(visitRef);
  };
  request.targets.forEach((target) => visitOutput(target.output));

  const selectedOutputs = graph.outputs.filter((item) => outputs.has(item.id));
  const selectedCandidates = graph.candidates.filter((item) => candidates.has(item.id));
  const selectedOperations = graph.operations.filter((item) => operations.has(item.id));
  const authoredRecords = program.records.filter((record) => records.has(record.id));

  const requiredModules = new Set<string>();
  const requireModule = (ref: ModuleRef): void => {
    const key = moduleKey(ref);
    if (requiredModules.has(key)) return;
    const resolved = program.closure.modules.find((item) => moduleKey(item.ref) === key);
    if (resolved === undefined) throw new Error(`execution slice refers to absent module ${ref.name}@${ref.version}`);
    requiredModules.add(key);
    resolved.manifest.dependencies.forEach((item) => requireModule(item.module));
  };
  selectedOperations.forEach((item) => requireModule(item.producer.module));
  selectedOutputs.forEach((item) => requireModule(item.type.module));
  selectedCandidates.forEach((item) => requireModule(item.type.module));
  authoredRecords.forEach((item) => requireModule(item.type.module));

  const closure = createResolvedClosure(program.closure.modules
    .filter((item) => requiredModules.has(moduleKey(item.ref)))
    .map((item) => item.manifest));
  const typedModules = program.modules.flatMap((item) => {
    const selected = item.records.filter((record) => records.has(record.id));
    return selected.length === 0
      ? []
      : [sealTypedModule({ id: item.id, closureDigest: closure.digest, records: selected })];
  });
  const slicedProgram = link(closure, typedModules);
  const slicedGraph = sealCompiledGraph({
    program: slicedProgram.semanticDigest,
    outputs: selectedOutputs,
    candidates: selectedCandidates,
    operations: selectedOperations,
    ...(graph.realization === EMPTY_REALIZATION_DIGEST
      ? {}
      : { source: graph.source, realization: graph.realization }),
  });
  return { program: slicedProgram, graph: slicedGraph };
}

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

async function attachmentBytes(attachment: ArtifactAttachment): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of await attachment.open()) {
    chunks.push(Uint8Array.from(chunk));
    size += chunk.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function storedValueFromWorkspace(
  workspace: WorkspaceSession,
  source: RunSourceUnit,
  from: string,
): Promise<StoredValue> {
  const resolved = await workspace.resolveAsset(source, { from, mediaType: "application/json" });
  const attachment = (await workspace.attachments()).find((item) => item.artifact.digest === resolved.artifact.digest);
  if (attachment === undefined) throw new Error(`Workspace did not retain bytes for ${from}`);
  return decodeStoredValue(await attachmentBytes(attachment), from);
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
    const resolveBuildOutput = this.#options.resolveBuildOutput;
    const run = await resolveRunDocument(decoded.document, {
      compilation: executionCompilation,
      sourceClosure: decoded.closure,
      fragments: this.#options.fragments,
      readStoredValue: async (from) => await storedValueFromWorkspace(workspace, source, from),
      async readBuild(id) {
        if (readBuild === undefined) throw new Error(`Run refers to Build ${id}, but the Host has no BuildArchive`);
        return await readBuild(id);
      },
      ...(resolveBuildOutput === undefined ? {} : {
        async resolveBuildOutput(build: string, output: string) {
          return await resolveBuildOutput(build, output);
        },
      }),
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
    const fullGraph = sealCompiledGraph({
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
    const fullRequest = sealBuildRequest({
      graph: fullGraph.id,
      ...(implementationClosure === undefined ? {} : { implementationClosure }),
      targets: selected.targets,
      satisfactions: compilation.run.graph.satisfactions,
    });
    const sliced = executionSlice(compilation.program, fullGraph, fullRequest);
    const slicedOutputs = new Set(sliced.graph.outputs.map((item) => item.id));
    const request = sealBuildRequest({
      graph: sliced.graph.id,
      ...(implementationClosure === undefined ? {} : { implementationClosure }),
      targets: selected.targets,
      satisfactions: compilation.run.graph.satisfactions.filter((item) => slicedOutputs.has(item.output)),
    });
    const state = start(sliced.program, sliced.graph, request);
    return { compilation, request, plan: state.plan, state };
  }

  async planFile(file: string, implementationClosure?: Digest): Promise<PlannedBuild> {
    return this.planCompilation(await this.compileFile(file), implementationClosure);
  }
}
