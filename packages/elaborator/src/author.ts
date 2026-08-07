import {
  digestOf,
  isDigest,
  sealCompiledGraph,
  verifyCompiledGraph,
} from "@narratage/core";
import type {
  CompiledGraph,
  Digest,
  GraphValueRef,
  LinkedProgram,
  TypeRef,
} from "@narratage/protocol";

import {
  bindAuthorFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
  verifyGraphFragment,
} from "./fragment.js";
import type {
  FragmentContribution,
  GraphFragment,
} from "./fragment.js";

/** A reference to an authored fact that already exists in the Linked Program. */
export type AuthorRecordRef = {
  readonly kind: "record";
  readonly id: string;
};

/** A symbolic reference to one public export of another component instance. */
export type AuthorComponentOutputRef = {
  readonly kind: "component-output";
  readonly component: string;
  readonly output: string;
};

export type AuthorValueRef = AuthorRecordRef | AuthorComponentOutputRef;

/**
 * One author-visible component call. The Fragment is locked by digest; its implementation remains
 * declarative data. `outputs` binds every public Fragment export to a Logical Output identity.
 */
export type AuthorComponent = {
  readonly id: string;
  readonly fragment: Digest;
  readonly inputs: Readonly<Record<string, AuthorValueRef>>;
  readonly outputs: Readonly<Record<string, string>>;
};

/**
 * Parser-independent author intent collected before references are resolved.
 * Component declaration order has no semantic meaning, so forward references are valid.
 */
export type AuthorModule = {
  readonly format: "svml.author-module@1";
  readonly id: Digest;
  readonly name: string;
  readonly components: readonly AuthorComponent[];
};

export type AuthorOutputBinding = {
  readonly component: string;
  readonly output: string;
  readonly id: string;
  readonly type: TypeRef;
};

export type AuthorElaboration = {
  readonly format: "svml.author-elaboration@1";
  readonly author: Digest;
  readonly graph: CompiledGraph;
  readonly outputs: readonly AuthorOutputBinding[];
};

/** Resolve a locked Graph Fragment without executing package code. */
export type GraphFragmentResolver = (id: Digest) => GraphFragment | undefined;

export class AuthorModuleError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "AuthorModuleError";
    this.code = code;
    this.subject = subject;
  }
}

function assert(
  condition: unknown,
  code: string,
  message: string,
  subject?: string,
): asserts condition {
  if (!condition) throw new AuthorModuleError(code, message, subject);
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
    "AUTHOR_PORT_BINDING_MISMATCH",
    `${subject} binds [${left.join(", ")}] but declares [${right.join(", ")}]`,
    subject,
  );
}

function normalizeRef(ref: AuthorValueRef): AuthorValueRef {
  if (ref.kind === "record") return { kind: "record", id: ref.id };
  assert(
    ref.kind === "component-output",
    "INVALID_AUTHOR_REFERENCE",
    "Author inputs must reference a record or a component output",
  );
  return {
    kind: "component-output",
    component: ref.component,
    output: ref.output,
  };
}

function normalizeComponent(component: AuthorComponent): AuthorComponent {
  return {
    id: component.id,
    fragment: component.fragment,
    inputs: Object.fromEntries(
      Object.entries(component.inputs)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, ref]) => [name, normalizeRef(ref)]),
    ),
    outputs: Object.fromEntries(
      Object.entries(component.outputs).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function authorModuleContent(module: AuthorModule): Omit<AuthorModule, "id"> {
  return {
    format: "svml.author-module@1",
    name: module.name,
    components: [...module.components]
      .map(normalizeComponent)
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function sealAuthorModule(
  module: Omit<AuthorModule, "format" | "id">,
): AuthorModule {
  const draft = {
    format: "svml.author-module@1" as const,
    id: digestOf("unsealed-author-module"),
    ...module,
  };
  const content = authorModuleContent(draft);
  return { ...content, id: digestOf(content) };
}

type CollectedComponent = {
  readonly declaration: AuthorComponent;
  readonly fragment: GraphFragment;
};

type CollectedAuthorModule = {
  readonly components: ReadonlyMap<string, CollectedComponent>;
  readonly outputs: ReadonlyMap<string, AuthorOutputBinding>;
  readonly ordered: readonly CollectedComponent[];
};

function outputKey(component: string, output: string): string {
  return `${component}\u0000${output}`;
}

/** Phase one: lock every component and predeclare every public output before resolving any input. */
function collectAuthorModule(
  program: LinkedProgram,
  module: AuthorModule,
  resolveFragment: GraphFragmentResolver,
): CollectedAuthorModule {
  assert(module.format === "svml.author-module@1", "UNSUPPORTED_AUTHOR_MODULE", "unsupported Author Module format");
  assert(isDigest(module.id), "INVALID_AUTHOR_MODULE_DIGEST", "Author Module id is not a digest");
  assert(
    module.id === digestOf(authorModuleContent(module)),
    "AUTHOR_MODULE_DIGEST_MISMATCH",
    "Author Module digest differs",
  );
  assert(module.name.length > 0, "EMPTY_AUTHOR_MODULE_NAME", "Author Module name is empty");

  const components = new Map<string, CollectedComponent>();
  const outputs = new Map<string, AuthorOutputBinding>();
  const outputIds = new Set<string>();

  for (const declaration of module.components) {
    assert(declaration.id.length > 0, "EMPTY_AUTHOR_COMPONENT_ID", "Author component id is empty");
    assert(
      !components.has(declaration.id),
      "DUPLICATE_AUTHOR_COMPONENT",
      `${module.name} repeats component ${declaration.id}`,
      declaration.id,
    );
    assert(isDigest(declaration.fragment), "INVALID_FRAGMENT_DIGEST", `${declaration.id} Fragment digest is invalid`);
    const fragment = resolveFragment(declaration.fragment);
    assert(
      fragment !== undefined,
      "UNKNOWN_GRAPH_FRAGMENT",
      `${declaration.id} references unavailable Fragment ${declaration.fragment}`,
      declaration.id,
    );
    assert(
      fragment.id === declaration.fragment,
      "FRAGMENT_RESOLUTION_MISMATCH",
      `${declaration.id} resolved a different Fragment`,
      declaration.id,
    );
    verifyGraphFragment(program, fragment);
    exactKeys(declaration.inputs, fragment.inputs.map((input) => input.name), declaration.id);
    exactKeys(declaration.outputs, fragment.exports.map((item) => item.name), declaration.id);
    const collected = { declaration, fragment };
    components.set(declaration.id, collected);

    for (const item of fragment.exports) {
      const id = declaration.outputs[item.name] as string;
      assert(id.length > 0, "EMPTY_LOGICAL_OUTPUT_ID", `${declaration.id}.${item.name} output is empty`);
      assert(
        !outputIds.has(id),
        "DUPLICATE_LOGICAL_OUTPUT_ID",
        `${module.name} binds Logical Output ${id} more than once`,
        id,
      );
      outputIds.add(id);
      outputs.set(outputKey(declaration.id, item.name), {
        component: declaration.id,
        output: item.name,
        id,
        type: item.type,
      });
    }
  }
  return {
    components,
    outputs,
    ordered: [...components.values()].sort((left, right) =>
      left.declaration.id.localeCompare(right.declaration.id)),
  };
}

/** Phase two: resolve symbolic references, reject cycles/types errors, then elaborate ordinary Core data. */
export function elaborateAuthorModule(
  program: LinkedProgram,
  module: AuthorModule,
  resolveFragment: GraphFragmentResolver,
): AuthorElaboration {
  const collected = collectAuthorModule(program, module, resolveFragment);
  const records = new Map(program.records.map((record) => [record.id, record]));
  const visiting: string[] = [];
  const visited = new Set<string>();
  const ordered: CollectedComponent[] = [];

  const visit = (component: CollectedComponent): void => {
    const id = component.declaration.id;
    if (visited.has(id)) return;
    const cycleStart = visiting.indexOf(id);
    assert(
      cycleStart === -1,
      "AUTHOR_COMPONENT_CYCLE",
      `Author components cycle through ${[...visiting.slice(cycleStart), id].join(" -> ")}`,
      id,
    );
    visiting.push(id);
    for (const ref of Object.values(component.declaration.inputs)) {
      if (ref.kind !== "component-output") continue;
      const dependency = collected.components.get(ref.component);
      assert(
        dependency !== undefined,
        "UNKNOWN_AUTHOR_COMPONENT",
        `${id} references unknown component ${ref.component}`,
        id,
      );
      visit(dependency);
    }
    visiting.pop();
    visited.add(id);
    ordered.push(component);
  };
  collected.ordered.forEach(visit);

  const contributions: FragmentContribution[] = [];
  for (const component of ordered) {
    const inputs: Record<string, GraphValueRef> = {};
    for (const input of component.fragment.inputs) {
      const ref = component.declaration.inputs[input.name] as AuthorValueRef;
      if (ref.kind === "record") {
        const record = records.get(ref.id);
        assert(
          record !== undefined,
          "UNKNOWN_AUTHOR_RECORD",
          `${component.declaration.id}.${input.name} references unknown record ${ref.id}`,
          component.declaration.id,
        );
        assert(
          sameType(record.type, input.type),
          "AUTHOR_INPUT_TYPE_MISMATCH",
          `${component.declaration.id}.${input.name} wants ${typeName(input.type)} but receives ${typeName(record.type)}`,
          component.declaration.id,
        );
        inputs[input.name] = { kind: "record", id: record.id };
        continue;
      }
      const binding = collected.outputs.get(outputKey(ref.component, ref.output));
      assert(
        binding !== undefined,
        "UNKNOWN_AUTHOR_OUTPUT",
        `${component.declaration.id}.${input.name} references unknown output ${ref.component}.${ref.output}`,
        component.declaration.id,
      );
      assert(
        sameType(binding.type, input.type),
        "AUTHOR_INPUT_TYPE_MISMATCH",
        `${component.declaration.id}.${input.name} wants ${typeName(input.type)} but receives ${typeName(binding.type)}`,
        component.declaration.id,
      );
      inputs[input.name] = { kind: "logical-output", id: binding.id };
    }
    const instance = elaborateGraphFragment(program, component.fragment, {
      id: component.declaration.id,
      fragment: component.fragment.id,
      inputs,
    });
    contributions.push(bindAuthorFragment(instance, component.declaration.outputs));
  }

  const merged = mergeFragmentContributions(
    { outputs: [], candidates: [], operations: [] },
    ...contributions,
  );
  const graph = sealCompiledGraph({ program: program.semanticDigest, ...merged });
  verifyCompiledGraph(program, graph);
  return {
    format: "svml.author-elaboration@1",
    author: module.id,
    graph,
    outputs: [...collected.outputs.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
}
