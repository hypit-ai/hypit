import { compareCodeUnits, moduleKey, sameType } from "@hypit/protocol";
import type {
  BlobRef,
  CanonicalValue,
  ModuleRef,
  TypeRef,
  TypedRecord,
  Value,
  ValueSchema,
} from "@hypit/protocol";
import type { SourceRange } from "@hypit/source";

import type {
  AuthorComponent,
  AuthorRealizationSelection,
  AuthorValueRef,
} from "./author.js";
import type {
  AuthorElementProvenanceDraft,
  AuthorInputProvenanceDraft,
  AuthorSourceAssetRequest,
  AuthorSourceExport,
  Awaitable,
  DecodedAuthorSource,
} from "./source.js";

export type AuthorDeclarationLiteral = {
  readonly kind: "literal";
  readonly value: string;
  readonly range?: SourceRange;
};

export type AuthorDeclarationReference = {
  readonly kind: "reference";
  readonly path: string;
  readonly range?: SourceRange;
};

export type AuthorDeclarationFieldValue = AuthorDeclarationLiteral | AuthorDeclarationReference;

export type AuthorDeclarationField = {
  readonly name: string;
  readonly value: AuthorDeclarationFieldValue;
};

/**
 * Exact order of direct structured content. Child indexes address `children`;
 * text remains syntax-neutral decoded content rather than a Frontend node.
 */
export type AuthorDeclarationBodyPart =
  | { readonly kind: "text"; readonly value: string; readonly range?: SourceRange }
  | { readonly kind: "child"; readonly index: number };

/**
 * A package-owned nested declaration. Its name and fields belong to the package,
 * not to the Frontend that happened to spell them.
 */
export type AuthorDeclarationChild = {
  readonly name: string;
  readonly fields: readonly AuthorDeclarationField[];
  readonly children: readonly AuthorDeclarationChild[];
  /** Present when direct text and child declarations have meaningful interleaving. */
  readonly body?: readonly AuthorDeclarationBodyPart[];
  readonly text?: string;
  /** Exact source span of an opaque or directly addressable text body. */
  readonly textRange?: SourceRange;
  readonly range?: SourceRange;
};

/** One syntax-neutral invocation of a package author capability. */
export type AuthorDeclaration = {
  readonly module: ModuleRef;
  readonly name: string;
  readonly fields: readonly AuthorDeclarationField[];
  readonly children: readonly AuthorDeclarationChild[];
  /** Present when direct text and child declarations have meaningful interleaving. */
  readonly body?: readonly AuthorDeclarationBodyPart[];
  readonly text?: string;
  /** Exact source span of an opaque or directly addressable text body. */
  readonly textRange?: SourceRange;
  readonly range: SourceRange;
};

export type AuthorDeclarationDraft = Omit<AuthorDeclaration, "range">;

export type AuthorDeclarationBodyNode =
  | { readonly kind: "text"; readonly value: string; readonly range?: SourceRange }
  | { readonly kind: "child"; readonly child: AuthorDeclarationChild };

/** Ordered direct content, with the indexed storage detail resolved for package compilers. */
export function declarationBody(
  declaration: Pick<AuthorDeclaration | AuthorDeclarationChild, "body" | "children" | "text" | "textRange">,
): readonly AuthorDeclarationBodyNode[] {
  if (declaration.body !== undefined) {
    return declaration.body.map((part) => part.kind === "text"
      ? part
      : { kind: "child" as const, child: declaration.children[part.index]! });
  }
  return [
    ...(declaration.text === undefined ? [] : [{ kind: "text" as const, value: declaration.text,
      ...(declaration.textRange === undefined ? {} : { range: declaration.textRange }) }]),
    ...declaration.children.map((child) => ({ kind: "child" as const, child })),
  ];
}

export type AuthorResolvedReference = {
  readonly path: string;
  readonly ref: AuthorValueRef;
  readonly type: TypeRef;
  /** Present only when the reference denotes an already-authored Record. */
  readonly record?: TypedRecord;
};

/**
 * A binding is declared before any declaration is compiled. This makes source
 * order irrelevant without inventing values for Component outputs.
 */
export type AuthorDeclarationBinding = {
  readonly name: string;
  readonly ref: AuthorValueRef;
  readonly type: TypeRef;
  readonly exported?: boolean;
};

export type AuthorRecordDraft = {
  readonly id: string;
  readonly type: TypeRef;
  readonly value: Value;
  readonly range: SourceRange;
};

export type AuthorComponentDraft = AuthorComponent & {
  readonly range: SourceRange;
};

export type AuthorRealizationSelectionDraft = AuthorRealizationSelection & {
  readonly range: SourceRange;
};

export type AuthorDeclarationOutput = {
  readonly records: readonly AuthorRecordDraft[];
  readonly components: readonly AuthorComponentDraft[];
  readonly realizations?: readonly AuthorRealizationSelectionDraft[];
};

export type AuthorDeclarationCompileContext = {
  readonly sourceName: string;
  readonly sourceId?: string;
  readonly declaration: AuthorDeclaration;
  readonly resolveReference: (path: string) => Awaitable<AuthorResolvedReference | undefined>;
  readonly resolveAsset: (request: AuthorSourceAssetRequest) => Awaitable<BlobRef>;
  readonly readAsset: (request: AuthorSourceAssetRequest) => Awaitable<Uint8Array>;
};

export type AuthorDeclarationBindingContext = {
  readonly sourceName: string;
  readonly sourceId?: string;
};

export type AuthorDeclarationFieldKind = "identifier" | "literal" | "reference" | "expression";

export type AuthorDeclarationFieldShape = {
  readonly name: string;
  readonly kind: AuthorDeclarationFieldKind;
  readonly required: boolean;
  readonly summary: string;
  readonly accepts?: readonly TypeRef[];
  readonly values?: readonly string[];
  readonly schema?: ValueSchema;
  readonly fallback?: CanonicalValue;
};

export type AuthorDeclarationChildShape = {
  readonly name: string;
  readonly cardinality: "one" | "optional" | "many";
  readonly summary: string;
  readonly fields: readonly AuthorDeclarationFieldShape[];
  readonly children?: AuthorDeclarationChildrenShape;
  readonly text?: string;
};

/**
 * Nested grammar can either be finite inline structure or a reference to a
 * declaration-local child group. Groups make recursive package grammars
 * expressible without teaching Author any domain-specific node names.
 */
export type AuthorDeclarationChildrenShape =
  | readonly AuthorDeclarationChildShape[]
  | { readonly group: string };

export type AuthorDeclarationShape = {
  readonly summary: string;
  readonly fields: readonly AuthorDeclarationFieldShape[];
  readonly children?: AuthorDeclarationChildrenShape;
  readonly childGroups?: Readonly<Record<string, readonly AuthorDeclarationChildShape[]>>;
  readonly text?: string;
};

/** Package-owned semantic compiler; it never receives a syntax tree. */
export type AuthorDeclarationCompiler = {
  readonly module: ModuleRef;
  readonly declaration: string;
  readonly outputs: readonly TypeRef[];
  readonly shape: AuthorDeclarationShape;
  readonly bindings: (
    declaration: AuthorDeclaration,
    context: AuthorDeclarationBindingContext,
  ) => readonly AuthorDeclarationBinding[];
  readonly compile: (context: AuthorDeclarationCompileContext) => Awaitable<AuthorDeclarationOutput>;
};

export interface AuthorDeclarationRegistryLike {
  resolve(module: ModuleRef, declaration: string): AuthorDeclarationCompiler | undefined;
}

function isChildGroup(
  children: AuthorDeclarationChildrenShape,
): children is { readonly group: string } {
  return !Array.isArray(children);
}

function compilerKey(module: ModuleRef, declaration: string): string {
  return `${moduleKey(module)}#${declaration}`;
}

function childShapeList(
  children: AuthorDeclarationChildrenShape | undefined,
  groups: Readonly<Record<string, readonly AuthorDeclarationChildShape[]>>,
  subject: string,
): readonly AuthorDeclarationChildShape[] {
  if (children === undefined) return [];
  if (!isChildGroup(children)) return children;
  const group = groups[children.group];
  if (group === undefined) throw new Error(`${subject} references unknown child group ${children.group}.`);
  return group;
}

function validateShapeList(
  fields: readonly AuthorDeclarationFieldShape[],
  children: AuthorDeclarationChildrenShape | undefined,
  groups: Readonly<Record<string, readonly AuthorDeclarationChildShape[]>>,
  subject: string,
  validatingGroups: Set<string>,
): void {
  const fieldNames = new Set<string>();
  for (const field of fields) {
    if (field.name.trim().length === 0 || field.summary.trim().length === 0 || fieldNames.has(field.name)) {
      throw new Error(`${subject} has an invalid or duplicate field shape.`);
    }
    fieldNames.add(field.name);
    if (field.accepts !== undefined && field.kind !== "reference" && field.kind !== "expression") {
      throw new Error(`${subject}.${field.name} cannot declare accepted Types for ${field.kind}.`);
    }
  }
  const childNames = new Set<string>();
  for (const child of childShapeList(children, groups, subject)) {
    if (child.name.trim().length === 0 || child.summary.trim().length === 0 || childNames.has(child.name)) {
      throw new Error(`${subject} has an invalid or duplicate child shape.`);
    }
    childNames.add(child.name);
    validateShapeList(child.fields, undefined, groups, `${subject}.${child.name}`, validatingGroups);
    if (child.children !== undefined && isChildGroup(child.children)) {
      const groupName = child.children.group;
      if (!validatingGroups.has(groupName)) {
        validatingGroups.add(groupName);
        validateShapeList([], child.children, groups, `${subject}.${child.name}`, validatingGroups);
        validatingGroups.delete(groupName);
      }
    } else {
      validateShapeList([], child.children, groups, `${subject}.${child.name}`, validatingGroups);
    }
  }
}

export class AuthorDeclarationRegistry implements AuthorDeclarationRegistryLike {
  readonly #compilers = new Map<string, AuthorDeclarationCompiler>();

  register(compiler: AuthorDeclarationCompiler): void {
    if (compiler.module.name.trim().length === 0 || compiler.module.version.trim().length === 0) {
      throw new Error("Author declaration module is invalid.");
    }
    if (compiler.declaration.trim().length === 0) throw new Error("Author declaration name is empty.");
    const key = compilerKey(compiler.module, compiler.declaration);
    if (this.#compilers.has(key)) throw new Error(`Author declaration ${key} is already registered.`);
    if (compiler.shape.summary.trim().length === 0) throw new Error(`Author declaration ${key} has no summary.`);
    const groups = compiler.shape.childGroups ?? {};
    for (const groupName of Object.keys(groups)) {
      if (groupName.trim().length === 0) throw new Error(`${key} has an empty child group name.`);
    }
    validateShapeList(compiler.shape.fields, compiler.shape.children, groups, key, new Set());
    for (const groupName of Object.keys(groups)) {
      validateShapeList([], { group: groupName }, groups, `${key}.${groupName}`, new Set([groupName]));
    }
    this.#compilers.set(key, compiler);
  }

  resolve(module: ModuleRef, declaration: string): AuthorDeclarationCompiler | undefined {
    return this.#compilers.get(compilerKey(module, declaration));
  }
}

export class AuthorDeclarationError extends Error {
  readonly code: string;
  readonly range?: SourceRange;

  constructor(code: string, message: string, range?: SourceRange) {
    super(message);
    this.name = "AuthorDeclarationError";
    this.code = code;
    if (range !== undefined) this.range = range;
  }
}

export type CompileAuthorDeclarationsOptions = {
  readonly sourceName: string;
  readonly sourceId?: string;
  readonly declarations: readonly AuthorDeclaration[];
  readonly registry: AuthorDeclarationRegistryLike;
  readonly resolveReference?: (path: string) => Awaitable<AuthorResolvedReference | undefined>;
  readonly resolveAsset: (request: AuthorSourceAssetRequest) => Awaitable<BlobRef>;
  readonly readAsset?: (request: AuthorSourceAssetRequest) => Awaitable<Uint8Array>;
};

type PreparedDeclaration = {
  readonly declaration: AuthorDeclaration;
  readonly compiler: AuthorDeclarationCompiler;
  readonly bindings: readonly AuthorDeclarationBinding[];
  readonly references: readonly ReferenceUse[];
};

type ReferenceUse = {
  readonly reference: AuthorDeclarationReference;
  readonly shape: AuthorDeclarationFieldShape;
};

type DeclarationLike = Pick<AuthorDeclaration, "fields" | "children" | "body" | "text" | "textRange" | "range">
  | AuthorDeclarationChild;

type DeclarationProvenanceGroup = {
  readonly range: SourceRange;
  readonly records: string[];
  readonly components: string[];
  readonly outputs: Array<{ readonly component: string; readonly name: string; readonly id: string }>;
  readonly inputs: AuthorInputProvenanceDraft[];
  realizations?: AuthorRealizationSelection[];
};

function rangeKey(range: SourceRange): string {
  return `${range.start}:${range.end}`;
}

function declarationProvenanceGroups(
  declaration: AuthorDeclaration,
  resolvedReferences: ReadonlyMap<string, AuthorResolvedReference>,
): Map<string, DeclarationProvenanceGroup> {
  const groups = new Map<string, DeclarationProvenanceGroup>();
  const visit = (node: DeclarationLike): void => {
    if (node.range === undefined) return;
    const key = rangeKey(node.range);
    const group = groups.get(key) ?? {
      range: { ...node.range },
      records: [],
      components: [],
      outputs: [],
      inputs: [],
    };
    for (const field of node.fields) {
      if (field.value.range === undefined) continue;
      const ref = field.value.kind === "reference"
        ? resolvedReferences.get(field.value.path)?.ref
        : undefined;
      group.inputs.push({
        name: field.name,
        range: { ...field.value.range },
        kind: field.value.kind,
        ...(ref === undefined ? {} : { ref }),
      });
    }
    groups.set(key, group);
    for (const child of node.children) visit(child);
  };
  visit(declaration);
  return groups;
}

function validateDeclarationStructure(
  declaration: DeclarationLike,
  fields: readonly AuthorDeclarationFieldShape[],
  children: AuthorDeclarationChildrenShape | undefined,
  groups: Readonly<Record<string, readonly AuthorDeclarationChildShape[]>>,
  text: string | undefined,
  subject: string,
): ReferenceUse[] {
  const range = declaration.range;
  const byName = new Map(fields.map((field) => [field.name, field]));
  const seen = new Set<string>();
  const references: ReferenceUse[] = [];
  for (const field of declaration.fields) {
    if (seen.has(field.name)) {
      throw new AuthorDeclarationError("AUTHOR_DECLARATION_FIELD_DUPLICATE", `${subject} repeats field ${field.name}.`, range);
    }
    seen.add(field.name);
    const shape = byName.get(field.name);
    if (shape === undefined) {
      throw new AuthorDeclarationError("AUTHOR_DECLARATION_FIELD_UNKNOWN", `${subject} does not declare field ${field.name}.`, range);
    }
    if (shape.kind === "reference" && field.value.kind !== "reference") {
      throw new AuthorDeclarationError("AUTHOR_DECLARATION_FIELD_KIND", `${subject}.${field.name} must be a reference.`, field.value.range ?? range);
    }
    if ((shape.kind === "identifier" || shape.kind === "literal") && field.value.kind !== "literal") {
      throw new AuthorDeclarationError("AUTHOR_DECLARATION_FIELD_KIND", `${subject}.${field.name} must be literal.`, field.value.range ?? range);
    }
    if (field.value.kind === "literal" && shape.values !== undefined && !shape.values.includes(field.value.value)) {
      throw new AuthorDeclarationError("AUTHOR_DECLARATION_FIELD_VALUE", `${subject}.${field.name} has an unsupported value.`, field.value.range ?? range);
    }
    if (field.value.kind === "reference") references.push({ reference: field.value, shape });
  }
  const missing = fields.find((field) => field.required && !seen.has(field.name));
  if (missing !== undefined) {
    throw new AuthorDeclarationError("AUTHOR_DECLARATION_FIELD_REQUIRED", `${subject} requires field ${missing.name}.`, range);
  }
  const resolvedChildren = childShapeList(children, groups, subject);
  const childShapes = new Map(resolvedChildren.map((child) => [child.name, child]));
  const childCounts = new Map<string, number>();
  for (const child of declaration.children) {
    const shape = childShapes.get(child.name);
    if (shape === undefined) {
      throw new AuthorDeclarationError("AUTHOR_DECLARATION_CHILD_UNKNOWN", `${subject} does not declare child ${child.name}.`, child.range ?? range);
    }
    childCounts.set(child.name, (childCounts.get(child.name) ?? 0) + 1);
    references.push(...validateDeclarationStructure(
      child,
      shape.fields,
      shape.children,
      groups,
      shape.text,
      `${subject}.${child.name}`,
    ));
  }
  for (const child of resolvedChildren) {
    const count = childCounts.get(child.name) ?? 0;
    if ((child.cardinality === "one" && count !== 1) || (child.cardinality === "optional" && count > 1)) {
      throw new AuthorDeclarationError(
        "AUTHOR_DECLARATION_CHILD_CARDINALITY",
        `${subject}.${child.name} has invalid cardinality.`,
        range,
      );
    }
  }
  if (declaration.body !== undefined && declaration.text !== undefined) {
    throw new AuthorDeclarationError("AUTHOR_DECLARATION_BODY", `${subject} cannot carry both ordered body and aggregate text.`, range);
  }
  if (declaration.body !== undefined) {
    const childIndexes = new Set<number>();
    for (const part of declaration.body) {
      if (part.kind === "child") {
        if (!Number.isSafeInteger(part.index) || part.index < 0 || part.index >= declaration.children.length
          || childIndexes.has(part.index)) {
          throw new AuthorDeclarationError("AUTHOR_DECLARATION_BODY", `${subject} has an invalid ordered child.`, range);
        }
        childIndexes.add(part.index);
        continue;
      }
      if (text === undefined && part.value.trim().length > 0) {
        throw new AuthorDeclarationError("AUTHOR_DECLARATION_TEXT", `${subject} does not accept text.`, part.range ?? range);
      }
      if (part.range !== undefined) {
        if (range === undefined) {
          throw new AuthorDeclarationError("AUTHOR_DECLARATION_RANGE", `${subject} body text has no containing source range.`);
        }
        assertRange(range, part.range, `${subject} body text`);
      }
    }
    if (childIndexes.size !== declaration.children.length) {
      throw new AuthorDeclarationError("AUTHOR_DECLARATION_BODY", `${subject} ordered body must include every direct child once.`, range);
    }
  } else if (text === undefined && declaration.text !== undefined && declaration.text.trim().length > 0) {
    throw new AuthorDeclarationError("AUTHOR_DECLARATION_TEXT", `${subject} does not accept text.`, range);
  }
  if (declaration.textRange !== undefined) {
    if (range === undefined) {
      throw new AuthorDeclarationError("AUTHOR_DECLARATION_RANGE", `${subject} text has no containing source range.`);
    }
    assertRange(range, declaration.textRange, `${subject} text`);
  }
  return references;
}

function assertRange(parent: SourceRange, range: SourceRange, subject: string): void {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)
    || range.start < parent.start || range.end < range.start || range.end > parent.end) {
    throw new AuthorDeclarationError("AUTHOR_DECLARATION_RANGE", `${subject} returned an invalid source range.`, parent);
  }
}

function validateBinding(binding: AuthorDeclarationBinding, declaration: AuthorDeclaration): void {
  if (binding.name.trim().length === 0) {
    throw new AuthorDeclarationError("AUTHOR_DECLARATION_BINDING", "Author declaration binding is empty.", declaration.range);
  }
  if (binding.ref.kind === "record" && binding.ref.id !== binding.name) {
    throw new AuthorDeclarationError(
      "AUTHOR_DECLARATION_BINDING",
      `Record binding ${binding.name} must address Record ${binding.name}.`,
      declaration.range,
    );
  }
}

/**
 * Compile a complete declaration set in two phases: first declare every local
 * binding, then compile in explicit reference order. Source order has no
 * semantic effect.
 */
export async function compileAuthorDeclarations(
  options: CompileAuthorDeclarationsOptions,
): Promise<DecodedAuthorSource> {
  const prepared: PreparedDeclaration[] = options.declarations.map((declaration) => {
    const compiler = options.registry.resolve(declaration.module, declaration.name);
    if (compiler === undefined) {
      throw new AuthorDeclarationError(
        "AUTHOR_DECLARATION_UNKNOWN",
        `No compiler is registered for ${compilerKey(declaration.module, declaration.name)}.`,
        declaration.range,
      );
    }
    const references = validateDeclarationStructure(
      declaration,
      compiler.shape.fields,
      compiler.shape.children,
      compiler.shape.childGroups ?? {},
      compiler.shape.text,
      `${moduleKey(declaration.module)}#${declaration.name}`,
    );
    const bindings = compiler.bindings(declaration, {
      sourceName: options.sourceName,
      ...(options.sourceId === undefined ? {} : { sourceId: options.sourceId }),
    });
    for (const binding of bindings) validateBinding(binding, declaration);
    return { declaration, compiler, bindings, references };
  });

  const localBindings = new Map<string, { readonly owner: number; readonly binding: AuthorDeclarationBinding }>();
  for (const [owner, item] of prepared.entries()) {
    for (const binding of item.bindings) {
      if (localBindings.has(binding.name)) {
        throw new AuthorDeclarationError(
          "AUTHOR_DECLARATION_BINDING_DUPLICATE",
          `Duplicate authored binding ${binding.name}.`,
          item.declaration.range,
        );
      }
      localBindings.set(binding.name, { owner, binding });
    }
  }

  const order: number[] = [];
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (index: number): void => {
    if (visited.has(index)) return;
    if (visiting.has(index)) {
      throw new AuthorDeclarationError(
        "AUTHOR_DECLARATION_CYCLE",
        "Author declarations contain a reference cycle.",
        prepared[index]!.declaration.range,
      );
    }
    visiting.add(index);
    for (const { reference } of prepared[index]!.references) {
      const dependency = localBindings.get(reference.path);
      if (dependency !== undefined) visit(dependency.owner);
    }
    visiting.delete(index);
    visited.add(index);
    order.push(index);
  };
  for (const index of prepared.keys()) visit(index);

  const records: TypedRecord[] = [];
  const recordsById = new Map<string, TypedRecord>();
  const components: AuthorComponent[] = [];
  const componentIds = new Set<string>();
  const componentsById = new Map<string, AuthorComponent>();
  const realizations: AuthorRealizationSelection[] = [];
  const provenance: AuthorElementProvenanceDraft[] = [];
  const resolvedReferences = new Map<string, AuthorResolvedReference>();
  const externalReferences = new Map<string, AuthorResolvedReference | null>();

  for (const index of order) {
    const item = prepared[index]!;
    const resolveReference = async (path: string): Promise<AuthorResolvedReference | undefined> => {
      const local = localBindings.get(path);
      if (local !== undefined) {
        const record = local.binding.ref.kind === "record"
          ? recordsById.get(local.binding.ref.id)
          : undefined;
        const result: AuthorResolvedReference = {
          path,
          ref: local.binding.ref,
          type: local.binding.type,
          ...(record === undefined ? {} : { record: structuredClone(record) }),
        };
        resolvedReferences.set(path, result);
        return result;
      }
      const retained = externalReferences.get(path);
      if (retained !== undefined) return retained === null ? undefined : retained;
      const result = await options.resolveReference?.(path);
      externalReferences.set(path, result ?? null);
      if (result !== undefined) resolvedReferences.set(path, result);
      return result;
    };
    for (const { reference, shape } of item.references) {
      const resolved = await resolveReference(reference.path);
      if (resolved === undefined) {
        throw new AuthorDeclarationError(
          "AUTHOR_DECLARATION_REFERENCE_UNKNOWN",
          `Unknown author reference ${reference.path}.`,
          reference.range ?? item.declaration.range,
        );
      }
      if (shape.accepts !== undefined && !shape.accepts.some((type) => sameType(type, resolved.type))) {
        throw new AuthorDeclarationError(
          "AUTHOR_DECLARATION_REFERENCE_TYPE",
          `Author reference ${reference.path} has the wrong Type for ${shape.name}.`,
          reference.range ?? item.declaration.range,
        );
      }
    }
    const output = await item.compiler.compile({
      sourceName: options.sourceName,
      ...(options.sourceId === undefined ? {} : { sourceId: options.sourceId }),
      declaration: item.declaration,
      resolveReference,
      resolveAsset: options.resolveAsset,
      readAsset: options.readAsset ?? (() => {
        throw new AuthorDeclarationError(
          "AUTHOR_DECLARATION_ASSET_READER_MISSING",
          `${compilerKey(item.compiler.module, item.compiler.declaration)} requires readable author input.`,
          item.declaration.range,
        );
      }),
    });
    for (const draft of output.records) {
      assertRange(item.declaration.range, draft.range, `${compilerKey(item.compiler.module, item.compiler.declaration)} Record`);
      if (recordsById.has(draft.id)) {
        throw new AuthorDeclarationError("AUTHOR_DECLARATION_RECORD_DUPLICATE", `Duplicate authored Record ${draft.id}.`, draft.range);
      }
      if (!item.compiler.outputs.some((type) => sameType(type, draft.type))) {
        throw new AuthorDeclarationError(
          "AUTHOR_DECLARATION_OUTPUT_TYPE",
          `${compilerKey(item.compiler.module, item.compiler.declaration)} returned undeclared Type ${moduleKey(draft.type.module)}#${draft.type.name}.`,
          draft.range,
        );
      }
      const record: TypedRecord = { id: draft.id, type: draft.type, value: draft.value };
      records.push(record);
      recordsById.set(record.id, record);
    }
    for (const draft of output.components) {
      assertRange(item.declaration.range, draft.range, `${compilerKey(item.compiler.module, item.compiler.declaration)} Component`);
      if (draft.id.trim().length === 0 || componentIds.has(draft.id)) {
        throw new AuthorDeclarationError(
          "AUTHOR_DECLARATION_COMPONENT_DUPLICATE",
          `Duplicate or empty authored Component ${draft.id}.`,
          draft.range,
        );
      }
      componentIds.add(draft.id);
      for (const outputName of Object.keys(draft.outputs)) {
        const output = draft.fragment.exports.find((candidate) => candidate.name === outputName);
        if (output === undefined) {
          throw new AuthorDeclarationError(
            "AUTHOR_DECLARATION_COMPONENT_OUTPUT",
            `Component ${draft.id} binds unknown Fragment output ${outputName}.`,
            draft.range,
          );
        }
        if (!item.compiler.outputs.some((type) => sameType(type, output.type))) {
          throw new AuthorDeclarationError(
            "AUTHOR_DECLARATION_OUTPUT_TYPE",
            `${compilerKey(item.compiler.module, item.compiler.declaration)} returned undeclared Type ${moduleKey(output.type.module)}#${output.type.name}.`,
            draft.range,
          );
        }
      }
      const component = { id: draft.id, fragment: draft.fragment, inputs: draft.inputs, outputs: draft.outputs };
      components.push(component);
      componentsById.set(component.id, component);
    }
    for (const realization of output.realizations ?? []) {
      assertRange(
        item.declaration.range,
        realization.range,
        compilerKey(item.compiler.module, item.compiler.declaration) + " Realization",
      );
      realizations.push({
        output: { ...realization.output },
        record: { ...realization.record },
      });
    }
    const groups = declarationProvenanceGroups(item.declaration, resolvedReferences);
    const groupFor = (range: SourceRange): DeclarationProvenanceGroup => {
      const key = rangeKey(range);
      const group = groups.get(key) ?? {
        range: { ...range }, records: [], components: [], outputs: [], inputs: [],
      };
      groups.set(key, group);
      return group;
    };
    for (const record of output.records) groupFor(record.range).records.push(record.id);
    for (const component of output.components) {
      const group = groupFor(component.range);
      group.components.push(component.id);
      group.outputs.push(...Object.entries(component.outputs).map(([name, id]) => ({
        component: component.id,
        name,
        id,
      })));
    }
    for (const realization of output.realizations ?? []) {
      const group = groupFor(realization.range);
      (group.realizations ??= []).push({
        output: { ...realization.output },
        record: { ...realization.record },
      });
    }
    provenance.push(...groups.values());
  }

  const exports: AuthorSourceExport[] = [];
  for (const item of prepared) {
    for (const binding of item.bindings) {
      if (binding.ref.kind === "record") {
        const record = recordsById.get(binding.ref.id);
        if (record === undefined || !sameType(record.type, binding.type)) {
          throw new AuthorDeclarationError(
            "AUTHOR_DECLARATION_BINDING_OUTPUT",
            `Binding ${binding.name} does not match an authored Record.`,
            item.declaration.range,
          );
        }
      } else {
        const ref = binding.ref;
        const component = componentsById.get(ref.component);
        const output = component?.fragment.exports.find((candidate) => candidate.name === ref.output);
        if (component === undefined || output === undefined
          || component.outputs[ref.output] !== binding.name || !sameType(output.type, binding.type)) {
          throw new AuthorDeclarationError(
            "AUTHOR_DECLARATION_BINDING_OUTPUT",
            `Binding ${binding.name} does not match an authored Component output.`,
            item.declaration.range,
          );
        }
      }
      if (binding.exported === false) continue;
      exports.push({ name: binding.name, ref: binding.ref, type: binding.type });
    }
  }
  return {
    records,
    components,
    realizations,
    exports: exports.sort((left, right) => compareCodeUnits(left.name, right.name)),
    provenance,
  };
}

export function declarationField(
  declaration: AuthorDeclaration | AuthorDeclarationChild,
  name: string,
): AuthorDeclarationFieldValue | undefined {
  return declaration.fields.find((field) => field.name === name)?.value;
}
