import {
  compileHyperframesDocument,
  materializeHyperframesHtml,
  programSpaceFrameCount,
  sealComposition,
} from "../svml.js";
import type { Composition, ProgramSpace, Track } from "../svml.js";
import { injectRuntimeShim } from "./runtime-shim.js";

export type PreviewOutput = {
  readonly srcdoc: string;
  readonly frameCount: number;
  readonly fps: number;
  readonly canvas: { readonly width: number; readonly height: number };
};

export function renderPreview(input: {
  readonly id: string;
  readonly canvas: Composition["canvas"];
  readonly programSpace: ProgramSpace;
  readonly tracks: readonly Track[];
}): PreviewOutput {
  const document = compileHyperframesDocument(sealComposition({
    contract: "svml.composition@1",
    id: input.id,
    canvas: input.canvas,
    tracks: input.tracks,
  }), input.programSpace);
  const html = materializeHyperframesHtml(document, (artifact) =>
    `/__caption/artifact/${artifact.digest}`);
  return {
    srcdoc: injectRuntimeShim(html),
    frameCount: programSpaceFrameCount(input.programSpace),
    fps: input.programSpace.frameRate.numerator / input.programSpace.frameRate.denominator,
    canvas: document.canvas,
  };
}
