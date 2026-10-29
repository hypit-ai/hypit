import type { Composition } from "@hypit/composition";
import { compileHtmlProgram, materializeHtmlProgram } from "@hypit/html-program";
import type { HtmlProgram } from "@hypit/html-program";
import { lowerPlaybackAudio } from "@hypit/html-playback";
import { compileAudioProgram } from "@hypit/audio-program";

import { injectRuntimeShim } from "./runtime-shim.js";

export type RenderInput = {
  readonly composition: Composition;
  /** Resources Studio can serve for material selected by the Invocation. */
  readonly served?: ReadonlySet<string>;
};

/**
 * Compile the interpreted Tracks into the same HTML renderer document the real
 * renderer photographs frame by frame, and hand it back as an `iframe` srcdoc.
 *
 * Nothing is approximated here: placement, stacking, clipping, motion and
 * material all come from the projection selected by the Invocation.
 */
export function renderPreview(input: RenderInput): string {
  return renderStudioHtmlProgram(input).preview;
}

/** The same compiled picture serves immediate frame capture and interactive playback. */
export function renderStudioHtmlProgram(input: RenderInput): { readonly document: HtmlProgram; readonly html: string; readonly preview: string } {
  const document = compileHtmlProgram(input.composition);
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
