import {
  compileHyperframesDocument,
  materializeHyperframesHtml,
  programSpaceFrameCount,
  sealComposition,
} from "../svml.js";
import type { Composition, ProgramSpace, Track } from "../svml.js";
import { injectRuntimeShim } from "./runtime-shim.js";

/** A grey card standing in for an Artifact the playground has not been given. */
const MISSING_MEDIA = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">`
  + `<rect width="320" height="180" fill="#26262b"/>`
  + `<text x="160" y="96" fill="#8b8b94" font-family="sans-serif" font-size="15"`
  + ` text-anchor="middle">media not set</text></svg>`,
)}`;

export type PreviewInput = {
  readonly id: string;
  readonly canvas: Composition["canvas"];
  readonly programSpace: ProgramSpace;
  readonly tracks: readonly Track[];
};

export type PreviewOutput = {
  readonly srcdoc: string;
  readonly frameCount: number;
  readonly fps: number;
  /** The document's own frame size — what the stage must not let reflow. */
  readonly canvas: { readonly width: number; readonly height: number };
  readonly warnings: readonly string[];
};

/**
 * Composition to something an iframe can show.
 *
 * The seal and compile steps are the compiler's own, so anything the real Build
 * would reject is rejected here too — with the same message. Callers surface the
 * throw next to the form rather than clearing the stage.
 */
export function renderPreview(input: PreviewInput): PreviewOutput {
  const composition = sealComposition({
    contract: "svml.composition@1",
    id: input.id,
    canvas: input.canvas,
    tracks: input.tracks,
  });
  const document = compileHyperframesDocument(composition, input.programSpace);

  const warnings: string[] = [];
  const html = materializeHyperframesHtml(document, (artifact) => {
    // Artifact fulfillment belongs to a normal author/run graph. The low-level
    // component inspector owns no parallel registry of files or fixtures.
    warnings.push(`No media registered for ${artifact.digest.slice(0, 19)}…`);
    return MISSING_MEDIA;
  });

  const { numerator, denominator } = input.programSpace.frameRate;
  return {
    srcdoc: injectRuntimeShim(html),
    frameCount: programSpaceFrameCount(input.programSpace),
    fps: numerator / denominator,
    canvas: document.canvas,
    warnings,
  };
}
