import type { Product } from "@hypit/product";
import type { BuildResult } from "@hypit/result";

import type { GenerationCanvasView } from "./types.js";

export type GenerationCanvasActiveBuild = {
  readonly id: string;
  readonly activity: "submitting" | "ready" | "running" | "waiting" | "finalizing";
  /** Products already durably published while the Build is still active. */
  readonly outputs?: Readonly<Record<string, Product>>;
};

export type GenerationCanvasBuildOutputObservation = {
  readonly build: string;
  readonly output: string;
} & (
  | { readonly state: "pending" | "running" | "finalizing" | "unavailable"; readonly product?: never;
      readonly message?: never }
  | { readonly state: "ready"; readonly product: Product; readonly message?: never }
  | { readonly state: "failed" | "cancelled"; readonly message: string; readonly product?: never }
);

export type GenerationCanvasObservationHost = {
  /** Omit this port when no Runtime control is available. */
  readonly inspectActive?: (build: string) => Promise<GenerationCanvasActiveBuild | undefined>;
  /** Finished history remains readable without a Runtime. */
  readonly readResult: (build: string) => Promise<BuildResult | undefined>;
};

export function generationCanvasBuildOutputKey(build: string, output: string): string {
  return JSON.stringify([build, output]);
}

function productAt(
  outputs: Readonly<Record<string, Product>> | undefined,
  output: string,
): Product | undefined {
  return outputs !== undefined && Object.hasOwn(outputs, output) ? outputs[output] : undefined;
}

function assertProductAddress(product: Product, build: string, output: string): void {
  if (product.address.publication !== build || product.address.name !== output) {
    throw new Error(`Generation Canvas observation ${build}/${output} resolved Product `
      + `${product.address.publication}/${product.address.name}.`);
  }
}

function observeActive(
  build: GenerationCanvasActiveBuild,
  output: string,
): GenerationCanvasBuildOutputObservation {
  const product = productAt(build.outputs, output);
  if (product !== undefined) {
    assertProductAddress(product, build.id, output);
    return { build: build.id, output, state: "ready", product };
  }
  return {
    build: build.id,
    output,
    state: build.activity === "submitting"
      ? "pending"
      : build.activity === "finalizing" ? "finalizing" : "running",
  };
}

function observeFinished(
  build: string,
  output: string,
  result: BuildResult | undefined,
): GenerationCanvasBuildOutputObservation {
  if (result === undefined) return { build, output, state: "unavailable" };
  if (result.id !== build) {
    throw new Error(`Generation Canvas requested Build ${build}, but Result history returned ${result.id}.`);
  }
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

/** Resolve every exact Build-output card once per Build without mutating its Canvas View. */
export async function observeGenerationCanvasBuildOutputs(
  view: GenerationCanvasView,
  host: GenerationCanvasObservationHost,
): Promise<readonly GenerationCanvasBuildOutputObservation[]> {
  const outputsByBuild = new Map<string, Set<string>>();
  for (const item of view.items) {
    if (item.subject.kind !== "build-output") continue;
    const outputs = outputsByBuild.get(item.subject.build) ?? new Set<string>();
    outputs.add(item.subject.output);
    outputsByBuild.set(item.subject.build, outputs);
  }
  const observations = await Promise.all([...outputsByBuild].map(async ([build, outputs]) => {
    const active = await host.inspectActive?.(build);
    if (active !== undefined) {
      if (active.id !== build) {
        throw new Error(`Generation Canvas requested Build ${build}, but Runtime returned ${active.id}.`);
      }
      return [...outputs].map((output) => observeActive(active, output));
    }
    const result = await host.readResult(build);
    return [...outputs].map((output) => observeFinished(build, output, result));
  }));
  return observations.flat();
}
