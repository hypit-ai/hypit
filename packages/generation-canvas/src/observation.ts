import type { Product } from "@hypit/product";
import type { BuildResult } from "@hypit/result";

import type { GenerationWorkspace } from "./types.js";

export type GenerationWorkspaceActiveBuild = {
  readonly id: string;
  readonly activity: "submitting" | "ready" | "running" | "waiting" | "finalizing";
  readonly outputs?: Readonly<Record<string, Product>>;
};

export type GenerationWorkspaceOutputObservation = {
  readonly build: string;
  readonly output: string;
} & (
  | { readonly state: "pending" | "running" | "finalizing" | "unavailable"; readonly product?: never;
      readonly message?: never }
  | { readonly state: "ready"; readonly product: Product; readonly message?: never }
  | { readonly state: "failed" | "cancelled"; readonly message: string; readonly product?: never }
);

export type GenerationWorkspaceObservationHost = {
  readonly inspectActive?: (build: string) => Promise<GenerationWorkspaceActiveBuild | undefined>;
  readonly readResult: (build: string) => Promise<BuildResult | undefined>;
};

export function generationWorkspaceBuildOutputKey(build: string, output: string): string {
  return JSON.stringify([build, output]);
}

function productAt(outputs: Readonly<Record<string, Product>> | undefined, output: string): Product | undefined {
  return outputs !== undefined && Object.hasOwn(outputs, output) ? outputs[output] : undefined;
}

function assertProductAddress(product: Product, build: string, output: string): void {
  if (product.address.publication !== build || product.address.name !== output) {
    throw new Error(`Generation Workspace observation ${build}/${output} resolved Product `
      + `${product.address.publication}/${product.address.name}.`);
  }
}

function observeActive(build: GenerationWorkspaceActiveBuild, output: string): GenerationWorkspaceOutputObservation {
  const product = productAt(build.outputs, output);
  if (product !== undefined) {
    assertProductAddress(product, build.id, output);
    return { build: build.id, output, state: "ready", product };
  }
  return {
    build: build.id,
    output,
    state: build.activity === "submitting" ? "pending" : build.activity === "finalizing" ? "finalizing" : "running",
  };
}

function observeFinished(build: string, output: string, result: BuildResult | undefined): GenerationWorkspaceOutputObservation {
  if (result === undefined) return { build, output, state: "unavailable" };
  if (result.id !== build) throw new Error(`Generation Workspace requested Build ${build}, but history returned ${result.id}.`);
  const product = productAt(result.outputs, output);
  if (product !== undefined) {
    assertProductAddress(product, build, output);
    return { build, output, state: "ready", product };
  }
  if (result.outcome === "failed" || result.outcome === "cancelled") {
    return { build, output, state: result.outcome, message: result.failure };
  }
  return { build, output, state: "unavailable" };
}

/** Resolve attached exact outputs without changing Workspace author state. */
export async function observeGenerationWorkspaceOutputs(
  workspace: GenerationWorkspace,
  host: GenerationWorkspaceObservationHost,
): Promise<readonly GenerationWorkspaceOutputObservation[]> {
  const outputsByBuild = new Map<string, Set<string>>();
  for (const output of workspace.outputs) {
    const outputs = outputsByBuild.get(output.build) ?? new Set<string>();
    outputs.add(output.output);
    outputsByBuild.set(output.build, outputs);
  }
  const observations = await Promise.all([...outputsByBuild].map(async ([build, outputs]) => {
    const active = await host.inspectActive?.(build);
    if (active !== undefined) {
      if (active.id !== build) throw new Error(`Generation Workspace requested Build ${build}, but Runtime returned ${active.id}.`);
      return [...outputs].map((output) => observeActive(active, output));
    }
    const result = await host.readResult(build);
    return [...outputs].map((output) => observeFinished(build, output, result));
  }));
  return observations.flat();
}
