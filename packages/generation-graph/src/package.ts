import type { Facet } from "@hypit/facet";
import { canonicalize, isModuleRef, isTypeRef } from "@hypit/protocol";
import type { CanonicalValue } from "@hypit/protocol";

import type {
  GenerationComponentRef,
  GenerationGraphLoweringHost,
  GenerationGraphNode,
  GenerationGraphProject,
  GenerationNodeAssetHost,
  GenerationOperationNodeImplementation,
} from "./types.js";

export const generationNodePackageFacetAbi = "hypit.generation-node-package@1";

export type GenerationOperationNodeDeclaration = Omit<GenerationOperationNodeImplementation, "executionPackage">;

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
      assert(node.fragment?.format === "hypit.fragment@1", `Generation Node ${key} has no Graph Fragment.`);
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
): GenerationGraphLoweringHost {
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
    }
  }
  return {
    async resolveImplementation(node, project) {
      const key = generationComponentKey(node.using);
      const installed = declarations.get(key);
      if (installed === undefined) throw new Error(`Generation Node ${key} is not installed.`);
      const declaration = installed.declaration;
      if (declaration.kind === "operation") {
        return {
          ...declaration,
          executionPackage: installed.specifier,
        };
      }
      assert(assets !== undefined, `Generation Value Node ${key} requires an Asset Host.`);
      const expected = [...declaration.inputs].sort();
      const actual = Object.keys(node.inputs).sort();
      assert(JSON.stringify(actual) === JSON.stringify(expected),
        `Generation Value Node ${node.id} binds [${actual.join(", ")}] but declares [${expected.join(", ")}].`);
      const inputs: Record<string, CanonicalValue> = {};
      for (const name of declaration.inputs) {
        const input = node.inputs[name]!;
        assert("value" in input,
          `Generation Value Node ${node.id} input ${name} must be an authored value.`);
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
