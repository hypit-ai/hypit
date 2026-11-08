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
  type LogicalOutput,
  type TypedRecord,
} from "@hypit/protocol";

import { assertGenerationGraphProject } from "./project.js";
import type {
  GenerationGraphLoweringHost,
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
  const expected = [...implementation.fragment.inputs.map((input) => input.name)].sort();
  const actual = Object.keys(node.inputs).sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `Generation Graph Node ${node.id} binds [${actual.join(", ")}] but component declares [${expected.join(", ")}].`);
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
  options: { readonly targets?: readonly string[] } = {},
): Promise<LoweredGenerationGraph> {
  assertGenerationGraphProject(project);
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  const active = new Set<string>();
  const visit = (id: string): void => {
    if (active.has(id)) return;
    const node = nodes.get(id);
    assert(node !== undefined, `Unknown Generation Graph target: ${id}`);
    active.add(id);
    for (const input of Object.values(node.inputs)) if ("node" in input) visit(input.node);
  };
  (options.targets ?? project.nodes.map((node) => node.id)).forEach(visit);
  const selectedNodes = project.nodes.filter((node) => active.has(node.id));
  const resolvedImplementations = await Promise.all(selectedNodes.map(async (node) => [
    node.id,
    implementationFor(node, await host.resolveImplementation(node, project)),
  ] as const));
  const implementations = new Map<string, GenerationNodeImplementation>(resolvedImplementations);
  for (const implementation of implementations.values()) {
    if (implementation.kind === "operation") verifyGraphFragment(program, implementation.fragment);
  }

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
    const inputs: Record<string, AuthorValueRef> = {};
    for (const declaration of implementation.fragment.inputs) {
      const input = node.inputs[declaration.name]!;
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
  return {
    program: linked,
    graph,
    attachments: host.attachments === undefined ? [] : [...await host.attachments()],
    executionPackages: [...new Set([...implementations.values()].flatMap((implementation) =>
      implementation.kind === "operation" && implementation.executionPackage !== undefined
        ? [implementation.executionPackage]
        : []))].sort(),
  };
}
