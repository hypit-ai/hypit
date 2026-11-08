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
import { assertOrderedBuildId, compareCodeUnits } from "@hypit/protocol";

import { lowerGenerationGraph } from "./lower.js";
import { assertGenerationGraphProject } from "./project.js";
import type {
  GenerationGraphLoweringHost,
  GenerationGraphProject,
  GenerationGraphResourceAttachment,
  GenerationNodeProduct,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export type PreparedGenerationGraphTarget = {
  readonly node: string;
  readonly type: TypeRef;
  readonly record: string;
  readonly selected: "generate" | { readonly product: string };
};

export type PreparedGenerationGraphNode = {
  readonly node: string;
  readonly record: string;
};

type PreparedGenerationGraphBase = {
  readonly project: string;
  readonly revision: number;
  readonly targets: readonly PreparedGenerationGraphTarget[];
  readonly attachments: readonly GenerationGraphResourceAttachment[];
};

/** Every requested value already exists. No Runtime submission or new Result is necessary. */
export type ReusedGenerationGraphTargets = PreparedGenerationGraphBase & {
  readonly kind: "reuse";
};

/** At least one node must execute and every demanded generated node receives a Product attempt. */
export type PreparedGenerationGraphBuild = PreparedGenerationGraphBase & {
  readonly kind: "build";
  readonly definition: BuildDefinition;
  readonly publication: PublicationIntent;
  readonly generated: readonly PreparedGenerationGraphNode[];
  readonly executionPackages: readonly string[];
};

export type PreparedGenerationGraphSelection =
  | ReusedGenerationGraphTargets
  | PreparedGenerationGraphBuild;

/** Prepare one finite target selection without touching Runtime, Result storage or the project file. */
export async function prepareGenerationGraphTargets(
  project: GenerationGraphProject,
  program: import("@hypit/protocol").LinkedProgram,
  host: GenerationGraphLoweringHost,
  targets: readonly string[],
): Promise<PreparedGenerationGraphSelection> {
  assertGenerationGraphProject(project);
  assert(targets.length > 0, "Generation Graph selection has no Targets.");
  const unique = new Set(targets);
  assert(unique.size === targets.length, "Generation Graph selection repeats a Target.");
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  for (const target of targets) assert(nodes.has(target), `Unknown Generation Graph target: ${target}`);

  const lowered = await lowerGenerationGraph(project, program, host, { targets });
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
      selected: node.selected === "generate" ? "generate" : { product: node.selected },
    };
  });
  const base = {
    project: project.id,
    revision: project.revision,
    targets: preparedTargets,
    attachments: lowered.attachments,
  } as const;
  if (sliced.plan.steps.length === 0) return { kind: "reuse", ...base };

  const demanded = new Set(sliced.plan.steps.map((step) => step.id));
  const generated = project.nodes.flatMap((node): PreparedGenerationGraphNode[] => {
    if (node.selected !== "generate") return [];
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
    ...base,
    definition: defineBuild({ program: sliced.program, plan: sliced.plan }),
    publication,
    generated,
    executionPackages: lowered.executionPackages,
  };
}

export type AcceptedGenerationGraphProduct = {
  readonly node: string;
  readonly path: string;
  readonly document: GenerationNodeProduct;
};

export type AcceptedGenerationGraphBuild = {
  readonly build: string;
  readonly products: readonly AcceptedGenerationGraphProduct[];
  readonly transaction: import("./transaction.js").GenerationGraphTransaction;
};

/** Plan the author-state transition performed only after Runtime has accepted the Build id. */
export function acceptGenerationGraphBuild(
  prepared: PreparedGenerationGraphBuild,
  build: string,
): AcceptedGenerationGraphBuild {
  assertOrderedBuildId(build);
  const products = prepared.generated.map((generated): AcceptedGenerationGraphProduct => ({
    node: generated.node,
    path: `./products/${encodeURIComponent(generated.node)}/${encodeURIComponent(build)}.json`,
    document: {
      format: "hypit.node-product@1",
      build,
      output: generated.node,
    },
  }));
  return {
    build,
    products,
    transaction: {
      revision: prepared.revision,
      commands: products.flatMap((product) => [{
        kind: "node.product.add" as const,
        id: product.node,
        path: product.path,
      }, {
        kind: "node.select" as const,
        id: product.node,
        selected: product.path,
      }]),
    },
  };
}
