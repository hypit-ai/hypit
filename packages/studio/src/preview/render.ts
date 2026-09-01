import type { AudioTrack, Composition } from "@hypit/composition";
import { compileHyperframesDocument, materializeHyperframesHtml } from "@hypit/hyperframes";
import type { ProgramSpace } from "@hypit/program-space";

import { injectRuntimeShim } from "./runtime-shim.js";

export type RenderInput = {
  readonly composition: Composition;
  readonly space: ProgramSpace;
  /** Resources Studio can serve for material selected by the Run. */
  readonly served?: ReadonlySet<string>;
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
    if (input.served?.has(artifact.resource) !== true) {
      throw new Error(`Preview composition references Artifact ${artifact.resource}, which it cannot serve.`);
    }
    return `/__studio/material/${artifact.resource}`;
  });
  const audio = input.composition.tracks
    .filter((track): track is AudioTrack => track.kind === "audio")
    .flatMap((track) => track.clips)
    .map((clip) => {
      if (input.served?.has(clip.artifact.resource) !== true) {
        throw new Error(`Preview audio references Artifact ${clip.artifact.resource}, which it cannot serve.`);
      }
      return `<audio class="hypit-studio-audio" preload="auto"
      src="/__studio/material/${clip.artifact.resource}"
      data-start="${clip.target.startSample / 48_000}"
      data-duration="${(clip.target.endSampleExclusive - clip.target.startSample) / 48_000}"
      data-media-start="${clip.source.startSample / 48_000}"
      data-media-end="${clip.source.endSampleExclusive / 48_000}"
      data-loop="${clip.source.loop}"
      data-phase="${clip.source.phaseSample / 48_000}"
      data-playback-rate="${clip.playbackRate}"
      data-gain="${clip.gain}"></audio>`;
    }).join("");
  return injectRuntimeShim(html, audio);
}
