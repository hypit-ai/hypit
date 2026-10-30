import { defineEndpoint } from "@hypit/hypit/endpoint";
import type { EndpointInvocationContext } from "@hypit/hypit/endpoint";
import { mediaTypes } from "@hypit/media";
import { htmlProgramCapabilities, htmlProgramTypes, verifyHtmlFrameRequest, verifyHtmlRasterRequest } from "@hypit/html-program";
import { canonicalize } from "@hypit/hypit/protocol";
import { rasterizeChromiumHtmlProgram, rasterizeHtmlFrames, resolveExecutionOptions } from "./render.js";
import { renderWorkerLimit } from "./concurrency.js";
import type { HtmlExecutionOptions } from "./options.js";
import { renderProgressReporter } from "./progress.js";
import { endpointSupport, localHtmlFrameRejection, localHtmlRasterRejection } from "./support.js";
import type { BrowserOptions } from "./browser.js";

export type * from "./options.js";
export const localHtmlProviderModuleRef = { name: "@hypit/provider-html-local", version: "1" } as const;
type LocalHtmlProviderOptions = HtmlExecutionOptions & BrowserOptions & {
  readonly instance?: string;
  readonly pool?: string;
  /** Used by managed browser installation, not frame capture. */
  readonly nodePath?: string;
  /** Whole render requests admitted concurrently; independent of frame workers. */
  readonly defaultConcurrency?: number;
  /** Shared capture-worker slots across Need executions using this pool. */
  readonly browserCapacity?: number;
};

export type CreateLocalChromiumHtmlProviderOptions = LocalHtmlProviderOptions;

function createLocalHtmlProvider(config: LocalHtmlProviderOptions) {
  const execution = resolveExecutionOptions(config);
  const pool = config.pool ?? config.instance ?? "html.local";
  const browsers = `capacity:${pool}/browsers`;
  if (config.browserCapacity !== undefined && (!Number.isSafeInteger(config.browserCapacity) || config.browserCapacity < 1)) {
    throw new Error("HTML renderer browserCapacity must be a positive integer");
  }
  const maxWorkers = execution.workers === "auto" ? Math.min(execution.maxWorkers, config.browserCapacity ?? Infinity) : execution.maxWorkers;
  const reserved = { ...execution, maxWorkers };
  const rendererOptions = {
    ...(execution.chromePath === undefined ? { browserVersion: execution.browserVersion! } : { chromePath: execution.chromePath }),
    browserCacheDirectory: execution.browserCacheDirectory,
  };
  return defineEndpoint({
    instance: config.instance ?? "html.local",
    pool,
    pricing: { kind: "local" },
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [{
      lifecycle: "immediate" as const,
      capability: htmlProgramCapabilities.rasterizeVisual,
      returns: mediaTypes.timelineVisual,
      supports: (request: import("@hypit/hypit/endpoint").EndpointRequest) => {
        try {
          verifyHtmlRasterRequest(request.constraints);
          return endpointSupport(localHtmlRasterRejection(request.constraints));
        } catch (error) {
          return endpointSupport(error instanceof Error ? error.message : String(error));
        }
      },
      ...(config.browserCapacity === undefined ? {} : {
        resources: [{ id: browsers, limit: config.browserCapacity }],
        unitsForRequest: (request: import("@hypit/hypit/endpoint").EndpointRequest) => {
          verifyHtmlRasterRequest(request.constraints);
          const { program, range } = request.constraints;
          return { [browsers]: renderWorkerLimit(reserved,
            range === undefined ? program.frameCount : range.endFrameExclusive - range.startFrame,
            program.frameRate.numerator / program.frameRate.denominator) };
        },
      }),
      handler: async (context) => {
        const request = context.request.constraints;
        verifyHtmlRasterRequest(request);
        const frameCount = request.range === undefined ? request.program.frameCount
          : request.range.endFrameExclusive - request.range.startFrame;
        const progress = renderProgressReporter(context.reportProgress, frameCount);
        try {
          const visual = await rasterizeChromiumHtmlProgram(request, { ...config, ...rendererOptions,
            workers: execution.workers, maxWorkers,
            resources: context.resources, onProgress: progress.onProgress,
            ...(context.reportDiagnostic === undefined ? {} : { onDiagnostic: context.reportDiagnostic }) });
          return canonicalize(visual);
        } finally {
          await progress.flush();
        }
      },
    }, {
      lifecycle: "immediate" as const,
      capability: htmlProgramCapabilities.rasterizeFrames,
      returns: htmlProgramTypes.frameImages,
      supports: (request: import("@hypit/hypit/endpoint").EndpointRequest) => {
        try {
          verifyHtmlFrameRequest(request.constraints);
          return endpointSupport(localHtmlFrameRejection(request.constraints));
        } catch (error) {
          return endpointSupport(error instanceof Error ? error.message : String(error));
        }
      },
      ...(config.browserCapacity === undefined ? {} : {
        resources: [{ id: browsers, limit: config.browserCapacity }],
        unitsForRequest: (request: import("@hypit/hypit/endpoint").EndpointRequest) => {
          verifyHtmlFrameRequest(request.constraints);
          const document = request.constraints.program;
          return { [browsers]: renderWorkerLimit(reserved, request.constraints.frames.length,
            document.frameRate.numerator / document.frameRate.denominator) };
        },
      }),
      handler: async (context: EndpointInvocationContext) => {
        const request = context.request.constraints;
        verifyHtmlFrameRequest(request);
        const progress = renderProgressReporter(context.reportProgress, request.frames.length);
        try {
          const frames = await rasterizeHtmlFrames(request, { ...config,
            ...(execution.chromePath === undefined ? { browserVersion: execution.browserVersion! } : { chromePath: execution.chromePath }),
            browserCacheDirectory: execution.browserCacheDirectory,
            workers: execution.workers, maxWorkers,
            resources: context.resources, onProgress: progress.onProgress,
            ...(context.reportDiagnostic === undefined ? {} : { onDiagnostic: context.reportDiagnostic }) });
          return canonicalize(frames);
        } finally { await progress.flush(); }
      },
    }],
  });
}

/** Portable PNG-frame and encoded-visual Endpoint backed by Chromium. */
export function createLocalChromiumHtmlProvider(config: CreateLocalChromiumHtmlProviderOptions) {
  return createLocalHtmlProvider(config);
}
