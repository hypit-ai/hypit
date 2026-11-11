import {
  defineBuild,
  planBuild,
  sliceExecution,
} from "@hypit/kernel";
import { productPublisher } from "@hypit/product";
import type {
  BuildDefinition,
  PublicationIntent,
  TypeRef,
} from "@hypit/protocol";
import { compareCodeUnits } from "@hypit/protocol";

import { lowerGenerationGraph } from "./lower.js";
import { assertGenerationGraphProject } from "./project.js";
import type {
  GenerationGraphLoweringHost,
  GenerationGraphDependencyPolicy,
  GenerationGraphProject,
  GenerationGraphResourceAttachment,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export type PreparedGenerationGraphTarget = {
  readonly node: string;
  readonly type: TypeRef;
  readonly record: string;
};

export type PreparedGenerationGraphNode = {
  readonly node: string;
  readonly record: string;
};

export type PreparedGenerationGraphBuild = {
  readonly kind: "build";
  readonly project: string;
  readonly revision: number;
  readonly targets: readonly PreparedGenerationGraphTarget[];
  readonly attachments: readonly GenerationGraphResourceAttachment[];
  readonly definition: BuildDefinition;
  readonly publication: PublicationIntent;
  readonly generated: readonly PreparedGenerationGraphNode[];
  readonly executionPackages: readonly string[];
};

/** Prepare one finite target selection without touching Runtime, Result storage or the project file. */
export async function prepareGenerationGraphTargets(
  project: GenerationGraphProject,
  program: import("@hypit/protocol").LinkedProgram,
  host: GenerationGraphLoweringHost,
  targets: readonly string[],
  options: { readonly dependencyPolicy?: GenerationGraphDependencyPolicy } = {},
): Promise<PreparedGenerationGraphBuild> {
  assertGenerationGraphProject(project);
  assert(targets.length > 0, "Generation Graph selection has no Targets.");
  const unique = new Set(targets);
  assert(unique.size === targets.length, "Generation Graph selection repeats a Target.");
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  for (const target of targets) assert(nodes.has(target), `Unknown Generation Graph target: ${target}`);

  const lowered = await lowerGenerationGraph(project, program, host, {
    targets,
    ...(options.dependencyPolicy === undefined ? {} : { dependencyPolicy: options.dependencyPolicy }),
  });
  const execution = planBuild(lowered.program, lowered.graph, targets);
  const sliced = sliceExecution(lowered.program, targets, execution);
  const outputs = new Map(execution.outputs.map((output) => [output.output, output.record]));
  const graphOutputs = new Map(lowered.graph.outputs.map((output) => [output.id, output]));
  const preparedTargets = targets.map((id): PreparedGenerationGraphTarget => {
    const node = nodes.get(id)!;
    const output = graphOutputs.get(id)!;
    const record = outputs.get(id);
    assert(record !== undefined, `Generation Graph Target ${id} has no resolved Record.`);
    return {
      node: id,
      type: output.type,
      record,
    };
  });
  assert(sliced.plan.steps.length > 0,
    "Generation Graph Target has no executable work; target an operation that consumes the existing value.");

  const demanded = new Set(sliced.plan.steps.map((step) => step.id));
  const generated = project.nodes.flatMap((node): PreparedGenerationGraphNode[] => {
    const output = graphOutputs.get(node.id);
    if (output?.result.kind !== "operation-result" || !demanded.has(output.result.operation)) return [];
    const operationId = output.result.operation;
    const operation = lowered.graph.operations.find((candidate) => candidate.id === operationId);
    assert(operation !== undefined, `Generation Graph Node ${node.id} has no result Operation.`);
    return [{ node: node.id, record: operation.result.record }];
  }).sort((left, right) => compareCodeUnits(left.node, right.node));
  assert(generated.length > 0, "Generation Graph Build has work but no generated Node output.");
  const publication: PublicationIntent = {
    outputs: generated.map((item) => ({
      name: item.node,
      record: item.record,
      publisher: productPublisher,
    })),
  };
  return {
    kind: "build",
    project: project.id,
    revision: project.revision,
    targets: preparedTargets,
    attachments: lowered.attachments,
    definition: defineBuild({ program: sliced.program, plan: sliced.plan }),
    publication,
    generated,
    executionPackages: lowered.executionPackages,
  };
}
