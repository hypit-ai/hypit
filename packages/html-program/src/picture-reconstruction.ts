import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";

export const HTML_PICTURE_RECONSTRUCTION_FORMAT = "hypit.html-picture-reconstruction@1" as const;

/** Discrete-frame reconstruction that the portable HTML terminal can execute exactly. */
export type HtmlPictureReconstruction = {
  readonly kind: "nearest";
};

export type HtmlPictureReconstructionProgram = {
  readonly format: typeof HTML_PICTURE_RECONSTRUCTION_FORMAT;
  readonly payload: { readonly kind: "nearest" };
  readonly artifacts: readonly BlobRef[];
};

/** Package-facing programme envelope; it is structurally a SignalOperatorProgram. */
export function htmlNearestPictureReconstruction(): HtmlPictureReconstructionProgram {
  return {
    format: HTML_PICTURE_RECONSTRUCTION_FORMAT,
    payload: canonicalize({ kind: "nearest" }) as unknown as { readonly kind: "nearest" },
    artifacts: [],
  };
}

export function readHtmlPictureReconstruction(program: {
  readonly format: string;
  readonly payload: { readonly [key: string]: CanonicalValue };
  readonly artifacts: readonly BlobRef[];
}): HtmlPictureReconstruction {
  if (program.format !== HTML_PICTURE_RECONSTRUCTION_FORMAT) {
    throw new Error(`HTML Picture terminal does not support reconstruction format ${program.format}.`);
  }
  if (program.artifacts.length !== 0 || Object.keys(program.payload).length !== 1
    || program.payload.kind !== "nearest") {
    throw new Error("HTML Picture reconstruction programme is invalid.");
  }
  return { kind: "nearest" };
}
