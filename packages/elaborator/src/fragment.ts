import {
  digestOf,
  isDigest,
  resolveProducer,
} from "@narratage/core";
import type {
  Candidate,
  Satisfaction,
  CandidateRoot,
  CompiledGraph,
  Digest,
  GraphValueRef,
  LinkedProgram,
  LogicalOutput,
  OperationNode,
  ProducerRef,
  TypeRef,
} from "@narratage/protocol";

export type FragmentInputRef = {
  readonly kind: "fragment-input";
  readonly name: string;
};

export type FragmentOperationRef = {
  readonly kind: "fragment-operation";
  readonly operation: string;
};

export type FragmentValueRef = FragmentInputRef | FragmentOperationRef;

export type FragmentOperationResult =
  | { readonly kind: "output"; readonly name: string }
  | { readonly kind: "need"; readonly name: string };

export type FragmentOperation = {
  readonly id: string;
  readonly producer: ProducerRef;
  readonly inputs: Readonly<Record<string, FragmentValueRef>>;
  readonly result: FragmentOperationResult;
};

export type FragmentExport = {
  readonly name: string;
  readonly type: TypeRef;
  readonly root: FragmentOperationRef;
};

export type GraphFragment = {
  readonly format: "svml.fragment@1";
  readonly id: Digest;
  readonly inputs: readonly { readonly name: string; readonly type: TypeRef }[];
  readonly operations: readonly FragmentOperation[];
  readonly exports: readonly FragmentExport[];
};

export type FragmentInstanceRequest = {
  /** Stable author instance identity, not a content-deduplication key. */
  readonly id: string;
  readonly fragment: Digest;
  readonly inputs: Readonly<Record<string, GraphValueRef>>;
};

export type ElaboratedFragmentExport = {
  readonly name: string;
  readonly type: TypeRef;
  readonly root: CandidateRoot;
};

export type ElaboratedFragment = {
  readonly format: "svml.fragment-instance@1";
  readonly id: Digest;
  readonly fragment: Digest;
  readonly instance: string;
  readonly inputs: Readonly<Record<string, GraphValueRef>>;
  readonly operations: readonly OperationNode[];
  readonly exports: readonly ElaboratedFragmentExport[];
};

export type FragmentContribution = {
  readonly outputs: readonly LogicalOutput[];
  readonly candidates: readonly Candidate[];
  readonly operations: readonly OperationNode[];
  /** Explicit Run-Graph satisfactions; Author contributions leave this absent. */
  readonly satisfactions?: readonly Satisfaction[];
};

export type RunFragmentExport = {
  readonly name: string;
  readonly candidate: string;
  readonly type: TypeRef;
};

export type RunFragmentContribution = FragmentContribution & {
  readonly exports: readonly RunFragmentExport[];
};

export class FragmentError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "FragmentError";
    this.code = code;
    this.subject = subject;
  }
}

function assert(condition: unknown, code: string, message: string, subject?: string): asserts condition {
  if (!condition) throw new FragmentError(code, message, subject);
}

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

function typeName(type: TypeRef): string {
  return `${type.module.name}@${type.module.version}#${type.name}`;
}

function exactKeys(
  actual: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  subject: string,
): void {
  const left = Object.keys(actual).sort();
  const right = [...expected].sort();
  assert(
    JSON.stringify(left) === JSON.stringify(right),
    "FRAGMENT_PORT_BINDING_MISMATCH",
    `${subject} binds [${left.join(", ")}] but declares [${right.join(", ")}]`,
    subject,
  );
}

function normalizeFragmentRef(ref: FragmentValueRef): FragmentValueRef {
  if (ref.kind === "fragment-input") return { kind: "fragment-input", name: ref.name };
  assert(
    ref.kind === "fragment-operation",
    "INVALID_FRAGMENT_REFERENCE",
    "Fragment references must name a declared input or local Operation",
  );
  return { kind: "fragment-operation", operation: ref.operation };
}

function normalizeOperation(operation: FragmentOperation): FragmentOperation {
  return {
    id: operation.id,
    producer: operation.producer,
    inputs: Object.fromEntries(
      Object.entries(operation.inputs)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, ref]) => [name, normalizeFragmentRef(ref)]),
    ),
    result: operation.result.kind === "output"
      ? { kind: "output", name: operation.result.name }
      : {
          kind: "need",
          name: operation.result.name,
        },
  };
}

function normalizeExport(item: FragmentExport): FragmentExport {
  return {
    name: item.name,
    type: item.type,
    root: normalizeFragmentRef(item.root) as FragmentOperationRef,
  };
}

function fragmentContent(fragment: Omit<GraphFragment, "id">): Omit<GraphFragment, "id"> {
  return {
    format: "svml.fragment@1",
    inputs: [...fragment.inputs]
      .map((input) => ({ name: input.name, type: input.type }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    operations: [...fragment.operations].map(normalizeOperation).sort((left, right) => left.id.localeCompare(right.id)),
    exports: [...fragment.exports].map(normalizeExport).sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function sealGraphFragment(
  fragment: Omit<GraphFragment, "format" | "id">,
): GraphFragment {
  const content = fragmentContent({ format: "svml.fragment@1", ...fragment });
  return { ...content, id: digestOf(content) };
}

function resultType(program: LinkedProgram, operation: FragmentOperation): TypeRef {
  const producer = resolveProducer(program.closure, operation.producer);
  if (operation.result.kind === "output") {
    const output = producer.outputs.find((port) => port.name === operation.result.name);
    assert(
      output !== undefined && producer.needs.length === 0,
      "FRAGMENT_RESULT_MISMATCH",
      `${operation.id} does not produce output ${operation.result.name}`,
      operation.id,
    );
    return output.type;
  }
  const need = producer.needs.find((port) => port.name === operation.result.name);
  assert(
    need !== undefined && producer.outputs.length === 0,
    "FRAGMENT_RESULT_MISMATCH",
    `${operation.id} does not request Need ${operation.result.name}`,
    operation.id,
  );
  return need.returns;
}

export function verifyGraphFragment(program: LinkedProgram, fragment: GraphFragment): void {
  assert(fragment.format === "svml.fragment@1", "UNSUPPORTED_FRAGMENT", "unsupported Graph Fragment format");
  assert(isDigest(fragment.id), "INVALID_FRAGMENT_DIGEST", "Graph Fragment id is not a digest");
  assert(fragment.id === digestOf(fragmentContent(fragment)), "FRAGMENT_DIGEST_MISMATCH", "Graph Fragment digest differs");
  assert(fragment.exports.length > 0, "EMPTY_FRAGMENT_EXPORTS", `${fragment.id} has no exports`);

  const inputs = new Map<string, TypeRef>();
  for (const input of fragment.inputs) {
    assert(input.name.length > 0, "EMPTY_FRAGMENT_INPUT", `${fragment.id} has an empty input name`);
    assert(!inputs.has(input.name), "DUPLICATE_FRAGMENT_INPUT", `${fragment.id} repeats input ${input.name}`);
    inputs.set(input.name, input.type);
  }

  const operations = new Map<string, FragmentOperation>();
  for (const operation of fragment.operations) {
    assert(operation.id.length > 0, "EMPTY_FRAGMENT_OPERATION", `${fragment.id} has an empty Operation id`);
    assert(!operations.has(operation.id), "DUPLICATE_FRAGMENT_OPERATION", `${fragment.id} repeats ${operation.id}`);
    operations.set(operation.id, operation);
    const producer = resolveProducer(program.closure, operation.producer);
    exactKeys(operation.inputs, producer.inputs.map((port) => port.name), `${fragment.id}.${operation.id}`);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const operationType = (id: string): TypeRef => {
    const operation = operations.get(id);
    assert(operation !== undefined, "UNKNOWN_FRAGMENT_OPERATION", `${fragment.id} references ${id}`, id);
    if (visited.has(id)) return resultType(program, operation);
    assert(!visiting.has(id), "FRAGMENT_CYCLE", `${fragment.id} cycles through ${id}`, id);
    visiting.add(id);
    const producer = resolveProducer(program.closure, operation.producer);
    for (const port of producer.inputs) {
      const ref = operation.inputs[port.name];
      assert(ref !== undefined, "FRAGMENT_PORT_BINDING_MISMATCH", `${operation.id}.${port.name} is unbound`);
      const supplied = ref.kind === "fragment-input"
        ? inputs.get(ref.name)
        : operationType(ref.operation);
      assert(supplied !== undefined, "UNKNOWN_FRAGMENT_INPUT", `${fragment.id} references input ${ref.kind === "fragment-input" ? ref.name : ref.operation}`);
      assert(
        sameType(supplied, port.type),
        "FRAGMENT_INPUT_TYPE_MISMATCH",
        `${operation.id}.${port.name} wants ${typeName(port.type)} but receives ${typeName(supplied)}`,
        operation.id,
      );
    }
    visiting.delete(id);
    visited.add(id);
    return resultType(program, operation);
  };

  const exports = new Set<string>();
  const reachableOperations = new Set<string>();
  const collectDependencies = (ref: FragmentValueRef, seen: Set<string>): void => {
    if (ref.kind === "fragment-input" || seen.has(ref.operation)) return;
    seen.add(ref.operation);
    reachableOperations.add(ref.operation);
    const operation = operations.get(ref.operation);
    assert(operation !== undefined, "UNKNOWN_FRAGMENT_OPERATION", `${fragment.id} references ${ref.operation}`);
    Object.values(operation.inputs).forEach((input) => collectDependencies(input, seen));
  };

  for (const item of fragment.exports) {
    assert(item.name.length > 0, "EMPTY_FRAGMENT_EXPORT", `${fragment.id} has an empty export name`);
    assert(!exports.has(item.name), "DUPLICATE_FRAGMENT_EXPORT", `${fragment.id} repeats export ${item.name}`);
    exports.add(item.name);
    assert(
      item.root.kind === "fragment-operation",
      "INVALID_FRAGMENT_EXPORT_ROOT",
      `${fragment.id}.${item.name} must export a local Operation result`,
    );
    const supplied = operationType(item.root.operation);
    assert(
      sameType(supplied, item.type),
      "FRAGMENT_EXPORT_TYPE_MISMATCH",
      `${fragment.id}.${item.name} declares ${typeName(item.type)} but returns ${typeName(supplied)}`,
    );
    collectDependencies(item.root, new Set());
  }
  for (const id of operations.keys()) {
    assert(
      reachableOperations.has(id),
      "UNREACHABLE_FRAGMENT_OPERATION",
      `${fragment.id}.${id} contributes to no export`,
      id,
    );
  }
}

function normalizeGraphRef(ref: GraphValueRef): GraphValueRef {
  if (ref.kind === "record") return { kind: "record", id: ref.id };
  if (ref.kind === "logical-output") return { kind: "logical-output", id: ref.id };
  assert(
    ref.kind === "operation-result",
    "INVALID_FRAGMENT_BINDING",
    "Fragment inputs must bind to a Graph Value reference",
  );
  return { kind: "operation-result", operation: ref.operation };
}

function hygienicId(kind: string, fragment: Digest, instance: string, local: string): string {
  return `${kind}:${digestOf({ fragment, instance, local }).slice("sha256:".length)}`;
}

export function elaborateGraphFragment(
  program: LinkedProgram,
  fragment: GraphFragment,
  request: FragmentInstanceRequest,
): ElaboratedFragment {
  verifyGraphFragment(program, fragment);
  assert(request.id.length > 0, "EMPTY_FRAGMENT_INSTANCE", "Fragment instance id is empty");
  assert(request.fragment === fragment.id, "FRAGMENT_INSTANCE_MISMATCH", `${request.id} locks another Fragment`);
  exactKeys(request.inputs, fragment.inputs.map((input) => input.name), request.id);
  const inputs = Object.fromEntries(
    Object.entries(request.inputs)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, ref]) => [name, normalizeGraphRef(ref)]),
  );
  const operationIds = new Map(fragment.operations.map((operation) => [
    operation.id,
    hygienicId("operation", fragment.id, request.id, operation.id),
  ]));
  const mapRef = (ref: FragmentValueRef): GraphValueRef => {
    if (ref.kind === "fragment-input") {
      const bound = inputs[ref.name];
      assert(bound !== undefined, "UNKNOWN_FRAGMENT_INPUT", `${request.id} does not bind ${ref.name}`);
      return bound;
    }
    const operation = operationIds.get(ref.operation);
    assert(operation !== undefined, "UNKNOWN_FRAGMENT_OPERATION", `${fragment.id} references ${ref.operation}`);
    return { kind: "operation-result", operation };
  };
  const operations: OperationNode[] = fragment.operations.map((operation) => {
    const id = operationIds.get(operation.id) as string;
    const record = hygienicId("record", fragment.id, request.id, operation.id);
    return {
      id,
      producer: operation.producer,
      inputs: Object.fromEntries(Object.entries(operation.inputs).map(([name, ref]) => [name, mapRef(ref)])),
      result: operation.result.kind === "output"
        ? { kind: "output", name: operation.result.name, record }
        : {
            kind: "need",
            name: operation.result.name,
            id: hygienicId("need", fragment.id, request.id, operation.id),
            record,
          },
    };
  });
  const exports: ElaboratedFragmentExport[] = fragment.exports.map((item) => {
    const root = mapRef(item.root);
    assert(root.kind === "operation-result", "INVALID_FRAGMENT_EXPORT_ROOT", item.name);
    return {
      name: item.name,
      type: item.type,
      root: { kind: "operation" as const, result: root },
    };
  });
  const content = {
    format: "svml.fragment-instance@1" as const,
    fragment: fragment.id,
    instance: request.id,
    inputs,
    operations,
    exports,
  };
  return { ...content, id: digestOf(content) };
}

function exportMap(instance: ElaboratedFragment): Map<string, ElaboratedFragmentExport> {
  return new Map(instance.exports.map((item) => [item.name, item]));
}

function reachableOperationIds(
  instance: ElaboratedFragment,
  selected: readonly ElaboratedFragmentExport[],
): Set<string> {
  const operations = new Map(instance.operations.map((operation) => [operation.id, operation]));
  const reachable = new Set<string>();
  const visit = (id: string): void => {
    if (reachable.has(id)) return;
    reachable.add(id);
    const operation = operations.get(id);
    assert(operation !== undefined, "UNKNOWN_ELABORATED_OPERATION", `${instance.instance} references ${id}`);
    for (const ref of Object.values(operation.inputs)) {
      if (ref.kind === "operation-result") visit(ref.operation);
    }
  };
  for (const item of selected) {
    assert(item.root.kind === "operation", "INVALID_FRAGMENT_EXPORT_ROOT", item.name);
    visit(item.root.result.operation);
  }
  return reachable;
}

function bindExports(
  instance: ElaboratedFragment,
  bindings: Readonly<Record<string, string>>,
  requireAll: boolean,
): FragmentContribution {
  const available = exportMap(instance);
  if (requireAll) exactKeys(bindings, instance.exports.map((item) => item.name), instance.instance);
  assert(Object.keys(bindings).length > 0, "EMPTY_FRAGMENT_BINDING", `${instance.instance} binds no exports`);
  const selected = Object.keys(bindings).map((name) => {
    const item = available.get(name);
    assert(item !== undefined, "UNKNOWN_FRAGMENT_EXPORT", `${instance.instance} has no export ${name}`);
    return item;
  });
  const candidates: Candidate[] = selected.map((item) => {
    const output = bindings[item.name] as string;
    assert(output.length > 0, "EMPTY_LOGICAL_OUTPUT_ID", `${instance.instance}.${item.name} output is empty`);
    return {
      id: hygienicId("candidate", instance.fragment, instance.instance, item.name),
      type: item.type,
      root: item.root,
    };
  });
  const outputs: LogicalOutput[] = requireAll
    ? selected.map((item, index) => ({
        id: bindings[item.name] as string,
        type: item.type,
        primary: candidates[index]!.id,
      }))
    : [];
  const reachable = reachableOperationIds(instance, selected);
  return {
    outputs,
    candidates,
    operations: instance.operations.filter((operation) => reachable.has(operation.id)),
    ...(requireAll
      ? {}
      : {
          satisfactions: selected.map((item, index) => ({
            output: bindings[item.name] as string,
            candidate: candidates[index]!.id,
          })),
        }),
  };
}

/**
 * Instantiate a Run-Graph Fragment without deciding which Author Logical Outputs it will satisfy.
 * Multiple exports share the instance's internal Operations; separate calls always create separate
 * instances because identity comes from the already elaborated `instance.instance` path.
 */
export function exportRunFragment(
  instance: ElaboratedFragment,
  names: readonly string[] = instance.exports.map((item) => item.name),
): RunFragmentContribution {
  assert(names.length > 0, "EMPTY_FRAGMENT_BINDING", `${instance.instance} exports no Run values`);
  assert(new Set(names).size === names.length, "DUPLICATE_FRAGMENT_EXPORT", `${instance.instance} repeats a Run export`);
  const available = exportMap(instance);
  const selected = names.map((name) => {
    const item = available.get(name);
    assert(item !== undefined, "UNKNOWN_FRAGMENT_EXPORT", `${instance.instance} has no export ${name}`);
    return item;
  });
  const candidates: Candidate[] = selected.map((item) => ({
    id: hygienicId("candidate", instance.fragment, instance.instance, item.name),
    type: item.type,
    root: item.root,
  }));
  const reachable = reachableOperationIds(instance, selected);
  return {
    outputs: [],
    candidates,
    operations: instance.operations.filter((operation) => reachable.has(operation.id)),
    exports: selected.map((item, index) => ({
      name: item.name,
      candidate: candidates[index]!.id,
      type: item.type,
    })),
  };
}

/** Bind all Fragment exports as new author-visible Logical Outputs. */
export function bindAuthorFragment(
  instance: ElaboratedFragment,
  outputs: Readonly<Record<string, string>>,
): FragmentContribution {
  return bindExports(instance, outputs, true);
}

/** Merge already elaborated contributions; final Graph validation remains Core's authority. */
export function mergeFragmentContributions(
  graph: Pick<CompiledGraph, "outputs" | "candidates" | "operations">,
  ...contributions: readonly FragmentContribution[]
): Pick<CompiledGraph, "outputs" | "candidates" | "operations"> {
  return {
    outputs: [...graph.outputs, ...contributions.flatMap((item) => item.outputs)],
    candidates: [...graph.candidates, ...contributions.flatMap((item) => item.candidates)],
    operations: [...graph.operations, ...contributions.flatMap((item) => item.operations)],
  };
}
