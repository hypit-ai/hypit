import type { Facet } from "@hypit/facet";
import { canonicalize, isModuleRef, isTypeRef, sameType } from "@hypit/protocol";
import type { CanonicalValue } from "@hypit/protocol";

import type {
  GenerationComponentRef,
  GenerationGraphInspectionHost,
  GenerationGraphInput,
  GenerationGraphNode,
  GenerationGraphProject,
  GenerationNodeAssetHost,
  GenerationOperationNodeImplementation,
} from "./types.js";
import {
  assertGenerationNodeAuthoringShape,
  type GenerationNodeAuthoringHost,
  type GenerationNodeAuthoringShape,
} from "./authoring.js";

export const generationNodePackageFacetAbi = "hypit.generation-node-package@1";

export type GenerationOperationNodeCompileContext = {
  readonly node: GenerationGraphNode;
  readonly project: GenerationGraphProject;
};

export type GenerationCompiledOperationNode = {
  readonly fragment: import("@hypit/author").GraphFragment;
  readonly inputs: Readonly<Record<string, GenerationGraphInput>>;
};

export type GenerationResolvedOperationNode =
  | {
      readonly kind: "incomplete";
      /** Every authored input understood by this exact declaration. */
      readonly consumedInputs: readonly string[];
      readonly missing: readonly string[];
    }
  | {
      readonly kind: "ready";
      /** Every authored input understood by this exact declaration. */
      readonly consumedInputs: readonly string[];
      readonly compiled: GenerationCompiledOperationNode;
    };

/**
 * A package may expose a fixed Fragment, or compile its own concise authored
 * inputs into one exact Fragment and binding map. Core never learns model fields.
 */
export type GenerationOperationNodeDeclaration =
  | (Omit<GenerationOperationNodeImplementation, "executionPackage" | "inputs"> & {
      readonly authoring?: GenerationNodeAuthoringShape;
    })
  | {
      readonly kind: "operation";
      readonly using: GenerationComponentRef;
      /** Stable result Type used by draft inspection and selected-result substitution. */
      readonly output: import("@hypit/protocol").TypeRef;
      readonly authoring?: GenerationNodeAuthoringShape;
      /** One package-owned path validates supplied facts and compiles a complete invocation. */
      readonly resolve: (context: GenerationOperationNodeCompileContext) =>
        import("./types.js").Awaitable<GenerationResolvedOperationNode>;
    };

export type GenerationValueNodeLoadContext = {
  readonly node: GenerationGraphNode;
  readonly project: GenerationGraphProject;
  readonly inputs: Readonly<Record<string, CanonicalValue>>;
  readonly resolveAsset: GenerationNodeAssetHost["resolveAsset"];
  readonly readAsset: GenerationNodeAssetHost["readAsset"];
};

export type GenerationValueNodeDeclaration = {
  readonly kind: "value";
  readonly using: GenerationComponentRef;
  readonly inputs: readonly string[];
  readonly type: import("@hypit/protocol").TypeRef;
  readonly authoring?: GenerationNodeAuthoringShape;
  readonly load: (context: GenerationValueNodeLoadContext) =>
    import("./types.js").Awaitable<CanonicalValue>;
};

export type GenerationNodeDeclaration =
  | GenerationOperationNodeDeclaration
  | GenerationValueNodeDeclaration;

export type GenerationNodePackage = {
  readonly nodes: readonly GenerationNodeDeclaration[];
};

export type GenerationNodePackageFacet = Facet & {
  readonly abi: typeof generationNodePackageFacetAbi;
  readonly implementation: GenerationNodePackage;
};

export type InstalledGenerationNodePackage = {
  readonly specifier: string;
  readonly implementation: GenerationNodePackage;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function generationComponentKey(component: GenerationComponentRef): string {
  assert(isModuleRef(component.module), "Generation Node component Module is invalid.");
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(component.name),
    "Generation Node component name is invalid.");
  return JSON.stringify([component.module.name, component.module.version, component.name]);
}

function assertPackage(value: GenerationNodePackage): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "Generation Node package must be an object.");
  assert(Array.isArray(value.nodes), "Generation Node package nodes must be an array.");
  const keys = new Set<string>();
  for (const node of value.nodes) {
    const key = generationComponentKey(node.using);
    assert(!keys.has(key), `Generation Node package repeats ${key}.`);
    if (node.kind === "operation") {
      const hasFragment = "fragment" in node;
      const hasResolver = "resolve" in node;
      assert(hasFragment !== hasResolver,
        `Generation Operation Node ${key} must declare exactly one of fragment or resolve.`);
      if (hasFragment) {
        assert(node.fragment?.format === "hypit.fragment@1", `Generation Node ${key} has no Graph Fragment.`);
      } else {
        assert(isTypeRef(node.output), `Generation Node ${key} output Type is invalid.`);
        assert(typeof node.resolve === "function", `Generation Node ${key} resolver is not callable.`);
      }
    } else {
      assert(node.kind === "value", `Generation Node ${key} kind is invalid.`);
      assert(isTypeRef(node.type), `Generation Value Node ${key} Type is invalid.`);
      assert(Array.isArray(node.inputs), `Generation Value Node ${key} inputs are invalid.`);
      const names = new Set<string>();
      for (const name of node.inputs) {
        assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(name),
          `Generation Value Node ${key} input name is invalid.`);
        assert(!names.has(name), `Generation Value Node ${key} repeats input ${name}.`);
        names.add(name);
      }
      assert(typeof node.load === "function", `Generation Value Node ${key} loader is not callable.`);
    }
    keys.add(key);
  }
}

export function createGenerationNodePackageFacet(
  value: GenerationNodePackage,
): GenerationNodePackageFacet {
  assertPackage(value);
  return { abi: generationNodePackageFacetAbi, implementation: value };
}

export function generationNodePackagesFromFacets(
  facets: readonly Facet[],
): readonly GenerationNodePackage[] {
  return facets.flatMap((facet) => facet.abi === generationNodePackageFacetAbi
    ? [(facet as GenerationNodePackageFacet).implementation]
    : []);
}

/** Assemble only installed package implementations. Missing and duplicate components fail exactly. */
export function createGenerationGraphLoweringHost(
  packages: readonly InstalledGenerationNodePackage[],
  assets?: GenerationNodeAssetHost,
): GenerationGraphInspectionHost & GenerationNodeAuthoringHost {
  const declarations = new Map<string, {
    readonly declaration: GenerationNodeDeclaration;
    readonly specifier: string;
  }>();
  for (const installed of packages) {
    assert(installed.specifier.trim().length > 0, "Generation Node package specifier is empty.");
    assertPackage(installed.implementation);
    for (const node of installed.implementation.nodes) {
      const key = generationComponentKey(node.using);
      assert(!declarations.has(key), `Generation Graph Host has multiple implementations for ${key}.`);
      declarations.set(key, { declaration: node, specifier: installed.specifier });
      if (node.authoring !== undefined) {
        assertGenerationNodeAuthoringShape(node.authoring);
        assert(generationComponentKey(node.authoring.using) === key,
          `Generation Node ${key} authoring shape belongs to another component.`);
        const output = node.kind === "value" ? node.type
          : "output" in node ? node.output
          : node.fragment.exports[0]?.type;
        assert(output !== undefined && sameType(node.authoring.output.type, output),
          `Generation Node ${key} authoring output differs from its declaration.`);
      }
    }
  }
  const inspect = async (
    node: GenerationGraphNode,
    project: GenerationGraphProject,
  ): Promise<{
    readonly inspection: import("./types.js").GenerationGraphNodeInspection;
    readonly declaration: GenerationNodeDeclaration;
    readonly specifier: string;
    readonly compiled?: GenerationCompiledOperationNode;
  }> => {
      const key = generationComponentKey(node.using);
      const installed = declarations.get(key);
      if (installed === undefined) throw new Error(`Generation Node ${key} is not installed.`);
      const declaration = installed.declaration;
      if (declaration.kind === "operation") {
        if ("resolve" in declaration) {
          const resolved = await declaration.resolve({ node, project });
          assert(resolved !== null && typeof resolved === "object",
            `Generation Operation Node ${node.id} resolved no authoring state.`);
          const consumed = [...resolved.consumedInputs];
          assert(new Set(consumed).size === consumed.length,
            `Generation Operation Node ${node.id} repeats a consumed input.`);
          const actual = Object.keys(node.inputs).sort();
          assert(JSON.stringify([...consumed].sort()) === JSON.stringify(actual),
            `Generation Operation Node ${node.id} consumed [${[...consumed].sort().join(", ")}] but authored [${actual.join(", ")}].`);
          if (resolved.kind === "incomplete") {
            assert(Array.isArray(resolved.missing) && resolved.missing.length > 0,
              `Generation Operation Node ${node.id} is incomplete without missing inputs.`);
            assert(resolved.missing.every((name) => typeof name === "string" && name.trim().length > 0),
              `Generation Operation Node ${node.id} has an invalid missing input.`);
            return {
              declaration,
              specifier: installed.specifier,
              inspection: {
                node: node.id,
                kind: "operation",
                readiness: "incomplete",
                output: declaration.output,
                missing: [...resolved.missing],
              },
            };
          }
          assert(resolved.kind === "ready", `Generation Operation Node ${node.id} resolved an invalid state.`);
          const compiled = resolved.compiled;
          assert(compiled.fragment?.format === "hypit.fragment@1",
            `Generation Operation Node ${node.id} compiled no Graph Fragment.`);
          assert(compiled.fragment.exports.length === 1
            && sameType(compiled.fragment.exports[0]!.type, declaration.output),
          `Generation Operation Node ${node.id} compiled a result that differs from its declared output Type.`);
          return {
            declaration,
            specifier: installed.specifier,
            compiled,
            inspection: {
              node: node.id,
              kind: "operation",
              readiness: "ready",
              output: declaration.output,
              missing: [],
            },
          };
        }
        assert(declaration.fragment.exports.length === 1,
          `Generation Operation Node ${node.id} component must expose exactly one result.`);
        const expected = declaration.fragment.inputs.map((input) => input.name);
        const actual = Object.keys(node.inputs);
        const unknown = actual.filter((name) => !expected.includes(name));
        assert(unknown.length === 0,
          `Generation Operation Node ${node.id} has unknown input${unknown.length === 1 ? "" : "s"} ${unknown.join(", ")}.`);
        const missing = expected.filter((name) => node.inputs[name] === undefined);
        return {
          declaration,
          specifier: installed.specifier,
          inspection: {
            node: node.id,
            kind: "operation",
            readiness: missing.length === 0 ? "ready" : "incomplete",
            output: declaration.fragment.exports[0]!.type,
            missing,
          },
        };
      }
      const expected = [...declaration.inputs].sort();
      const actual = Object.keys(node.inputs).sort();
      const unknown = actual.filter((name) => !expected.includes(name));
      assert(unknown.length === 0,
        `Generation Value Node ${node.id} has unknown input${unknown.length === 1 ? "" : "s"} ${unknown.join(", ")}.`);
      for (const name of actual) {
        assert("value" in node.inputs[name]!,
          `Generation Value Node ${node.id} input ${name} must be an authored value.`);
      }
      const missing = expected.filter((name) => node.inputs[name] === undefined);
      return {
        declaration,
        specifier: installed.specifier,
        inspection: {
          node: node.id,
          kind: "value",
          readiness: missing.length === 0 ? "ready" : "incomplete",
          output: declaration.type,
          missing,
        },
      };
  };
  return {
    resolveAuthoring(node) {
      const value = declarations.get(generationComponentKey(node.using))?.declaration.authoring;
      return value === undefined ? undefined : structuredClone(value);
    },
    listAuthoring() {
      return [...declarations.values()].flatMap(({ declaration }) => declaration.authoring === undefined
        ? [] : [structuredClone(declaration.authoring)]);
    },
    async inspectNode(node, project) {
      return (await inspect(node, project)).inspection;
    },
    async resolveImplementation(node, project) {
      const resolved = await inspect(node, project);
      const { declaration, inspection } = resolved;
      assert(inspection.readiness === "ready",
        `Generation Graph Node ${node.id} is incomplete; missing ${inspection.missing.join(", ")}.`);
      if (declaration.kind === "operation") {
        if ("resolve" in declaration) {
          const compiled = resolved.compiled!;
          return {
            kind: "operation",
            using: declaration.using,
            fragment: compiled.fragment,
            inputs: Object.fromEntries(Object.entries(compiled.inputs).map(([name, input]) => [
              name,
              "value" in input ? { value: canonicalize(input.value) } : { node: input.node },
            ])),
            executionPackage: resolved.specifier,
          };
        }
        return { ...declaration, executionPackage: resolved.specifier };
      }
      const key = generationComponentKey(node.using);
      assert(assets !== undefined, `Generation Value Node ${key} requires an Asset Host.`);
      const inputs: Record<string, CanonicalValue> = {};
      for (const name of declaration.inputs) {
        const input = node.inputs[name]!;
        assert("value" in input, `Generation Value Node ${node.id} input ${name} must be an authored value.`);
        inputs[name] = canonicalize(input.value);
      }
      return {
        kind: "value",
        using: declaration.using,
        type: declaration.type,
        value: canonicalize(await declaration.load({
          node,
          project,
          inputs,
          resolveAsset: (request) => assets.resolveAsset(request),
          readAsset: (request) => assets.readAsset(request),
        })),
      };
    },
    ...(assets === undefined ? {} : { attachments: () => assets.attachments() }),
  };
}
