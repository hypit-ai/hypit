import type { Facet } from "@hypit/facet";
import { isModuleRef, moduleKey } from "@hypit/protocol";
import type { GenerationComponentRef, GenerationGraphNode } from "@hypit/generation-graph";
import type { GenerationNodeAuthoringShape } from "@hypit/generation-graph";

export const generationCanvasPresentationFacetAbi = "hypit.generation-canvas-presentation@1";

/** Finite visual vocabulary owned by Canvas. Packages contribute meaning, never CSS or markup. */
export type GenerationCanvasNodeRole =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "transcript"
  | "asset"
  | "generic";

export type GenerationCanvasAuthoringLabels = {
  readonly controls?: readonly {
    readonly id: string;
    readonly label: string;
    readonly placement?: "primary" | "compact" | "advanced";
    readonly placeholder?: string;
  }[];
  readonly ports?: readonly { readonly id: string; readonly label: string }[];
  readonly variants?: readonly { readonly value: string; readonly label: string }[];
};

export type GenerationCanvasNodePresentation = {
  readonly using: GenerationComponentRef;
  /** Package-owned node type label. One Workspace occurrence owns its editable instance name. */
  readonly displayName: string;
  readonly role: GenerationCanvasNodeRole;
  /** Palette placement is visual editor metadata, independent from the node's output role. */
  readonly category?: "image" | "video" | "audio" | "asset";
  /** Optional authored input shown as this node's primary editor summary. */
  readonly summaryInput?: string;
  /** Fixed model label shown independently from the node type label. */
  readonly modelLabel?: string;
  /** Package-owned switch group for exact model components with one compatible authoring surface. */
  readonly modelGroup?: string;
  /** Labels and layout for package-owned Graph authoring fields. It carries no field schema. */
  readonly authoring?: GenerationCanvasAuthoringLabels;
};

export type GenerationCanvasNodeEditor = GenerationNodeAuthoringShape & {
  readonly labels: GenerationCanvasAuthoringLabels;
};

export type GenerationCanvasCatalogItem = GenerationCanvasNodePresentation & {
  readonly editor?: GenerationCanvasNodeEditor;
};

export type GenerationCanvasPresentationPackage = {
  readonly nodes: readonly GenerationCanvasNodePresentation[];
};

export type GenerationCanvasPresentationFacet = Facet & {
  readonly abi: typeof generationCanvasPresentationFacetAbi;
  readonly implementation: GenerationCanvasPresentationPackage;
};

export type GenerationCanvasPresentationHost = {
  readonly resolve: (node: GenerationGraphNode) => GenerationCanvasNodePresentation | undefined;
  /** Installed package contributions available to authoring UI; never persisted as a registry. */
  readonly list: () => readonly GenerationCanvasNodePresentation[];
};

const roles = new Set<GenerationCanvasNodeRole>([
  "text", "image", "video", "audio", "transcript", "asset", "generic",
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function key(using: GenerationComponentRef): string {
  assert(isModuleRef(using.module), "Generation Canvas presentation Module is invalid.");
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(using.name),
    "Generation Canvas presentation component name is invalid.");
  return `${moduleKey(using.module)}#${using.name}`;
}

function assertPackage(value: GenerationCanvasPresentationPackage): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "Generation Canvas presentation package must be an object.");
  assert(Array.isArray(value.nodes), "Generation Canvas presentation package nodes must be an array.");
  const keys = new Set<string>();
  for (const node of value.nodes) {
    const nodeKey = key(node.using);
    assert(!keys.has(nodeKey), `Generation Canvas presentation package repeats ${nodeKey}.`);
    keys.add(nodeKey);
    assert(typeof node.displayName === "string" && node.displayName.trim().length > 0,
      `Generation Canvas presentation ${nodeKey} display name is empty.`);
    assert(roles.has(node.role), `Generation Canvas presentation ${nodeKey} role is invalid.`);
    if (node.category !== undefined) {
      assert(["image", "video", "audio", "asset"].includes(node.category),
        `Generation Canvas presentation ${nodeKey} category is invalid.`);
    }
    if (node.summaryInput !== undefined) {
      assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(node.summaryInput),
        `Generation Canvas presentation ${nodeKey} summary input is invalid.`);
    }
    if (node.modelLabel !== undefined) {
      assert(typeof node.modelLabel === "string" && node.modelLabel.trim().length > 0,
        `Generation Canvas presentation ${nodeKey} model label is empty.`);
    }
    if (node.modelGroup !== undefined) {
      assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(node.modelGroup),
        `Generation Canvas presentation ${nodeKey} model group is invalid.`);
      assert(node.modelLabel !== undefined,
        `Generation Canvas presentation ${nodeKey} model group requires a model label.`);
    }
    if (node.authoring !== undefined) {
      const ids = new Set<string>();
      for (const item of [...(node.authoring.controls ?? []), ...(node.authoring.ports ?? [])]) {
        assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(item.id),
          `Generation Canvas presentation ${nodeKey} authoring label id is invalid.`);
        assert(!ids.has(item.id), `Generation Canvas presentation ${nodeKey} repeats authoring label ${item.id}.`);
        ids.add(item.id);
        assert(typeof item.label === "string" && item.label.trim().length > 0,
          `Generation Canvas presentation ${nodeKey} authoring label ${item.id} is empty.`);
      }
      for (const item of node.authoring.variants ?? []) {
        assert(typeof item.value === "string" && item.value.length > 0 && typeof item.label === "string"
          && item.label.trim().length > 0, `Generation Canvas presentation ${nodeKey} variant label is invalid.`);
      }
    }
  }
}

export function createGenerationCanvasPresentationFacet(
  value: GenerationCanvasPresentationPackage,
): GenerationCanvasPresentationFacet {
  assertPackage(value);
  return { abi: generationCanvasPresentationFacetAbi, implementation: value };
}

export function generationCanvasPresentationPackagesFromFacets(
  facets: readonly Facet[],
): readonly GenerationCanvasPresentationPackage[] {
  return facets.flatMap((facet) => facet.abi === generationCanvasPresentationFacetAbi
    ? [(facet as GenerationCanvasPresentationFacet).implementation]
    : []);
}

export function createGenerationCanvasPresentationHost(
  packages: readonly GenerationCanvasPresentationPackage[],
): GenerationCanvasPresentationHost {
  const nodes = new Map<string, GenerationCanvasNodePresentation>();
  for (const value of packages) {
    assertPackage(value);
    for (const node of value.nodes) {
      const nodeKey = key(node.using);
      assert(!nodes.has(nodeKey), `Generation Canvas has multiple presentations for ${nodeKey}.`);
      nodes.set(nodeKey, structuredClone(node));
    }
  }
  return {
    resolve(node) {
      const presentation = nodes.get(key(node.using));
      return presentation === undefined ? undefined : structuredClone(presentation);
    },
    list() {
      return [...nodes.values()].map((node) => structuredClone(node));
    },
  };
}
