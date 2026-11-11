import type { GenerationWorkspace, GenerationWorkspaceOutput } from "./types.js";
import type { GenerationWorkspaceTransaction } from "./transaction.js";

/** Attach one exact History output to its producing node without resolving or copying Product data. */
export function planGenerationWorkspaceOutputAttachment(
  workspace: GenerationWorkspace,
  output: GenerationWorkspaceOutput,
): GenerationWorkspaceTransaction {
  return { revision: workspace.revision, commands: [{ kind: "output.attach", output: structuredClone(output) }] };
}
