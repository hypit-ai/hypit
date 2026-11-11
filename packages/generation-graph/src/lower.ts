import {
  elaborateAuthorGraph,
  verifyGraphFragment,
  type AuthorComponent,
  type AuthorValueRef,
} from "@hypit/author";
import {
  link,
  sealAuthorGraph,
  verifyAuthorGraph,
} from "@hypit/kernel";
import {
  canonicalize,
  sameModule,
  sameType,
  type LogicalOutput,
  type TypedRecord,
} from "@hypit/protocol";

import { assertGenerationGraphProject } from "./project.js";
import type {
  GenerationGraphLoweringHost,
  GenerationGraphDependencyDecision,
  GenerationGraphDependencyPolicy,
  GenerationGraphResourceAttachment,
  GenerationGraphNode,
  GenerationGraphProject,
  GenerationNodeImplementation,
  LoweredGenerationGraph,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function implementationFor(
  node: GenerationGraphNode,
  implementation: GenerationNodeImplementation,
): GenerationNodeImplementation {
  assert(sameModule(implementation.using.module, node.using.module)
    && implementation.using.name === node.using.name,
  `Generation Graph Node ${node.id} resolved the wrong component implementation.`);
  if (implementation.kind === "value") return implementation;
  assert(implementation.fragment.exports.length === 1,
    `Generation Graph Node ${node.id} component must expose exactly one result.`);
  assert(implementation.executionPackage === undefined || implementation.executionPackage.trim().length > 0,
    `Generation Graph Node ${node.id} execution package is empty.`);
  const bindings = implementation.inputs ?? node.inputs;
  const expected = [...implementation.fragment.inputs.map((input) => input.name)].sort();
  const actual = Object.keys(bindings).sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `Generation Graph Node ${node.id} binds [${actual.join(", ")}] but component declares [${expected.join(", ")}].`);
  const authoredDependencies = new Set(Object.values(node.inputs).flatMap((input) =>
    "node" in input ? [input.node] : []));
  const compiledDependencies = new Set<string>();
  for (const input of Object.values(bindings)) {
    if ("node" in input) compiledDependencies.add(input.node);
  }
  assert(JSON.stringify([...compiledDependencies].sort()) === JSON.stringify([...authoredDependencies].sort()),
    `Generation Graph Node ${node.id} compiler must preserve its authored dependencies exactly.`);
  return implementation;
}

/**
 * Lower one saved recipe graph into the existing AuthorGraph execution core.
 * Running or completing a Build never changes this graph.
 */
export async function lowerGenerationGraph(
  project: GenerationGraphProject,
  program: import("@hypit/protocol").LinkedProgram,
  host: GenerationGraphLoweringHost,
  options: {
    readonly targets?: readonly string[];
    readonly dependencyPolicy?: GenerationGraphDependencyPolicy;
  } = {},
): Promise<LoweredGenerationGraph> {
  assertGenerationGraphProject(project);
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  const targets = options.targets ?? project.nodes.map((node) => node.id);
  const targetSet = new Set(targets);
  const active = new Set<string>();
  const implementations = new Map<string, GenerationNodeImplementation>();
  const selectedAttachments: GenerationGraphResourceAttachment[] = [];
  const useDependencyDecision = (
    id: string,
    node: GenerationGraphNode,
    output: import("@hypit/protocol").TypeRef,
    decision: GenerationGraphDependencyDecision,
  ): boolean => {
    if (decision.kind === "execute") return false;
    const value = decision.value;
    assert(sameType(value.type, output),
      `Generation Graph dependency ${id} resolved ${value.type.module.name}/${value.type.name}, expected ${output.module.name}/${output.name}.`);
    implementations.set(id, { kind: "value", using: node.using, type: value.type, value: value.value });
    selectedAttachments.push(...(value.attachments ?? []));
    return true;
  };
  const visit = async (id: string): Promise<void> => {
    if (active.has(id)) return;
    const node = nodes.get(id);
    assert(node !== undefined, `Unknown Generation Graph target: ${id}`);
    active.add(id);
    let dependencyDecision: GenerationGraphDependencyDecision | undefined;
    if (!targetSet.has(id) && options.dependencyPolicy?.kind === "selective"
      && "inspectNode" in host && typeof host.inspectNode === "function") {
      const inspection = await host.inspectNode(node, project);
      if (inspection.kind === "operation") {
        dependencyDecision = await options.dependencyPolicy.decide(node, inspection.output, project);
        if (useDependencyDecision(id, node, inspection.output, dependencyDecision)) return;
      }
    }
    const resolved = implementationFor(node, await host.resolveImplementation(node, project));
    if (resolved.kind === "operation") verifyGraphFragment(program, resolved.fragment);
    let effective: GenerationNodeImplementation = resolved;
    if (resolved.kind === "operation" && !targetSet.has(id)
      && options.dependencyPolicy?.kind === "selective" && dependencyDecision === undefined) {
      const outputType = resolved.fragment.exports[0]!.type;
      dependencyDecision = await options.dependencyPolicy.decide(node, outputType, project);
      if (dependencyDecision.kind === "resolved-value") {
        useDependencyDecision(id, node, outputType, dependencyDecision);
        effective = implementations.get(id)!;
      }
    }
    implementations.set(id, effective);
    if (effective.kind === "operation") {
      const bindings = effective.inputs ?? node.inputs;
      for (const input of Object.values(bindings)) if ("node" in input) await visit(input.node);
    }
  };
  for (const target of targets) await visit(target);
  const selectedNodes = project.nodes.filter((node) => active.has(node.id));

  const records = new Map(program.records.map((record) => [record.id, record]));
  const addRecord = (record: TypedRecord): void => {
    const existing = records.get(record.id);
    if (existing === undefined) {
      records.set(record.id, structuredClone(record));
      return;
    }
    assert(JSON.stringify(existing) === JSON.stringify(record),
      `Generation Graph Record ${record.id} conflicts with an existing Record.`);
  };

  const components: AuthorComponent[] = [];
  const valueOutputs: LogicalOutput[] = [];
  for (const node of selectedNodes) {
    const implementation = implementations.get(node.id)!;
    if (implementation.kind !== "value") continue;
    const record: TypedRecord = {
      id: `generation-graph:${project.id}:${node.id}:value`,
      type: implementation.type,
      value: implementation.value,
    };
    addRecord(record);
    valueOutputs.push({
      id: node.id,
      type: implementation.type,
      result: { kind: "record", id: record.id },
    });
  }
  for (const node of selectedNodes) {
    const implementation = implementations.get(node.id)!;
    if (implementation.kind === "value") continue;
    const bindings = implementation.inputs ?? node.inputs;
    const inputs: Record<string, AuthorValueRef> = {};
    for (const declaration of implementation.fragment.inputs) {
      const input = bindings[declaration.name]!;
      if ("value" in input) {
        const record: TypedRecord = {
          id: `generation-graph:${project.id}:${node.id}:input:${declaration.name}`,
          type: declaration.type,
          value: canonicalize(input.value),
        };
        addRecord(record);
        inputs[declaration.name] = { kind: "record", id: record.id };
        continue;
      }
      const dependency = implementations.get(input.node)!;
      inputs[declaration.name] = dependency.kind === "value"
        ? { kind: "record", id: `generation-graph:${project.id}:${input.node}:value` }
        : {
            kind: "component-output",
            component: `generation-graph:${input.node}`,
            output: dependency.fragment.exports[0]!.name,
          };
    }
    components.push({
      id: `generation-graph:${node.id}`,
      fragment: implementation.fragment,
      inputs,
      outputs: { [implementation.fragment.exports[0]!.name]: node.id },
    });
  }

  const linked = link(program.closure, [...records.values()]);
  const generated = elaborateAuthorGraph(linked, components);
  const graph = sealAuthorGraph({
    outputs: [...generated.outputs, ...valueOutputs],
    operations: generated.operations,
  });
  verifyAuthorGraph(linked, graph);
  const attachments = [
    ...(host.attachments === undefined ? [] : [...await host.attachments()]),
    ...selectedAttachments,
  ];
  const uniqueAttachments = new Map<string, GenerationGraphResourceAttachment>();
  for (const attachment of attachments) {
    const existing = uniqueAttachments.get(attachment.blob.resource);
    assert(existing === undefined || JSON.stringify(existing.blob) === JSON.stringify(attachment.blob),
      `Generation Graph resource ${attachment.blob.resource} has conflicting BlobRefs.`);
    if (existing === undefined) uniqueAttachments.set(attachment.blob.resource, attachment);
  }
  return {
    program: linked,
    graph,
    attachments: [...uniqueAttachments.values()],
    executionPackages: [...new Set([...implementations.values()].flatMap((implementation) =>
      implementation.kind === "operation" && implementation.executionPackage !== undefined
        ? [implementation.executionPackage]
        : []))].sort(),
  };
}
