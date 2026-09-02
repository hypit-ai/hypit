import type { WorkspaceSession } from "@hypit/workspace";
import {
  sliceExecution,
  defineBuild,
  materializeBuild,
  planBuild,
} from "@hypit/core";
import type { BuildCandidateSelection } from "@hypit/core";
import type {
  ArtifactAttachment,
} from "@hypit/workspace";
import type {
  BuildDefinition,
  BuildState,
  StoredValue,
  TypeRef,
} from "@hypit/protocol";
import { sameType } from "@hypit/protocol";
import {
  collectRunModuleRequests,
  compileRunSource,
  resolveRunDocument,
  sealRunGraph,
} from "@hypit/run";
import type {
  RunCompilation,
  RunFragmentRegistryLike,
  RunFrontendRegistryLike,
  RunSourceUnit,
} from "@hypit/run";
import type { LinkedProgram } from "@hypit/protocol";
import { estimateSpeechDuration } from "@hypit/estimate";
import type { SpeechEstimatePolicy } from "@hypit/estimate";
import type { Text } from "@hypit/text";

import type { NodeCompiledSourceClosure } from "./compiler.js";
import { mergeAttachments, NodeCompiler } from "./compiler.js";

export type NodeRunCompilerOptions = {
  readonly authorCompiler: NodeCompiler;
  readonly frontends: RunFrontendRegistryLike;
  readonly fragments: RunFragmentRegistryLike;
  readonly resolveHistoricalOutput?: (
    build: string,
    output: string,
  ) => Promise<{
    readonly type: TypeRef;
    readonly value: StoredValue;
    readonly attachments?: readonly ArtifactAttachment[];
  } | undefined>
    | {
      readonly type: TypeRef;
      readonly value: StoredValue;
      readonly attachments?: readonly ArtifactAttachment[];
    }
    | undefined;
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

export type NodeCheckedRun = {
  readonly source: string;
  readonly authorSource: string;
  readonly author: NodeCompiledSourceClosure;
  readonly program: LinkedProgram;
  readonly document: RunCompilation["document"];
  readonly unresolvedHistoricalOutputs: readonly {
    readonly id: string;
    readonly build: string;
    readonly output: string;
  }[];
  readonly attachments: readonly ArtifactAttachment[];
};

export type PlannedBuild = {
  readonly compilation: NodeCompiledRun;
  /** Compiler-only explanation of how the two graphs became the execution plan. */
  readonly selections: readonly BuildCandidateSelection[];
  /** Whole-Output historical sources selected by the plan; Result storage may forward them directly. */
  readonly resultForwards: readonly {
    readonly output: string;
    readonly build: string;
    readonly sourceOutput: string;
  }[];
  /** Immutable authority persisted once for every fresh Runtime Build. */
  readonly definition: BuildDefinition;
  /** Materialized plan/read view; durable Stores persist Definition + Facts instead. */
  readonly state: BuildState;
};

/** Provider-free values produced by estimate:Speech and therefore useful before a paid Build. */
export function deterministicSpeechDurationsFromGraph(
  graph: NodeCompiledRun["author"]["graph"],
  records: NodeCompiledRun["author"]["program"]["records"],
): readonly {
  readonly operation: string;
  readonly speech_record: string;
  readonly policy_record: string;
  readonly seconds: number;
}[] {
  const recordMap = new Map(records.map((record) => [record.id, record]));
  const result: { operation: string; speech_record: string; policy_record: string; seconds: number }[] = [];
  for (const operation of graph.operations) {
    if (operation.producer.module.name !== "@hypit/estimate" || operation.producer.name !== "estimate-speech-duration") continue;
    const speech = operation.inputs.speech;
    const policy = operation.inputs.policy;
    if (speech?.kind !== "record" || policy?.kind !== "record") continue;
    const speechValue = recordMap.get(speech.id)?.value;
    const policyValue = recordMap.get(policy.id)?.value;
    if (speechValue?.kind !== "inline" || policyValue?.kind !== "inline") continue;
    try {
      const duration = estimateSpeechDuration(speechValue.value as unknown as Text, policyValue.value as unknown as SpeechEstimatePolicy);
      result.push({ operation: operation.id, speech_record: speech.id, policy_record: policy.id, seconds: duration });
    } catch {
      // Invalid inputs are reported by the ordinary graph check; this read-only aid must not mask it.
    }
  }
  return result;
}

export function deterministicSpeechDurations(compilation: NodeCompiledRun): ReturnType<typeof deterministicSpeechDurationsFromGraph> {
  return deterministicSpeechDurationsFromGraph(compilation.author.graph, compilation.author.program.records);
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
  const attachment = (await workspace.attachments()).find((item) => item.artifact.resource === resolved.artifact.resource);
  if (attachment === undefined) throw new Error(`Workspace did not retain bytes for ${from}`);
  return decodeStoredValue(await attachmentBytes(attachment), from);
}

async function fileValueFromWorkspace(
  workspace: WorkspaceSession,
  source: RunSourceUnit,
  from: string,
  mediaType: string,
): Promise<StoredValue> {
  return (await workspace.resolveAsset(source, { from, mediaType })).artifact;
}

/** Node Host for the second, mandatory source graph. It never guesses a Frontend from a suffix. */
export class NodeRunCompiler {
  readonly #options: NodeRunCompilerOptions;

  constructor(options: NodeRunCompilerOptions) {
    this.#options = options;
  }

  supportsFrontend(id: string): boolean {
    return this.#options.frontends.resolve(id) !== undefined;
  }

  async compileFile(file: string): Promise<NodeCompiledRun> {
    const workspace = await this.#options.authorCompiler.openFile(file);
    return await this.compileSource(workspace.entry, workspace);
  }

  /**
   * Validate both source documents without materializing historical Build values.
   *
   * A future BuildRecord is valid Run intent even before that Build exists. It
   * becomes executable only when plan/build resolves its exact historical Result value.
   */
  async checkSource(source: RunSourceUnit, workspace: WorkspaceSession): Promise<NodeCheckedRun> {
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
    const structuralRun = await resolveRunDocument(decoded.document, {
      compilation: executionCompilation,
      fragments: this.#options.fragments,
    });
    const structuralPlan = planBuild(program, author.graph, structuralRun.graph);
    const selectedLocalSources = new Set(structuralPlan.selections
      .filter((selection) => {
        const candidateSource = structuralRun.candidateSources[selection.candidate];
        return candidateSource?.kind === "stored-value" || candidateSource?.kind === "file";
      })
      .map((selection) => selection.candidate));
    const resolvedValues = new Map<string, StoredValue>();
    for (const candidate of selectedLocalSources) {
      const candidateSource = structuralRun.candidateSources[candidate]!;
      const value = candidateSource.kind === "stored-value"
        ? await storedValueFromWorkspace(workspace, source, candidateSource.from)
        : candidateSource.kind === "file"
          ? await fileValueFromWorkspace(workspace, source, candidateSource.from, candidateSource.mediaType)
          : undefined;
      if (value !== undefined) resolvedValues.set(candidate, value);
    }
    const checkedRunGraph = sealRunGraph({
      ...structuralRun.graph,
      candidates: structuralRun.graph.candidates.map((candidate) => {
        const value = resolvedValues.get(candidate.id);
        if (value === undefined) return candidate;
        if (candidate.root.kind !== "value") throw new Error(`Run Candidate ${candidate.id} is not a zero-input value`);
        return {
          ...candidate,
          root: {
            kind: "value" as const,
            value: { id: candidate.root.value.id, value },
          },
        };
      }),
    });
    const checkedPlan = planBuild(program, author.graph, checkedRunGraph);
    const admitRecord = (this.#options.authorCompiler as NodeCompiler & {
      readonly admitRecord?: NodeCompiler["admitRecord"];
    }).admitRecord;
    if (typeof admitRecord === "function") {
      const localRecordIds = new Set(checkedPlan.selections
        .filter((selection) => selectedLocalSources.has(selection.candidate))
        .map((selection) => selection.record));
      for (const record of checkedPlan.initialRecords) {
        if (localRecordIds.has(record.id)) await admitRecord.call(this.#options.authorCompiler, program, record);
      }
    }
    return {
      source: source.id,
      authorSource: authorSource.id,
      author,
      program,
      document: decoded.document,
      unresolvedHistoricalOutputs: decoded.document.candidates.flatMap((item) => item.kind === "build-record"
        ? [{ id: item.id, build: item.build, output: item.output }]
        : []),
      attachments: mergeAttachments([author.attachments, await workspace.attachments()]),
    };
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
    const resolveHistoricalOutput = this.#options.resolveHistoricalOutput;
    const buildAttachments: ArtifactAttachment[] = [];
    const structuralRun = await resolveRunDocument(decoded.document, {
      compilation: executionCompilation,
      fragments: this.#options.fragments,
    });
    const structuralPlan = planBuild(program, author.graph, structuralRun.graph);
    const selectedSources = new Set(structuralPlan.selections
      .filter((selection) => structuralRun.candidateSources[selection.candidate] !== undefined)
      .map((selection) => selection.candidate));
    const resolvedValues = new Map<string, StoredValue>();
    for (const candidate of selectedSources) {
      const candidateSource = structuralRun.candidateSources[candidate]!;
      if (candidateSource.kind === "stored-value") {
        resolvedValues.set(candidate, await storedValueFromWorkspace(workspace, source, candidateSource.from));
        continue;
      }
      if (candidateSource.kind === "file") {
        resolvedValues.set(candidate, await fileValueFromWorkspace(
          workspace,
          source,
          candidateSource.from,
          candidateSource.mediaType,
        ));
        continue;
      }
      if (resolveHistoricalOutput === undefined) {
        throw new Error(`Historical Build Candidate ${candidateSource.build}/${candidateSource.output} requires a project Result Store`);
      }
      const resolved = await resolveHistoricalOutput(candidateSource.build, candidateSource.output);
      if (resolved === undefined) {
        throw new Error(`Build ${candidateSource.build} has no Output ${candidateSource.output}`);
      }
      const declaration = structuralRun.graph.candidates.find((item) => item.id === candidate)!;
      if (!sameType(resolved.type, declaration.type)) {
        throw new Error(`Build ${candidateSource.build} Output ${candidateSource.output} has the wrong type for its satisfied Logical Output`);
      }
      resolvedValues.set(candidate, resolved.value);
      buildAttachments.push(...(resolved.attachments ?? []));
    }
    const run = {
      ...structuralRun,
      graph: sealRunGraph({
        ...structuralRun.graph,
        candidates: structuralRun.graph.candidates.map((candidate) => {
          const resolved = resolvedValues.get(candidate.id);
          if (resolved === undefined) return candidate;
          if (candidate.root.kind !== "value") throw new Error(`Historical Candidate ${candidate.id} is not a zero-input value`);
          return {
            ...candidate,
            root: {
              kind: "value" as const,
              value: { id: candidate.root.value.id, value: resolved },
            },
          };
        }),
      }),
    };
    const admitted = planBuild(program, author.graph, run.graph);
    const admitRecord = (this.#options.authorCompiler as NodeCompiler & {
      readonly admitRecord?: NodeCompiler["admitRecord"];
    }).admitRecord;
    if (typeof admitRecord === "function") {
      for (const record of admitted.initialRecords) {
        await admitRecord.call(this.#options.authorCompiler, program, record);
      }
    }
    return {
      source: source.id,
      authorSource: authorSource.id,
      author,
      program,
      run,
      attachments: mergeAttachments([author.attachments, await workspace.attachments(), buildAttachments]),
    };
  }

  planCompilation(compilation: NodeCompiledRun): PlannedBuild {
    const sliced = sliceExecution(compilation.program, compilation.author.graph, compilation.run.graph);
    const definition = defineBuild({
      program: sliced.program,
      initialRecords: sliced.initialRecords,
      plan: sliced.plan,
      targets: sliced.targets,
    });
    const state = materializeBuild(definition, []);
    const resultForwards = sliced.selections.flatMap((selection) => {
      const source = compilation.run.candidateSources[selection.candidate];
      return source?.kind !== "build-output" ? [] : [{
        output: selection.output,
        build: source.build,
        sourceOutput: source.output,
      }];
    });
    return { compilation, selections: sliced.selections, resultForwards, definition, state };
  }

  async planFile(file: string): Promise<PlannedBuild> {
    return this.planCompilation(await this.compileFile(file));
  }
}
