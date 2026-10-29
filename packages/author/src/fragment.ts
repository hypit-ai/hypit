import {
  resolveCapability,
  resolveProducer,
} from "@hypit/kernel";
import type {
  OutputRoot,
  AuthorGraph,
  GraphValueRef,
  LinkedProgram,
  LogicalOutput,
  OperationNode,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";
import { compareCodeUnits, sameType, typeKey } from "@hypit/protocol";

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
  readonly format: "hypit.fragment@1";
  readonly inputs: readonly { readonly name: string; readonly type: TypeRef }[];
  readonly operations: readonly FragmentOperation[];
  readonly exports: readonly FragmentExport[];
};

export type FragmentInstanceRequest = {
  /** Stable author instance identity, not a content-deduplication key. */
  readonly id: string;
  readonly inputs: Readonly<Record<string, GraphValueRef>>;
};

export type ElaboratedFragmentExport = {
  readonly name: string;
  readonly type: TypeRef;
  readonly root: OutputRoot;
};

export type ElaboratedFragment = {
  readonly format: "hypit.fragment-instance@1";
  readonly id: string;
  readonly instance: string;
  readonly inputs: Readonly<Record<string, GraphValueRef>>;
  readonly operations: readonly OperationNode[];
  readonly exports: readonly ElaboratedFragmentExport[];
};

export type FragmentContribution = {
  readonly outputs: readonly LogicalOutput[];
  readonly operations: readonly OperationNode[];
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

function typeName(type: TypeRef): string {
  return typeKey(type);
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
        .sort(([left], [right]) => compareCodeUnits(left, right))
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

function fragmentContent(fragment: GraphFragment): GraphFragment {
  return {
    format: "hypit.fragment@1",
    inputs: [...fragment.inputs]
      .map((input) => ({ name: input.name, type: input.type }))
      .sort((left, right) => compareCodeUnits(left.name, right.name)),
    operations: [...fragment.operations].map(normalizeOperation).sort((left, right) => compareCodeUnits(left.id, right.id)),
    exports: [...fragment.exports].map(normalizeExport).sort((left, right) => compareCodeUnits(left.name, right.name)),
  };
}

export function sealGraphFragment(
  fragment: Omit<GraphFragment, "format">,
): GraphFragment {
  return fragmentContent({ format: "hypit.fragment@1", ...fragment });
}

function resultType(program: LinkedProgram, operation: FragmentOperation): TypeRef {
  const producer = resolveProducer(program.closure, operation.producer);
  if (operation.result.kind === "output") {
    const output = producer.result;
    assert(
      output.kind === "output" && output.name === operation.result.name,
      "FRAGMENT_RESULT_MISMATCH",
      `${operation.id} does not produce output ${operation.result.name}`,
      operation.id,
    );
    return output.type;
  }
  const need = producer.result;
  assert(
    need.kind === "need" && need.name === operation.result.name,
    "FRAGMENT_RESULT_MISMATCH",
    `${operation.id} does not request Need ${operation.result.name}`,
    operation.id,
  );
  return resolveCapability(program.closure, need.capability).returns;
}

export function verifyGraphFragment(program: LinkedProgram, fragment: GraphFragment): void {
  const subject = "Graph Fragment";
  assert(fragment.format === "hypit.fragment@1", "UNSUPPORTED_FRAGMENT", "unsupported Graph Fragment format");
  assert(fragment.exports.length > 0, "EMPTY_FRAGMENT_EXPORTS", `${subject} has no exports`);

  const inputs = new Map<string, TypeRef>();
  for (const input of fragment.inputs) {
    assert(input.name.length > 0, "EMPTY_FRAGMENT_INPUT", `${subject} has an empty input name`);
    assert(!inputs.has(input.name), "DUPLICATE_FRAGMENT_INPUT", `${subject} repeats input ${input.name}`);
    inputs.set(input.name, input.type);
  }

  const operations = new Map<string, FragmentOperation>();
  for (const operation of fragment.operations) {
    assert(operation.id.length > 0, "EMPTY_FRAGMENT_OPERATION", `${subject} has an empty Operation id`);
    assert(!operations.has(operation.id), "DUPLICATE_FRAGMENT_OPERATION", `${subject} repeats ${operation.id}`);
    operations.set(operation.id, operation);
    const producer = resolveProducer(program.closure, operation.producer);
    exactKeys(operation.inputs, producer.inputs.map((port) => port.name), `${subject} ${operation.id}`);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const operationType = (id: string): TypeRef => {
    const operation = operations.get(id);
    assert(operation !== undefined, "UNKNOWN_FRAGMENT_OPERATION", `${subject} references ${id}`, id);
    if (visited.has(id)) return resultType(program, operation);
    assert(!visiting.has(id), "FRAGMENT_CYCLE", `${subject} cycles through ${id}`, id);
    visiting.add(id);
    const producer = resolveProducer(program.closure, operation.producer);
    for (const port of producer.inputs) {
      const ref = operation.inputs[port.name];
      assert(ref !== undefined, "FRAGMENT_PORT_BINDING_MISMATCH", `${operation.id}.${port.name} is unbound`);
      const supplied = ref.kind === "fragment-input"
        ? inputs.get(ref.name)
        : operationType(ref.operation);
      assert(supplied !== undefined, "UNKNOWN_FRAGMENT_INPUT", `${subject} references input ${ref.kind === "fragment-input" ? ref.name : ref.operation}`);
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
  const collectDependencies = (ref: FragmentValueRef): void => {
    if (ref.kind === "fragment-input" || reachableOperations.has(ref.operation)) return;
    reachableOperations.add(ref.operation);
    const operation = operations.get(ref.operation);
    assert(operation !== undefined, "UNKNOWN_FRAGMENT_OPERATION", `${subject} references ${ref.operation}`);
    Object.values(operation.inputs).forEach(collectDependencies);
  };

  for (const item of fragment.exports) {
    assert(item.name.length > 0, "EMPTY_FRAGMENT_EXPORT", `${subject} has an empty export name`);
    assert(!exports.has(item.name), "DUPLICATE_FRAGMENT_EXPORT", `${subject} repeats export ${item.name}`);
    exports.add(item.name);
    assert(
      item.root.kind === "fragment-operation",
      "INVALID_FRAGMENT_EXPORT_ROOT",
      `${subject} export ${item.name} must name a local Operation result`,
    );
    const supplied = operationType(item.root.operation);
    assert(
      sameType(supplied, item.type),
      "FRAGMENT_EXPORT_TYPE_MISMATCH",
      `${subject} export ${item.name} declares ${typeName(item.type)} but returns ${typeName(supplied)}`,
    );
    collectDependencies(item.root);
  }
  for (const id of operations.keys()) {
    assert(
      reachableOperations.has(id),
      "UNREACHABLE_FRAGMENT_OPERATION",
      `${subject} Operation ${id} contributes to no export`,
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

function hygienicId(kind: string, instance: string, local: string): string {
  return `${kind}:${encodeURIComponent(instance)}:${encodeURIComponent(local)}`;
}

export function elaborateGraphFragment(
  program: LinkedProgram,
  fragment: GraphFragment,
  request: FragmentInstanceRequest,
): ElaboratedFragment {
  verifyGraphFragment(program, fragment);
  assert(request.id.length > 0, "EMPTY_FRAGMENT_INSTANCE", "Fragment instance id is empty");
  exactKeys(request.inputs, fragment.inputs.map((input) => input.name), request.id);
  const inputs = Object.fromEntries(
    Object.entries(request.inputs)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([name, ref]) => [name, normalizeGraphRef(ref)]),
  );
  const operationIds = new Map(fragment.operations.map((operation) => [
    operation.id,
    hygienicId("operation", request.id, operation.id),
  ]));
  const mapRef = (ref: FragmentValueRef): GraphValueRef => {
    if (ref.kind === "fragment-input") {
      const bound = inputs[ref.name];
      assert(bound !== undefined, "UNKNOWN_FRAGMENT_INPUT", `${request.id} does not bind ${ref.name}`);
      return bound;
    }
    const operation = operationIds.get(ref.operation);
    assert(operation !== undefined, "UNKNOWN_FRAGMENT_OPERATION", `Graph Fragment references ${ref.operation}`);
    return { kind: "operation-result", operation };
  };
  const operations: OperationNode[] = fragment.operations.map((operation) => {
    const id = operationIds.get(operation.id) as string;
    const record = hygienicId("record", request.id, operation.id);
    return {
      id,
      producer: operation.producer,
      inputs: Object.fromEntries(Object.entries(operation.inputs).map(([name, ref]) => [name, mapRef(ref)])),
      result: operation.result.kind === "output"
        ? { kind: "output", name: operation.result.name, record }
        : {
            kind: "need",
            name: operation.result.name,
            id: hygienicId("need", request.id, operation.id),
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
      root,
    };
  });
  const content = {
    format: "hypit.fragment-instance@1" as const,
    instance: request.id,
    inputs,
    operations,
    exports,
  };
  return { ...content, id: `fragment-instance:${request.id}` };
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
    assert(item.root.kind === "operation-result", "INVALID_FRAGMENT_EXPORT_ROOT", item.name);
    visit(item.root.operation);
  }
  return reachable;
}

function bindExports(
  instance: ElaboratedFragment,
  bindings: Readonly<Record<string, string>>,
): FragmentContribution {
  const available = exportMap(instance);
  exactKeys(bindings, instance.exports.map((item) => item.name), instance.instance);
  assert(Object.keys(bindings).length > 0, "EMPTY_FRAGMENT_BINDING", `${instance.instance} binds no exports`);
  const selected = Object.keys(bindings).map((name) => {
    const item = available.get(name);
    assert(item !== undefined, "UNKNOWN_FRAGMENT_EXPORT", `${instance.instance} has no export ${name}`);
    return item;
  });
  const outputs: LogicalOutput[] = selected.map((item) => {
    const output = bindings[item.name] as string;
    assert(output.length > 0, "EMPTY_LOGICAL_OUTPUT_ID", `${instance.instance}.${item.name} output is empty`);
    return { id: output, type: item.type, primary: item.root };
  });
  const reachable = reachableOperationIds(instance, selected);
  return {
    outputs,
    operations: instance.operations.filter((operation) => reachable.has(operation.id)),
  };
}

/** Bind all Fragment exports as new author-visible Logical Outputs. */
export function bindAuthorFragment(
  instance: ElaboratedFragment,
  outputs: Readonly<Record<string, string>>,
): FragmentContribution {
  return bindExports(instance, outputs);
}

/** Merge already elaborated contributions; final Graph validation remains Core's authority. */
export function mergeFragmentContributions(
  graph: Pick<AuthorGraph, "outputs" | "operations">,
  ...contributions: readonly FragmentContribution[]
): Pick<AuthorGraph, "outputs" | "operations"> {
  return {
    outputs: [...graph.outputs, ...contributions.flatMap((item) => item.outputs)],
    operations: [...graph.operations, ...contributions.flatMap((item) => item.operations)],
  };
}
