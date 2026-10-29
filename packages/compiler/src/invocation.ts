import {
  sliceExecution,
  defineBuild,
  materializeBuild,
  planBuild,
} from "@hypit/kernel";
import type { PlannedExecution, SelectedOutputRecord } from "@hypit/kernel";
import type { BuildView } from "@hypit/kernel";
import type {
  BlobAttachment,
  WorkspaceSession,
} from "@hypit/workspace";
import type {
  AuthorGraph,
  BuildDefinition,
  OutputRoot,
  Invocation,
  LogicalOutputSelection,
  PublicationIntent,
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
  readonly selections: readonly LogicalOutputSelection[];
  readonly origins: ReadonlyMap<string, EffectiveSelectionOrigin>;
};

export type EffectiveSelectionOrigin = "invocation" | "authored" | "primary";

export type EffectiveOutputSelection = SelectedOutputRecord & {
  readonly origin: EffectiveSelectionOrigin;
};

/**
 * Resolve durable author choices and transient Invocation overrides before Kernel planning.
 * Invocation selection wins for this execution; absent overrides retain authored realization,
 * and Kernel uses each output primary when neither exists.
 */
function effectiveSelection(
  author: CompiledAuthorSource,
  invocation: Invocation,
): EffectiveSelection {
  const outputs = new Map(author.graph.outputs.map((output) => [output.id, output]));
  const records = new Map(author.program.records.map((record) => [record.id, record]));
  const effective = new Map<string, OutputRoot>();
  const origins = new Map<string, EffectiveSelectionOrigin>();

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
    effective.set(output.id, { kind: "record", id: record.id });
    origins.set(output.id, "authored");
  }

  for (const override of invocation.overrides) {
    const output = outputs.get(override.output);
    if (output === undefined) {
      throw new Error("Invocation override references unknown Logical Output " + override.output);
    }
    if (override.choice.kind === "primary") {
      effective.set(output.id, output.primary);
      origins.set(output.id, "invocation");
      continue;
    }
    const record = records.get(override.choice.record);
    if (record === undefined) {
      throw new Error("Invocation override references unknown Record " + override.choice.record);
    }
    if (!sameType(output.type, record.type)) {
      throw new Error("Invocation override Record has the wrong Type for " + output.id);
    }
    effective.set(output.id, { kind: "record", id: record.id });
    origins.set(output.id, "invocation");
  }

  return {
    graph: author.graph,
    targets: invocation.targets,
    selections: [...effective.entries()]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([output, root]) => ({ output, root })),
    origins,
  };
}

function explainSelections(
  selections: readonly SelectedOutputRecord[],
  origins: ReadonlyMap<string, EffectiveSelectionOrigin>,
): readonly EffectiveOutputSelection[] {
  return selections.map((selection) => ({
    ...selection,
    origin: origins.get(selection.output) ?? "primary",
  }));
}

/** The exact Author-compilation boundary required by Invocation compilation. */
export type InvocationAuthorCompiler = {
  openEntry(locator: string): Promise<WorkspaceSession>;
  compileResolvedSource(entry: ResolvedSource, workspace: WorkspaceSession): Promise<CompiledAuthorSource>;
};

export type InvocationCompilerOptions = {
  readonly authorCompiler: InvocationAuthorCompiler;
  readonly frontends: InvocationFrontendRegistryLike;
};

export type CompiledInvocation = {
  readonly authorSource: string;
  readonly author: CompiledAuthorSource;
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
  readonly selections: readonly EffectiveOutputSelection[];
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
    const author = await this.#options.authorCompiler.compileResolvedSource(authorSource, workspace);
    const program = author.program;
    const preset = await resolveInvocationSourceDocument(document, { compilation: author });
    const effective = effectiveSelection(author, preset.invocation);
    const plan = planBuild(program, effective.graph, effective.targets, effective.selections);
    return {
      document,
      authorSource,
      author,
      program,
      preset,
      plan,
    };
  }

  /** Validate the Author Source and the finite Invocation without executing either. */
  async checkPresetResolvedSource(source: ResolvedSource, workspace: WorkspaceSession): Promise<CheckedInvocationPreset> {
    const resolved = await this.#resolvePresetStructure(source, workspace);
    return {
      source: workspace.sourceLocation?.(source.unit) ?? source.unit.id,
      authorSource: workspace.sourceLocation?.(resolved.authorSource.unit) ?? resolved.authorSource.unit.id,
      author: resolved.author,
      program: resolved.program,
      document: resolved.document,
      attachments: mergeAttachments([resolved.author.attachments, await workspace.attachments()]),
    };
  }

  /** Compile one saved Invocation preset and its explicitly named Author Source. */
  async compilePresetResolvedSource(source: ResolvedSource, workspace: WorkspaceSession): Promise<CompiledInvocation> {
    const resolved = await this.#resolvePresetStructure(source, workspace);
    const { author, program, preset, plan: structuralPlan } = resolved;
    return {
      authorSource: workspace.sourceLocation?.(resolved.authorSource.unit) ?? resolved.authorSource.unit.id,
      author,
      program,
      invocation: preset.invocation,
      preset: { source: workspace.sourceLocation?.(source.unit) ?? source.unit.id, document: resolved.document },
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
    const author = await this.#options.authorCompiler.compileResolvedSource(source, workspace);
    const invocation = resolveInvocationRequest(request, { compilation: author });
    const effective = effectiveSelection(author, invocation);
    return {
      authorSource: workspace.sourceLocation?.(source.unit) ?? source.unit.id,
      author,
      program: author.program,
      invocation,
      selection: planBuild(author.program, effective.graph, effective.targets, effective.selections),
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
      effective.targets,
      preliminary,
    );
    const definition = defineBuild({
      program: sliced.program,
      plan: sliced.plan,
    });
    const state = materializeBuild(definition, []);
    const explainedSelections = explainSelections(sliced.selections, effective.origins);
    const selections = new Map(explainedSelections.map((selection) => [selection.output, selection]));
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
    return { compilation, selections: explainedSelections, publication, definition, state };
  }

  /** Plan a distinct in-memory Invocation without changing the Author Source. */
  prepareVariant(compilation: CompiledInvocation, invocation: Invocation): PreparedBuild {
    const effective = effectiveSelection(compilation.author, invocation);
    return this.prepareCompilation({
      ...compilation,
      invocation,
      selection: planBuild(compilation.program, effective.graph, effective.targets, effective.selections),
    });
  }

  async preparePresetEntry(locator: string): Promise<PreparedBuild> {
    return this.prepareCompilation(await this.compilePresetEntry(locator));
  }
}
