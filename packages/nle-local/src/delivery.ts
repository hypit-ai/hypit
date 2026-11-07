import type { HtmlVideoDeliveryExecutor } from "@hypit/html-video";
import {
  verifyMuxedMedia,
  verifyTimelineAudio,
} from "@hypit/media";
import {
  createMediaExecutionEnvironment,
  executeMuxProgramMedia,
  executeRenderTimelineAudio,
} from "@hypit/media-local/execution";
import type { CreateMediaExecutionEnvironmentOptions } from "@hypit/media-local/execution";
import { canonicalize } from "@hypit/hypit/protocol";
import type { ResourceStore } from "@hypit/resource-store";
import { rasterizeChromiumHtmlProgram } from "@hypit/html-chromium-local";
import type { ChromiumHtmlRasterOptions } from "@hypit/html-chromium-local";

export type LocalNleDeliveryOptions = {
  /** One request-owned byte domain shared by authored inputs and rendered products. */
  readonly resources: ResourceStore;
  readonly html?: Omit<ChromiumHtmlRasterOptions, "resources">;
  readonly media?: CreateMediaExecutionEnvironmentOptions;
};

/** Direct picture, audio and mux execution selected by the local NLE application. */
export function createLocalNleDeliveryExecutor(
  options: LocalNleDeliveryOptions,
): HtmlVideoDeliveryExecutor {
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
