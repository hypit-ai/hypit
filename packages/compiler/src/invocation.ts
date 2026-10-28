import {
  sliceExecution,
  defineBuild,
  materializeBuild,
  planBuild,
} from "@hypit/kernel";
import type { PlannedExecution, SelectedOutputRecord } from "@hypit/kernel";
import type { BuildView } from "@hypit/kernel";
import type {
  AuthorDocument,
} from "@hypit/author";
import type {
  BlobAttachment,
  WorkspaceSession,
} from "@hypit/workspace";
import type {
  AuthorGraph,
  BuildDefinition,
  Candidate,
  Invocation,
  PublicationIntent,
  Satisfaction,
} from "@hypit/protocol";
import { compareCodeUnits, sameType } from "@hypit/protocol";
import {
  compileInvocationSource,
  resolveInvocationRequest,
  resolveInvocationSourceDocument,
} from "@hypit/invocation";
import type {
  InvocationRequest,
  ResolvedInvocationPreset,
  InvocationFrontendRegistryLike,
  InvocationSourceDocument,
} from "@hypit/invocation";
import type { LinkedProgram } from "@hypit/protocol";
import type { ResolvedSource } from "@hypit/source";

import type { CompiledAuthorSource } from "./compiler.js";
import { mergeAttachments } from "./compiler.js";

type EffectiveSelection = {
  readonly graph: AuthorGraph;
  readonly targets: readonly string[];
  readonly satisfactions: readonly Satisfaction[];
};

/**
 * Resolve durable author choices and transient Invocation overrides before Kernel planning.
 * Invocation satisfaction wins for this execution; absent overrides retain authored realization,
 * and Kernel uses each output primary when neither exists.
 */
function effectiveSelection(
  author: CompiledAuthorSource,
  invocation: Invocation,
): EffectiveSelection {
  const outputs = new Map(author.graph.outputs.map((output) => [output.id, output]));
  const records = new Map(author.program.records.map((record) => [record.id, record]));
  const usedCandidates = new Set([
    ...author.graph.candidates.map((candidate) => candidate.id),
  ]);
  const recordCandidates: Candidate[] = [];
  const effective = new Map<string, string>();

  for (const realization of author.realizations) {
    const output = outputs.get(realization.output);
    if (output === undefined) {
      throw new Error("Authored realization references unknown Logical Output " + realization.output);
    }
    const record = records.get(realization.record);
    if (record === undefined) {
      throw new Error("Authored realization references unknown Record " + realization.record);
    }
    if (!sameType(output.type, record.type)) {
      throw new Error("Authored realization Record has the wrong Type for " + output.id);
    }
    const id = "candidate:realization:" + JSON.stringify([output.id, record.id]);
    if (usedCandidates.has(id)) {
      throw new Error("Authored realization Candidate conflicts with " + id);
    }
    usedCandidates.add(id);
    recordCandidates.push({
      id,
      type: output.type,
      root: { kind: "record", id: record.id },
    });
    effective.set(output.id, id);
  }

  for (const override of invocation.overrides) {
    const output = outputs.get(override.output);
    if (output === undefined) {
      throw new Error("Invocation override references unknown Logical Output " + override.output);
    }
    if (override.choice.kind === "primary") {
      effective.set(output.id, output.primary);
      continue;
    }
    const record = records.get(override.choice.record);
    if (record === undefined) {
      throw new Error("Invocation override references unknown Record " + override.choice.record);
    }
    if (!sameType(output.type, record.type)) {
      throw new Error("Invocation override Record has the wrong Type for " + output.id);
    }
    const id = "candidate:invocation-record:" + JSON.stringify([output.id, record.id]);
    if (usedCandidates.has(id)) {
      throw new Error("Invocation override Candidate conflicts with " + id);
    }
    usedCandidates.add(id);
    recordCandidates.push({
      id,
      type: output.type,
      root: { kind: "record", id: record.id },
    });
    effective.set(output.id, id);
  }

  return {
    graph: {
      ...author.graph,
      candidates: [...author.graph.candidates, ...recordCandidates],
    },
    targets: invocation.targets,
    satisfactions: [...effective.entries()]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([output, candidate]) => ({ output, candidate })),
  };
}

/** The exact Author-compilation boundary required by Invocation compilation. */
export type InvocationAuthorCompiler = {
  openEntry(locator: string): Promise<WorkspaceSession>;
  compileResolvedSource(entry: ResolvedSource, workspace: WorkspaceSession): Promise<CompiledAuthorSource>;
  openAuthorDocument(source: ResolvedSource): Promise<AuthorDocument>;
};

export type InvocationCompilerOptions = {
  readonly authorCompiler: InvocationAuthorCompiler;
  readonly frontends: InvocationFrontendRegistryLike;
};

export type CompiledInvocation = {
  readonly authorSource: string;
  readonly author: CompiledAuthorSource;
  readonly authorDocument: AuthorDocument;
  /** Linked Author program evaluated by this Invocation. */
  readonly program: LinkedProgram;
  readonly invocation: Invocation;
  /** Present only when this Invocation was loaded from a saved .svrun preset. */
  readonly preset?: {
    readonly source: string;
    readonly document: InvocationSourceDocument;
  };
  /** The one structural selection shared by execution slicing and publication. */
  readonly selection: PlannedExecution;
  readonly attachments: readonly BlobAttachment[];
};

export type CheckedInvocationPreset = {
  readonly source: string;
  readonly authorSource: string;
  readonly author: CompiledAuthorSource;
  readonly program: LinkedProgram;
  readonly document: ResolvedInvocationPreset["document"];
  readonly attachments: readonly BlobAttachment[];
};

export type PreparedBuild = {
  readonly compilation: CompiledInvocation;
  /** Compiler-only explanation of how authored choices became the execution plan. */
  readonly selections: readonly SelectedOutputRecord[];
  /** Public Result surface and source ownership derived from the same structural selection. */
  readonly publication: PublicationIntent;
  /** Immutable authority persisted once for every fresh Runtime Build. */
  readonly definition: BuildDefinition;
  /** Materialized plan/read view; durable Stores persist Definition + Facts instead. */
  readonly state: BuildView;
};

type StructuralPresetResolution = {
  readonly document: Awaited<ReturnType<typeof compileInvocationSource>>;
  readonly authorSource: ResolvedSource;
  readonly author: CompiledAuthorSource;
  readonly authorDocument: AuthorDocument;
  readonly program: LinkedProgram;
  readonly preset: ResolvedInvocationPreset;
  readonly plan: PlannedExecution;
};

/** Compile Author declarations and an explicit Invocation into one finite execution. */
export class InvocationCompiler {
  readonly #options: InvocationCompilerOptions;

  constructor(options: InvocationCompilerOptions) {
    this.#options = options;
  }

  supportsPresetFrontend(id: string): boolean {
    return this.#options.frontends.resolve(id) !== undefined;
  }

  async compilePresetEntry(locator: string): Promise<CompiledInvocation> {
    const workspace = await this.#options.authorCompiler.openEntry(locator);
    return await this.compilePresetResolvedSource(workspace.entry, workspace);
  }

  async #resolvePresetStructure(source: ResolvedSource, workspace: WorkspaceSession): Promise<StructuralPresetResolution> {
    const document = await compileInvocationSource(source, this.#options.frontends);
    const authorSource = await workspace.resolveSource(source.unit, {
      from: document.author.source,
      alias: "author",
    });
    const authorDocument = await this.#options.authorCompiler.openAuthorDocument(authorSource);
    const author = await this.#options.authorCompiler.compileResolvedSource(authorSource, workspace);
    const program = author.program;
    const preset = await resolveInvocationSourceDocument(document, { compilation: author });
    const effective = effectiveSelection(author, preset.invocation);
    const plan = planBuild(program, effective.graph, effective.targets, effective.satisfactions);
    return {
      document,
      authorSource,
      author,
      authorDocument,
      program,
      preset,
      plan,
    };
  }

  /** Validate the Author Source and the finite Invocation without executing either. */
  async checkPresetResolvedSource(source: ResolvedSource, workspace: WorkspaceSession): Promise<CheckedInvocationPreset> {
    const resolved = await this.#resolvePresetStructure(source, workspace);
    return {
      source: source.unit.id,
      authorSource: resolved.authorSource.unit.id,
      author: resolved.author,
      program: resolved.program,
      document: resolved.document,
      attachments: mergeAttachments([resolved.author.attachments, await workspace.attachments()]),
    };
  }

  /** Compile one saved Invocation preset and its explicitly named Author Source. */
  async compilePresetResolvedSource(source: ResolvedSource, workspace: WorkspaceSession): Promise<CompiledInvocation> {
    const resolved = await this.#resolvePresetStructure(source, workspace);
    const { author, authorDocument, program, preset, plan: structuralPlan } = resolved;
    return {
      authorSource: resolved.authorSource.unit.id,
      author,
      authorDocument,
      program,
      invocation: preset.invocation,
      preset: { source: source.unit.id, document: resolved.document },
      selection: structuralPlan,
      attachments: mergeAttachments([author.attachments, await workspace.attachments()]),
    };
  }

  /** Compile one Author Source with an explicit source-level Invocation request. */
  async compileAuthorResolvedSource(
    source: ResolvedSource,
    workspace: WorkspaceSession,
    request: InvocationRequest,
  ): Promise<CompiledInvocation> {
    const authorDocument = await this.#options.authorCompiler.openAuthorDocument(source);
    const author = await this.#options.authorCompiler.compileResolvedSource(source, workspace);
    const invocation = resolveInvocationRequest(request, { compilation: author });
    const effective = effectiveSelection(author, invocation);
    return {
      authorSource: source.unit.id,
      author,
      authorDocument,
      program: author.program,
      invocation,
      selection: planBuild(author.program, effective.graph, effective.targets, effective.satisfactions),
      attachments: mergeAttachments([author.attachments, await workspace.attachments()]),
    };
  }

  async compileAuthorEntry(locator: string, request: InvocationRequest): Promise<CompiledInvocation> {
    const workspace = await this.#options.authorCompiler.openEntry(locator);
    return await this.compileAuthorResolvedSource(workspace.entry, workspace, request);
  }

  prepareCompilation(compilation: CompiledInvocation): PreparedBuild {
    const preliminary = compilation.selection;
    const effective = effectiveSelection(compilation.author, compilation.invocation);
    const sliced = sliceExecution(
      compilation.program,
      effective.graph,
      effective.targets,
      preliminary,
    );
    const definition = defineBuild({
      program: sliced.program,
      plan: sliced.plan,
    });
    const state = materializeBuild(definition, []);
    const selections = new Map(preliminary.selections.map((selection) => [selection.output, selection]));
    const targets = new Set(compilation.invocation.targets);
    const names = new Set<string>();
    const outputs = new Set<string>();
    const publication: PublicationIntent = {
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
        if (selection === undefined) return [];
        return [{
          name: item.name,
          output: outputId,
          type: item.type,
          ...(displayName === undefined ? {} : { displayName }),
          target: targets.has(outputId),
          record: selection.record,
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

  /** Plan a distinct in-memory Invocation without changing the Author Source. */
  prepareVariant(compilation: CompiledInvocation, invocation: Invocation): PreparedBuild {
    const effective = effectiveSelection(compilation.author, invocation);
    return this.prepareCompilation({
      ...compilation,
      invocation,
      selection: planBuild(compilation.program, effective.graph, effective.targets, effective.satisfactions),
    });
  }

  async preparePresetEntry(locator: string): Promise<PreparedBuild> {
    return this.prepareCompilation(await this.compilePresetEntry(locator));
  }
}
