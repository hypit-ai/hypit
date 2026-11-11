import type { GenerationWorkspace } from "./types.js";
import type { GenerationWorkspaceTransaction } from "./transaction.js";

export type AcceptedGenerationWorkspaceBuild = {
  readonly build: string;
  /** Output names are operation node identities in Generation Graph @1. */
  readonly outputs: readonly string[];
};

/** Attach and select every accepted exact output on its producing operation node. */
export function planAcceptedGenerationWorkspaceBuild(
  workspace: GenerationWorkspace,
  accepted: AcceptedGenerationWorkspaceBuild,
): GenerationWorkspaceTransaction {
  if (accepted.build.trim().length === 0) throw new Error("Accepted Generation Build identity is empty.");
  const outputs = new Set(accepted.outputs);
  if (outputs.size !== accepted.outputs.length || [...outputs].some((output) => output.trim().length === 0)) {
    throw new Error("Accepted Generation Build outputs must be unique and non-empty.");
  }
  const nodes = new Set(workspace.nodes.map((node) => node.node));
  for (const output of outputs) {
    if (!nodes.has(output)) throw new Error(`Accepted Generation Output ${output} has no Workspace Node.`);
  }
  return {
    revision: workspace.revision,
    commands: [...outputs].flatMap((output) => {
      const address = { build: accepted.build, output };
      return [
        { kind: "output.attach" as const, output: { node: output, ...address } },
        { kind: "node.select-output" as const, node: output, output: address },
      ];
    }),
  };
}
