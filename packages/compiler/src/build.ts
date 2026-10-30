import {
  sliceExecution,
  defineBuild,
  materializeBuild,
  planBuild,
} from "@hypit/kernel";
import type { PlannedExecution, ResolvedOutputRecord } from "@hypit/kernel";
import type { BuildView } from "@hypit/kernel";
import type {
  BlobAttachment,
  WorkspaceSession,
} from "@hypit/workspace";
import type {
  BuildDefinition,
  LogicalOutputId,
  ResultIntent,
  TypeRef,
} from "@hypit/protocol";
import type { LinkedProgram } from "@hypit/protocol";
import type { ResolvedSource } from "@hypit/source";
import { resolveCompiledSourceExport } from "@hypit/author";

import type { CompiledAuthorSource } from "./compiler.js";
import { mergeAttachments } from "./compiler.js";

/** Author-facing Target names selected transiently for one Build. */
export type TargetSelection = {
  readonly targets: readonly string[];
};

/** One selected Target resolved against the fixed Author Graph. */
export type ResolvedTarget = {
  readonly name: string;
  readonly output: LogicalOutputId;
  readonly type: TypeRef;
};

export type ResolvedTargetSelection = {
  readonly targets: readonly ResolvedTarget[];
};

/** The exact Author-compilation boundary required while preparing a Build. */
export type BuildAuthorCompiler = {
  openEntry(locator: string): Promise<WorkspaceSession>;
  compileResolvedSource(entry: ResolvedSource, workspace: WorkspaceSession): Promise<CompiledAuthorSource>;
};

export type BuildCompilerOptions = {
  readonly authorCompiler: BuildAuthorCompiler;
};

export type CompiledBuild = {
  readonly authorSource: string;
  readonly author: CompiledAuthorSource;
  readonly program: LinkedProgram;
  readonly selection: ResolvedTargetSelection;
  /** The fixed graph resolution shared by execution slicing and Result retention. */
  readonly execution: PlannedExecution;
  readonly attachments: readonly BlobAttachment[];
};

export type PreparedBuild = {
  readonly compilation: CompiledBuild;
  readonly outputs: readonly ResolvedOutputRecord[];
  /** Author-facing execution goals; targeting does not give an Output Result lifetime. */
  readonly targets: readonly {
    readonly name: string;
    readonly type: TypeRef;
    readonly record: string;
  }[];
  /** Reachable Outputs with package-declared cross-Build lifetime. */
  readonly result: ResultIntent;
  readonly definition: BuildDefinition;
  readonly state: BuildView;
};

function resolveTarget(author: CompiledAuthorSource, name: string): ResolvedTarget {
  const exported = resolveCompiledSourceExport(author, name);
  if (exported.ref.kind !== "logical-output") {
    throw new Error(`${name} is an authored Record, not a produced Logical Output`);
  }
  return { name, output: exported.ref.id, type: exported.type };
}

export function resolveTargetSelection(
  selection: TargetSelection,
  author: CompiledAuthorSource,
): ResolvedTargetSelection {
  const targets = selection.targets.map((name) => resolveTarget(author, name));
  if (targets.length === 0) throw new Error("Build has no Targets");
  const names = new Set<string>();
  const outputs = new Set<string>();
  for (const target of targets) {
    if (names.has(target.name) || outputs.has(target.output)) {
      throw new Error(`Build repeats Target ${target.name}`);
    }
    names.add(target.name);
    outputs.add(target.output);
  }
  return { targets };
}

function outputIds(selection: ResolvedTargetSelection): readonly string[] {
  return selection.targets.map((target) => target.output);
}

/** Compile one Author Source and transient Target selection into one finite Build. */
export class BuildCompiler {
  readonly #options: BuildCompilerOptions;

  constructor(options: BuildCompilerOptions) {
    this.#options = options;
  }

  async compileAuthorResolvedSource(
    source: ResolvedSource,
    workspace: WorkspaceSession,
    request: TargetSelection,
  ): Promise<CompiledBuild> {
    const author = await this.#options.authorCompiler.compileResolvedSource(source, workspace);
    const selection = resolveTargetSelection(request, author);
    return {
      authorSource: workspace.sourceLocation?.(source.unit) ?? source.unit.id,
      author,
      program: author.program,
      selection,
      execution: planBuild(author.program, author.graph, outputIds(selection)),
      attachments: mergeAttachments([author.attachments, await workspace.attachments()]),
    };
  }

  async compileAuthorEntry(locator: string, request: TargetSelection): Promise<CompiledBuild> {
    const workspace = await this.#options.authorCompiler.openEntry(locator);
    return await this.compileAuthorResolvedSource(workspace.entry, workspace, request);
  }

  prepareBuild(compilation: CompiledBuild): PreparedBuild {
    const sliced = sliceExecution(
      compilation.program,
      outputIds(compilation.selection),
      compilation.execution,
    );
    const definition = defineBuild({ program: sliced.program, plan: sliced.plan });
    const state = materializeBuild(definition, []);
    const outputsById = new Map(sliced.outputs.map((output) => [output.output, output]));
    const targets: PreparedBuild["targets"][number][] = [];
    const resultOutputs: ResultIntent["outputs"][number][] = [];
    for (const target of compilation.selection.targets) {
      const resolved = outputsById.get(target.output);
      if (resolved === undefined) throw new Error(`Target ${target.name} has no resolved Record`);
      targets.push({ name: target.name, type: target.type, record: resolved.record });
    }
    for (const retained of compilation.author.retainedOutputs) {
      const resolved = outputsById.get(retained.ref.id);
      if (resolved === undefined) continue;
      resultOutputs.push({ name: retained.name, record: resolved.record });
    }
    const result: ResultIntent = { outputs: resultOutputs };
    return { compilation, outputs: sliced.outputs, targets, result, definition, state };
  }

  /** Prepare another transient Target selection without changing the Author Source. */
  prepareSelection(compilation: CompiledBuild, selection: ResolvedTargetSelection): PreparedBuild {
    return this.prepareBuild({
      ...compilation,
      selection,
      execution: planBuild(compilation.program, compilation.author.graph, outputIds(selection)),
    });
  }
}
