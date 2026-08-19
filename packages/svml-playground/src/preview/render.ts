import { sealComposition } from "@hypit/composition";
import type { Composition, Track } from "@hypit/composition";
import { compileHyperframesDocument, materializeHyperframesHtml } from "@hypit/hyperframes";
import type { ProgramSpace } from "@hypit/program-space";

import { injectRuntimeShim } from "./runtime-shim.js";

export type RenderInput = {
  readonly id: string;
  readonly canvas: Composition["canvas"];
  readonly space: ProgramSpace;
  readonly tracks: readonly Track[];
  /** Digests the Playground can serve, for material an author already has. */
  readonly served?: ReadonlySet<string>;
  /** The Track whose material carries the programme's speech. */
  readonly audibleTrack?: string;
};

/**
 * Compile the interpreted Tracks into the same HyperFrames document the real
 * renderer photographs frame by frame, and hand it back as an `iframe` srcdoc.
 *
 * Nothing is approximated here: the placement, stacking, clipping and motion are
 * the renderer's own, and only the material inside each box is a placeholder.
 */
export function renderPreview(input: RenderInput): string {
  const document = compileHyperframesDocument(sealComposition({
    id: input.id,
    canvas: input.canvas,
    tracks: input.tracks,
  }), input.space);
  const html = materializeHyperframesHtml(document, (artifact) => {
    // The only Artifacts a preview can reference are files the author already
    // has. Anything else would be a Provider's output, which does not exist yet,
    // and failing loudly beats serving a picture with holes in it.
    if (input.served?.has(artifact.digest) !== true) {
      throw new Error(`Preview composition references Artifact ${artifact.digest}, which it cannot serve.`);
    }
    return `/__svml/material/${artifact.digest}`;
  });
  return injectRuntimeShim(html, input.audibleTrack);
}
