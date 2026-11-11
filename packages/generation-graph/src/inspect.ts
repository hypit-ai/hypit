import { assertGenerationGraphProject } from "./project.js";
import type {
  GenerationGraphInspectionHost,
  GenerationGraphNodeReport,
  GenerationGraphProject,
} from "./types.js";

/**
 * Inspect package-owned node semantics without loading assets, choosing a Runtime or changing the recipe.
 * Invalid supplied facts are reports; missing required facts remain an ordinary incomplete authoring state.
 */
export async function inspectGenerationGraphProject(
  project: GenerationGraphProject,
  host: GenerationGraphInspectionHost,
  nodes: readonly string[] = project.nodes.map((node) => node.id),
): Promise<readonly GenerationGraphNodeReport[]> {
  assertGenerationGraphProject(project);
  const selected = new Set(nodes);
  if (selected.size !== nodes.length) throw new Error("Generation Graph inspection repeats a Node.");
  for (const id of selected) {
    if (!project.nodes.some((node) => node.id === id)) throw new Error(`Unknown Generation Graph Node: ${id}`);
  }
  return await Promise.all(project.nodes.filter((node) => selected.has(node.id)).map(async (node) => {
    try {
      return await host.inspectNode(node, project);
    } catch (error) {
      return {
        node: node.id,
        readiness: "invalid" as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }));
}
