import { defineEndpointPackage } from "@hypit/endpoint-kit";
import { mediaTypes } from "@hypit/media";
import { renderHyperframesCapabilities, verifyHyperframesVisualRequest } from "@hypit/render-hyperframes";
import { canonicalize } from "@hypit/protocol";
import { resolveNodePackageExecutable } from "@hypit/package-loader-node";
import { renderHyperframesVisual, resolveExecutionOptions } from "./render.js";
import type { HyperframesExecutionOptions } from "./options.js";

export type * from "./options.js";
export const localHyperframesProviderModuleRef = { name: "@hypit/provider-hyperframes-local", version: "1" } as const;
export type CreateLocalHyperframesProviderOptions = HyperframesExecutionOptions & {
  readonly instance?: string;
  readonly pool?: string;
  /** Used by managed browser installation, not frame capture. */
  readonly nodePath?: string;
  readonly hyperframesCliPath?: string;
  /** Whole render requests admitted concurrently; independent of frame workers. */
  readonly defaultConcurrency?: number;
  /** Shared Chrome slots across Need executions using this pool. */
  readonly browserCapacity?: number;
};

export function defaultHyperframesCliPath(): string {
  return resolveNodePackageExecutable("hyperframes", "hyperframes", { from: import.meta.url });
}

export function createLocalHyperframesProvider(config: CreateLocalHyperframesProviderOptions) {
  const execution = resolveExecutionOptions(config);
  const pool = config.pool ?? config.instance ?? "hyperframes.local";
  const browsers = `capacity:${pool}/browsers`;
  if (config.browserCapacity !== undefined && (!Number.isSafeInteger(config.browserCapacity) || config.browserCapacity < 1)) {
    throw new Error("HyperFrames browserCapacity must be a positive integer");
  }
  return defineEndpointPackage({
    module: localHyperframesProviderModuleRef,
    facet: "render",
    instance: config.instance ?? "hyperframes.local",
    pool,
    pricing: { kind: "local" },
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [{
      lifecycle: "immediate" as const,
      capability: renderHyperframesCapabilities.renderVisual,
      returns: mediaTypes.renderedVisual,
      ...(config.browserCapacity === undefined ? {} : {
        resources: [{ id: browsers, limit: config.browserCapacity }],
        unitsForRequest: (request: import("@hypit/endpoint-kit").EndpointRequest) => {
          verifyHyperframesVisualRequest(request.constraints);
          const { document, range } = request.constraints;
          return { [browsers]: Math.min(execution.workers,
            range === undefined ? document.frameCount : range.endFrameExclusive - range.startFrame) };
        },
      }),
      handler: async (context) => {
        const request = context.need.constraints;
        verifyHyperframesVisualRequest(request);
        const visual = await renderHyperframesVisual(request, { ...config, workers: execution.workers, resources: context.resources });
        return { value: { kind: "inline", value: canonicalize(visual) } };
      },
    }],
  });
}
