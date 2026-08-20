import type { Composition } from "@hypit/composition";
import { compileHyperframesDocument, materializeHyperframesHtml } from "@hypit/hyperframes";
import type { ProgramSpace } from "@hypit/program-space";

import { injectRuntimeShim } from "./runtime-shim.js";

export type RenderInput = {
  readonly composition: Composition;
  readonly space: ProgramSpace;
  /** Digests Studio can serve for material selected by the Run. */
  readonly served?: ReadonlySet<string>;
  /** The Track whose material carries the programme's speech. */
  readonly audibleTrack?: string;
};

/**
 * Compile the interpreted Tracks into the same HyperFrames document the real
 * renderer photographs frame by frame, and hand it back as an `iframe` srcdoc.
 *
 * Nothing is approximated here: placement, stacking, clipping, motion and
 * material all come from the projection selected by the Run.
 */
export function renderPreview(input: RenderInput): string {
  const document = compileHyperframesDocument(input.composition, input.space);
  const html = materializeHyperframesHtml(document, (artifact) => {
    // The only Artifacts a preview can reference are files the author already
    // has. Anything else would be a Provider's output, which does not exist yet,
    // and failing loudly beats serving a picture with holes in it.
    if (input.served?.has(artifact.digest) !== true) {
      throw new Error(`Preview composition references Artifact ${artifact.digest}, which it cannot serve.`);
    }
    return `/__studio/material/${artifact.digest}`;
  });
  return injectRuntimeShim(html, input.audibleTrack);
}
