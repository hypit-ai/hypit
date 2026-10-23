import {
  sliceExecution,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
  verifyRecordStructure,
} from "@hypit/kernel";
import type { BuildCandidateSelection, PlannedExecution } from "@hypit/kernel";
import type {
  BlobAttachment,
  WorkspaceSession,
} from "@hypit/workspace";
import type {
  BuildDefinition,
  BuildState,
  Value,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";
import { compareCodeUnits, normalizeValue, sameType } from "@hypit/protocol";
import {
  collectRunModuleRequests,
  compileRunSource,
  resolveRunDocument,
} from "@hypit/run";
import type {
  RunCompilation,
  RunFragmentRegistryLike,
  RunFrontendRegistryLike,
} from "@hypit/run";
import type { LinkedProgram } from "@hypit/protocol";
import type { ResolvedSource, SourceUnit } from "@hypit/source";
import type { PublicationPlan } from "@hypit/result";

import type { CompiledAuthorSource } from "./compiler.js";
import { mergeAttachments } from "./compiler.js";

/** The exact Author-compilation boundary required by Run compilation. */
export type RunAuthorCompiler = {
  openEntry(locator: string): Promise<WorkspaceSession>;
  compileResolvedSource(entry: ResolvedSource, workspace: WorkspaceSession): Promise<CompiledAuthorSource>;
  extendExecutionProgram(program: LinkedProgram, requests: readonly string[]): LinkedProgram;
  refineRecord(program: LinkedProgram, record: TypedRecord): Promise<void>;
};

export type RunCompilerOptions = {
  readonly authorCompiler: RunAuthorCompiler;
  readonly frontends: RunFrontendRegistryLike;
  readonly fragments: RunFragmentRegistryLike;
  readonly locateHistoricalOutput?: (
    build: string,
    output: string,
  ) => Promise<{
    readonly build: string;
    readonly output: string;
    readonly type: TypeRef;
  } | undefined>
    | {
      readonly build: string;
      readonly output: string;
      readonly type: TypeRef;
    }
    | undefined;
  readonly resolveHistoricalOutput?: (
    build: string,
    output: string,
  ) => Promise<{
    readonly type: TypeRef;
    readonly value: Value;
    readonly attachments?: readonly BlobAttachment[];
  } | undefined>
    | {
      readonly type: TypeRef;
      readonly value: Value;
      readonly attachments?: readonly BlobAttachment[];
    }
    | undefined;
};

export type CompiledRun = {
  readonly source: string;
  readonly authorSource: string;
  readonly author: CompiledAuthorSource;
  /** Author program rebound to the union closure required by Author and selected Run code. */
  readonly program: LinkedProgram;
  readonly run: RunCompilation;
  /** The one structural selection shared by supply materialization, execution slicing and publication. */
  readonly selection: PlannedExecution;
  /** Terminal historical addresses selected during structural planning, keyed by Candidate id. */
  readonly historicalOutputs: Readonly<Record<string, {
    readonly build: string;
    readonly output: string;
    readonly type: TypeRef;
  }>>;
  /** Selected zero-input sources that have been materialized and validated for this compilation. */
  readonly materializedSupplies: readonly TypedRecord[];
  readonly attachments: readonly BlobAttachment[];
};

export type CheckedRun = {
  readonly source: string;
  readonly authorSource: string;
  readonly author: CompiledAuthorSource;
  readonly program: LinkedProgram;
  readonly document: RunCompilation["document"];
  readonly unresolvedHistoricalOutputs: readonly {
    readonly id: string;
    readonly build: string;
    readonly output: string;
  }[];
  readonly attachments: readonly BlobAttachment[];
};

export type PreparedBuild = {
  readonly compilation: CompiledRun;
  /** Compiler-only explanation of how the two graphs became the execution plan. */
  readonly selections: readonly BuildCandidateSelection[];
  /** Public Result surface and source ownership derived from the same structural selection. */
  readonly publication: PublicationPlan;
  /** Immutable authority persisted once for every fresh Runtime Build. */
  readonly definition: BuildDefinition;
  /** Materialized plan/read view; durable Stores persist Definition + Facts instead. */
  readonly state: BuildState;
};

type StructuralRunResolution = {
  readonly document: Awaited<ReturnType<typeof compileRunSource>>;
  readonly authorSource: ResolvedSource;
  readonly author: CompiledAuthorSource;
  readonly program: LinkedProgram;
  readonly run: RunCompilation;
  readonly plan: PlannedExecution;
  readonly selectedCandidates: ReadonlySet<string>;
};

function decodeValue(bytes: Uint8Array, from: string): Value {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`${from} is not valid UTF-8 Value JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return normalizeValue(parsed, from);
}

async function attachmentBytes(attachment: BlobAttachment): Promise<Uint8Array> {
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

async function valueFromWorkspace(
  workspace: WorkspaceSession,
  source: SourceUnit,
  from: string,
): Promise<Value> {
  const resolved = await workspace.resolveAsset(source, { from, mediaType: "application/json" });
  const attachment = (await workspace.attachments()).find((item) => item.blob.resource === resolved.resource);
  if (attachment === undefined) throw new Error(`Workspace did not retain bytes for ${from}`);
  return decodeValue(await attachmentBytes(attachment), from);
}

async function fileValueFromWorkspace(
  workspace: WorkspaceSession,
  source: SourceUnit,
  from: string,
  mediaType: string,
): Promise<Value> {
  return await workspace.resolveAsset(source, { from, mediaType });
}

function materializedSupply(
  program: LinkedProgram,
  planned: PlannedExecution,
  candidate: string,
  value: Value,
): TypedRecord {
  const supply = planned.selectedSupplies.find((item) => item.candidate === candidate);
  if (supply === undefined) throw new Error(`Candidate ${candidate} does not declare a selected supply`);
  const record: TypedRecord = { id: supply.record, type: supply.type, value };
  verifyRecordStructure(program.closure, record);
  return record;
}

/** Compiler for the second, mandatory source graph. It never guesses a Frontend from a suffix. */
export class RunCompiler {
  readonly #options: RunCompilerOptions;

  constructor(options: RunCompilerOptions) {
    this.#options = options;
  }

  supportsFrontend(id: string): boolean {
    return this.#options.frontends.resolve(id) !== undefined;
  }

  async compileEntry(locator: string): Promise<CompiledRun> {
    const workspace = await this.#options.authorCompiler.openEntry(locator);
    return await this.compileResolvedSource(workspace.entry, workspace);
  }

  async #resolveStructure(source: ResolvedSource, workspace: WorkspaceSession): Promise<StructuralRunResolution> {
    const document = await compileRunSource(source, this.#options.frontends);
    const authorSource = await workspace.resolveSource(source.unit, {
      from: document.author.source,
      alias: "author",
    });
    const author = await this.#options.authorCompiler.compileResolvedSource(authorSource, workspace);
    const program = this.#options.authorCompiler.extendExecutionProgram(
      author.program,
      collectRunModuleRequests(document, this.#options.fragments),
    );
    const executionCompilation = program === author.program ? author : { ...author, program };
    const run = await resolveRunDocument(document, {
      compilation: executionCompilation,
      fragments: this.#options.fragments,
    });
    const plan = planBuild(program, author.graph, run.graph);
    return {
      document,
      authorSource,
      author,
      program,
      run,
      plan,
      selectedCandidates: new Set(plan.selections.map((selection) => selection.candidate)),
    };
  }

  async #materializeLocalSupplies(
    source: ResolvedSource,
    workspace: WorkspaceSession,
    resolved: StructuralRunResolution,
  ): Promise<Map<string, TypedRecord>> {
    const records = new Map<string, TypedRecord>();
    for (const candidate of resolved.selectedCandidates) {
      const candidateSource = resolved.run.candidateSources[candidate];
      if (candidateSource?.kind === "value") {
        const value = await valueFromWorkspace(workspace, source.unit, candidateSource.from);
        records.set(candidate, materializedSupply(resolved.program, resolved.plan, candidate, value));
      } else if (candidateSource?.kind === "file") {
        const value = await fileValueFromWorkspace(workspace, source.unit, candidateSource.from, candidateSource.mediaType);
        records.set(candidate, materializedSupply(resolved.program, resolved.plan, candidate, value));
      }
    }
    return records;
  }

  async #validateMaterialized(resolved: StructuralRunResolution, records: Iterable<TypedRecord>): Promise<void> {
    for (const record of resolved.plan.initialRecords) {
      await this.#options.authorCompiler.refineRecord(resolved.program, record);
    }
    for (const record of records) {
      await this.#options.authorCompiler.refineRecord(resolved.program, record);
    }
  }

  /**
   * Validate both source documents without materializing historical Build values.
   *
   * A future Build Output source is valid Run intent even before that Build exists. It
   * becomes executable only when plan/build resolves its exact historical Result value.
   */
  async checkResolvedSource(source: ResolvedSource, workspace: WorkspaceSession): Promise<CheckedRun> {
    const resolved = await this.#resolveStructure(source, workspace);
    const materializedRecords = await this.#materializeLocalSupplies(source, workspace, resolved);
    await this.#validateMaterialized(resolved, materializedRecords.values());
    return {
      source: source.unit.id,
      authorSource: resolved.authorSource.unit.id,
      author: resolved.author,
      program: resolved.program,
      document: resolved.document,
      unresolvedHistoricalOutputs: resolved.document.candidates.flatMap((item) => {
        const candidate = resolved.run.candidates[item.id];
        return item.kind === "build-output" && candidate !== undefined && resolved.selectedCandidates.has(candidate)
          ? [{ id: item.id, build: item.build, output: item.output }]
          : [];
      }),
      attachments: mergeAttachments([resolved.author.attachments, await workspace.attachments()]),
    };
  }

  /** Compile both source graphs in one read-once Workspace session selected by the Host. */
  async compileResolvedSource(source: ResolvedSource, workspace: WorkspaceSession): Promise<CompiledRun> {
    const resolved = await this.#resolveStructure(source, workspace);
    const { author, program, run: structuralRun, plan: structuralPlan } = resolved;
    const locateHistoricalOutput = this.#options.locateHistoricalOutput;
    const resolveHistoricalOutput = this.#options.resolveHistoricalOutput;
    const buildAttachments: BlobAttachment[] = [];
    const consumedRecords = new Set(structuralPlan.plan.steps.flatMap((step) => Object.values(step.inputs)));
    const historicalOutputs = new Map<string, {
      readonly build: string;
      readonly output: string;
      readonly type: TypeRef;
    }>();
    const materializedRecords = await this.#materializeLocalSupplies(source, workspace, resolved);
    for (const candidate of resolved.selectedCandidates) {
      const candidateSource = structuralRun.candidateSources[candidate];
      if (candidateSource?.kind !== "build-output") continue;
      if (locateHistoricalOutput === undefined) {
        throw new Error(`Historical Build Candidate ${candidateSource.build}/${candidateSource.output} requires a project Result Store`);
      }
      const located = await locateHistoricalOutput(candidateSource.build, candidateSource.output);
      if (located === undefined) {
        throw new Error(`Build ${candidateSource.build} has no Output ${candidateSource.output}`);
      }
      const declaration = structuralRun.graph.candidates.find((item) => item.id === candidate)!;
      if (!sameType(located.type, declaration.type)) {
        throw new Error(`Build ${candidateSource.build} Output ${candidateSource.output} has the wrong type for its satisfied Logical Output`);
      }
      historicalOutputs.set(candidate, located);
      const consumed = structuralPlan.selections.some((selection) =>
        selection.candidate === candidate && consumedRecords.has(selection.record));
      if (!consumed) continue;
      if (resolveHistoricalOutput === undefined) {
        throw new Error(`Historical Build Candidate ${candidateSource.build}/${candidateSource.output} requires a project Result Store`);
      }
      const resolved = await resolveHistoricalOutput(candidateSource.build, candidateSource.output);
      if (resolved === undefined) {
        throw new Error(`Build ${candidateSource.build} has no Output ${candidateSource.output}`);
      }
      if (!sameType(resolved.type, declaration.type)) {
        throw new Error(`Build ${candidateSource.build} Output ${candidateSource.output} has the wrong type for its satisfied Logical Output`);
      }
      materializedRecords.set(candidate, materializedSupply(program, structuralPlan, candidate, resolved.value));
      buildAttachments.push(...(resolved.attachments ?? []));
    }
    await this.#validateMaterialized(resolved, materializedRecords.values());
    return {
      source: source.unit.id,
      authorSource: resolved.authorSource.unit.id,
      author,
      program,
      run: structuralRun,
      selection: structuralPlan,
      historicalOutputs: Object.fromEntries(historicalOutputs),
      materializedSupplies: [...materializedRecords.values()].sort((left, right) => compareCodeUnits(left.id, right.id)),
      attachments: mergeAttachments([author.attachments, await workspace.attachments(), buildAttachments]),
    };
  }

  prepareCompilation(compilation: CompiledRun): PreparedBuild {
    const preliminary = compilation.selection;
    const consumedRecords = new Set(preliminary.plan.steps.flatMap((step) => Object.values(step.inputs)));
    const forwardOnlyOutputs = new Set(preliminary.selections.flatMap((selection) => {
      const source = compilation.run.candidateSources[selection.candidate];
      return source?.kind === "build-output" && !consumedRecords.has(selection.record) ? [selection.output] : [];
    }));
    const executionRun = {
      ...compilation.run.graph,
      targets: compilation.run.graph.targets.filter((target) => !forwardOnlyOutputs.has(target)),
    };
    const sliced = sliceExecution(compilation.program, compilation.author.graph, executionRun, preliminary);
    const materializedById = new Map(compilation.materializedSupplies.map((record) => [record.id, record]));
    const suppliedRecords = sliced.selectedSupplies.map((supply) => {
      const record = materializedById.get(supply.record);
      if (record === undefined) throw new Error(`Selected supply ${supply.candidate} was not materialized during Run compilation`);
      if (!sameType(record.type, supply.type)) {
        throw new Error(`Selected supply ${supply.candidate} materialized with the wrong type`);
      }
      return record;
    });
    const initialRecords = [...sliced.initialRecords, ...suppliedRecords]
      .sort((left, right) => compareCodeUnits(left.id, right.id));
    const sealedProgram = link(sliced.program.closure, [...sliced.program.records, ...initialRecords]);
    const definition = defineBuild({
      program: sealedProgram,
      plan: sliced.plan,
    });
    const state = materializeBuild(definition, []);
    const selections = new Map(preliminary.selections.map((selection) => [selection.output, selection]));
    const targets = new Set(compilation.run.graph.targets);
    const names = new Set<string>();
    const outputs = new Set<string>();
    const publication: PublicationPlan = {
      outputs: compilation.author.exports.flatMap((item) => {
        if (item.ref.kind === "operation-result") {
          throw new Error(`public output ${item.name} was not lowered to a stable Record or Logical Output`);
        }
        if (item.ref.kind !== "logical-output") return [];
        const outputId = item.ref.id;
        if (names.has(item.name)) throw new Error(`public Output name ${item.name} is repeated`);
        if (outputs.has(outputId)) {
          throw new Error(`Logical Output ${outputId} has more than one public name`);
        }
        names.add(item.name);
        outputs.add(outputId);
        const element = compilation.author.provenance.elements.find((element) =>
          element.outputs.some((output) => output.id === outputId));
        const authored = element?.outputs.find((output) => output.id === outputId);
        const displayName = element?.components.find((component) => component.id === authored?.component)?.local;
        const selection = selections.get(outputId);
        const candidateSource = selection === undefined
          ? undefined
          : compilation.run.candidateSources[selection.candidate];
        let source: PublicationPlan["outputs"][number]["source"] = selection === undefined
          ? { kind: "current-record", record: outputId }
          : { kind: "current-record", record: selection.record };
        if (selection !== undefined && candidateSource?.kind === "build-output") {
          const located = compilation.historicalOutputs[selection.candidate];
          if (located === undefined) {
            throw new Error(`Historical Candidate ${selection.candidate} was not located during Run compilation`);
          }
          source = {
            kind: "historical-output" as const,
            build: located.build,
            output: located.output,
          };
        }
        return [{
          name: item.name,
          output: outputId,
          type: item.type,
          ...(displayName === undefined ? {} : { displayName }),
          target: targets.has(outputId),
          source,
        }];
      }),
    };
    for (const target of targets) {
      if (!publication.outputs.some((output) => output.output === target)) {
        throw new Error(`Target ${target} is not a published Author Output`);
      }
    }
    return { compilation, selections: sliced.selections, publication, definition, state };
  }

  /** Plan a distinct in-memory Run graph as a distinct compilation selection. */
  prepareVariant(compilation: CompiledRun, graph: RunCompilation["graph"]): PreparedBuild {
    const run = { ...compilation.run, graph };
    return this.prepareCompilation({
      ...compilation,
      run,
      selection: planBuild(compilation.program, compilation.author.graph, graph),
    });
  }

  async prepareEntry(locator: string): Promise<PreparedBuild> {
    return this.prepareCompilation(await this.compileEntry(locator));
  }
}
