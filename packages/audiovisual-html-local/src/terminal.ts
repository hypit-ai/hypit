import type { AudiovisualTerminalRuntime } from "@hypit/audiovisual-execution";
import {
  createAudiovisualHtmlTerminalCapability,
  createAudiovisualHtmlTerminalExecutor,
  type AudiovisualHtmlTerminal,
} from "@hypit/audiovisual-html";
import type { HtmlProgram } from "@hypit/html-program";
import type { PreparedPictureSampling } from "@hypit/media";

import {
  createLocalHtmlPictureProductPublisher,
  type LocalHtmlPictureProductOptions,
} from "./picture-product.js";

export type LocalHtmlOperatorTerminalInput = Omit<AudiovisualHtmlTerminal, "publishPictureProduct">;

/** One explicit local HTML runtime capable of publishing intermediate Picture Products. */
export function createLocalHtmlOperatorTerminalRuntime(
  input: LocalHtmlOperatorTerminalInput,
  options: LocalHtmlPictureProductOptions,
): AudiovisualTerminalRuntime<PreparedPictureSampling, HtmlProgram> {
  return {
    capability: createAudiovisualHtmlTerminalCapability({
      terminal: input.terminal,
      sources: input.sources,
      publishesPictureProducts: true,
    }),
    executor: createAudiovisualHtmlTerminalExecutor({
      ...input,
      publishPictureProduct: createLocalHtmlPictureProductPublisher(options),
    }),
  };
}
