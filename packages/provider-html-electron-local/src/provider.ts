import { defineEndpoint } from "@hypit/hypit/endpoint";
import { mediaTypes } from "@hypit/media";
import { htmlProgramCapabilities, verifyHtmlRasterRequest } from "@hypit/html-program";
import { canonicalize } from "@hypit/hypit/protocol";
import {
  endpointSupport,
  localHtmlRasterRejection,
  renderProgressReporter,
  renderWorkerLimit,
  resolveLocalHtmlExecutionOptions,
} from "@hypit/html-render-local";
import type { HtmlExecutionOptions } from "@hypit/html-render-local";

import { rasterizeElectronHtmlProgram } from "./render.js";

export const localElectronHtmlProviderModuleRef = {
  name: "@hypit/provider-html-electron-local",
  version: "1",
} as const;

export type CreateLocalElectronHtmlProviderOptions = HtmlExecutionOptions & {
  readonly electronPath: string;
  readonly instance?: string;
  readonly pool?: string;
  readonly defaultConcurrency?: number;
  readonly browserCapacity?: number;
};

/** Encoded-visual Endpoint backed by one explicitly selected Electron executable. */
export function createLocalElectronHtmlProvider(config: CreateLocalElectronHtmlProviderOptions) {
  const execution = resolveLocalHtmlExecutionOptions(config);
  if (execution.browserGpu === "software") {
    throw new Error("Electron shared-texture rendering requires browserGpu auto or hardware");
  }
  const pool = config.pool ?? config.instance ?? "html.electron.local";
  const browsers = `capacity:${pool}/browsers`;
  if (config.browserCapacity !== undefined && (!Number.isSafeInteger(config.browserCapacity) || config.browserCapacity < 1)) {
    throw new Error("HTML renderer browserCapacity must be a positive integer");
  }
  const maxWorkers = execution.workers === "auto"
    ? Math.min(execution.maxWorkers, config.browserCapacity ?? Infinity)
    : execution.maxWorkers;
  const reserved = { ...execution, maxWorkers };
  return defineEndpoint({
    instance: config.instance ?? "html.electron.local",
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
            program.frameRate.numerator / program.frameRate.denominator,
            program.videoSources.length > 0) };
        },
      }),
      handler: async context => {
        const request = context.request.constraints;
        verifyHtmlRasterRequest(request);
        const frameCount = request.range === undefined ? request.program.frameCount
          : request.range.endFrameExclusive - request.range.startFrame;
        const progress = renderProgressReporter(context.reportProgress, frameCount);
        try {
          const visual = await rasterizeElectronHtmlProgram(request, {
            ...config,
            workers: execution.workers,
            maxWorkers,
            resources: context.resources,
            onProgress: progress.onProgress,
            ...(context.reportDiagnostic === undefined ? {} : { onDiagnostic: context.reportDiagnostic }),
          });
          return canonicalize(visual);
        } finally {
          await progress.flush();
        }
      },
    }],
  });
}
