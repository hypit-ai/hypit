import type { HtmlVideoDeliveryExecutor } from "@hypit/html-video";
import {
  verifyMuxedMedia,
  verifyTimelineAudio,
} from "@hypit/media";
import {
  createMediaExecutionEnvironment,
  executeMuxProgramMedia,
  executeRenderTimelineAudio,
} from "@hypit/media-local";
import type { CreateMediaExecutionEnvironmentOptions } from "@hypit/media-local";
import { canonicalize } from "@hypit/hypit/protocol";
import type { ResourceStore } from "@hypit/hypit/runtime";

import { rasterizeChromiumHtmlProgram } from "./render.js";
import type { ChromiumHtmlRasterOptions } from "./render.js";

export type LocalHtmlVideoDeliveryOptions = {
  /** One caller-owned byte domain shared by authored inputs and all rendered products. */
  readonly resources: ResourceStore;
  readonly html?: Omit<ChromiumHtmlRasterOptions, "resources">;
  readonly media?: CreateMediaExecutionEnvironmentOptions;
};

export type LocalHtmlVideoDeliveryExecutor = HtmlVideoDeliveryExecutor;

/**
 * Concrete local execution selected by an application at its outer boundary.
 *
 * The returned object structurally implements the provider-independent HTML Video delivery
 * executor: Chromium owns picture, the local media algorithms own AudioProgram and mux, and the
 * supplied ResourceStore is the only place where their bytes meet.
 */
export function createLocalHtmlVideoDeliveryExecutor(
  options: LocalHtmlVideoDeliveryOptions,
): LocalHtmlVideoDeliveryExecutor {
  const media = createMediaExecutionEnvironment(options.resources, options.media);
  return {
    renderVisual: async request => await rasterizeChromiumHtmlProgram(request, {
      ...options.html,
      resources: options.resources,
    }),
    renderAudio: async request => {
      const result = await executeRenderTimelineAudio(media, canonicalize(request));
      verifyTimelineAudio(result.value);
      return structuredClone(result.value);
    },
    mux: async request => {
      const result = await executeMuxProgramMedia(media, canonicalize(request));
      verifyMuxedMedia(result.value);
      return structuredClone(result.value);
    },
  };
}
