import type { Composition } from "@hypit/composition";
import { compileHtmlProgram, materializeHtmlProgram } from "@hypit/html-program";
import type { HtmlProgram } from "@hypit/html-program";
import { lowerPlaybackAudio } from "@hypit/html-playback";
import { compileAudioProgram } from "@hypit/audio-program";

import { injectRuntimeShim } from "./runtime-shim.js";

export type RenderInput = {
  readonly composition: Composition;
  /** Resources Studio can serve for material reached by the selected Targets. */
  readonly served?: ReadonlySet<string>;
};

/**
 * Compile the interpreted Tracks into the same HTML renderer document the real
 * renderer photographs frame by frame, and hand it back as an `iframe` srcdoc.
 *
 * This preview intentionally covers only the browser-playable subset. Provider
 * execution such as Visual Process rasterization is rejected instead of being
 * approximated; Studio's preview pipeline will be replaced as a whole.
 */
export function renderPreview(input: RenderInput): string {
  return renderStudioHtmlProgram(input).preview;
}

/** The same compiled picture serves immediate frame capture and interactive playback. */
export function renderStudioHtmlProgram(input: RenderInput): { readonly document: HtmlProgram; readonly html: string; readonly preview: string } {
  const document = compileHtmlProgram(input.composition);
  if (document.processUsages.length > 0) {
    throw new Error("Studio preview is disabled for Visual Process input rasterization; export with a renderer instead.");
  }
  const html = materializeHtmlProgram(document, (artifact) => {
    // The only Artifacts a preview can reference are files the author already
    // has. Anything else would be a Provider's output, which does not exist yet,
    // and failing loudly beats serving a picture with holes in it.
    if (input.served?.has(artifact.resource) !== true) {
      throw new Error(`Preview composition references Artifact ${artifact.resource}, which it cannot serve.`);
    }
    return `/__studio/material/${artifact.resource}`;
  });
  const audio = lowerPlaybackAudio(
    compileAudioProgram(input.composition),
    (artifact) => {
      if (input.served?.has(artifact.resource) !== true) {
        throw new Error(`Preview audio references Artifact ${artifact.resource}, which it cannot serve.`);
      }
      return `/__studio/material/${artifact.resource}`;
    },
  );
  return { document, html, preview: injectRuntimeShim(html, audio, document) };
}
