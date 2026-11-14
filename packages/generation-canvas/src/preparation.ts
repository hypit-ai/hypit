import {
  prepareGenerationGraphTargets,
  type GenerationGraphLoweringHost,
  type GenerationGraphProject,
  type PreparedGenerationGraphBuild,
} from "@hypit/generation-graph";
import type { ProductHistory, ResolvedProduct } from "@hypit/product";
import { valueBlobRefs } from "@hypit/protocol";

import { assertGenerationWorkspace } from "./project.js";
import type { GenerationWorkspace } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function productDependencyValue(product: ResolvedProduct) {
  const blobs = new Map(valueBlobRefs(product.value).map(({ blob }) => [blob.resource, blob]));
  return {
    type: product.type,
    value: product.value,
    attachments: [...blobs.values()].map((blob) => ({
      blob,
      async open() {
        const content = await product.openResource(blob);
        assert(content !== undefined,
          `Selected Product ${product.address.publication}/${product.address.name} is missing resource ${blob.resource}.`);
        return content;
      },
    })),
  };
}

/**
 * Prepare one Canvas generation through the normal Generation Graph pipeline. Explicitly selected
 * upstream Products cut traversal; unselected operations recursively execute. The target itself is
 * always generated, and value nodes always use their package-owned loader.
 */
export async function prepareGenerationWorkspaceNode(input: {
  readonly graph: GenerationGraphProject;
  readonly workspace: GenerationWorkspace;
  readonly program: import("@hypit/generation-build").LinkedProgram;
  readonly host: GenerationGraphLoweringHost;
  readonly products: ProductHistory;
  readonly node: string;
}): Promise<PreparedGenerationGraphBuild> {
  assertGenerationWorkspace(input.workspace);
  const workspaceNodes = new Map(input.workspace.nodes.map((node) => [node.node, node]));
  assert(workspaceNodes.has(input.node),
    `Generation Workspace does not place target Node ${input.node}.`);
  return await prepareGenerationGraphTargets(
    input.graph,
    input.program,
    input.host,
    [input.node],
    {
      dependencyPolicy: {
        kind: "selective",
        decide: async (node) => {
          const selected = workspaceNodes.get(node.id)?.selected;
          if (selected === undefined) return { kind: "execute" } as const;
          const product = await input.products.resolveProduct({
            publication: selected.build,
            name: selected.output,
          });
          assert(product !== undefined,
            `Selected Product ${selected.build}/${selected.output} for dependency ${node.id} is unavailable.`);
          return { kind: "resolved-value", value: productDependencyValue(product) } as const;
        },
      },
    },
  );
}
