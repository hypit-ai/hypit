import type { ValueSchema } from "@hypit/hypit/protocol";

import {
  visualBoxSchema,
  visualElementSchema,
  visualImageSchema,
  visualMaskSchema,
  visualPathCommandSchema,
  visualProgramSchema,
  visualSurfaceSchema,
  visualTextDocumentSchema,
  visualTextFlowSchema,
  visualTextPaintSchema,
  visualTextSchema,
  visualTextTypographySchema,
  visualTrackSchema,
  visualVideoSchema,
} from "./schema.js";

/** Named values and invariants owned by Composition, presented by any author-inspection surface. */
export const visualCompositionVocabulary: {
  readonly shapes: Readonly<Record<string, ValueSchema>>;
  readonly rules: readonly string[];
} = {
  shapes: {
    "visual-track": visualTrackSchema,
    "visual-element": visualElementSchema,
    program: visualProgramSchema,
    box: visualBoxSchema,
    mask: visualMaskSchema,
    text: visualTextSchema,
    image: visualImageSchema,
    video: visualVideoSchema,
    surface: visualSurfaceSchema,
    "text-flow": visualTextFlowSchema,
    "text-typography": visualTextTypographySchema,
    "text-paint": visualTextPaintSchema,
    "text-document": visualTextDocumentSchema,
    "path-command": visualPathCommandSchema,
  },
  rules: [
    "A Present owns exactly one recursive root; Box children, Mask branches and Program slots contain their descendants directly.",
    "Element ids are unique within one Present for identity only; Box child arrays carry back-to-front paint order.",
    "Mask owns explicit mask and content branches, while Program owns uniquely named role slots whose order has no paint meaning.",
    "A child's position is measured from its parent's box, not from the Canvas.",
    "An animation carries at least two keyframes, and every keyframe of one animation declares the same properties; `atFrame` is Present-relative.",
    "A plain text element provides exact ordered font artifacts and cannot combine them with raw `font`, `font-family`, `font-style`, `font-synthesis` or `font-weight` styles.",
    "A text element using glyph Paint cannot also declare raw stroke or paint-order styles.",
    "An image owns one image Artifact; a video owns one selected PreparedVisualSource and an exact occurrence-local sampling relation.",
    "A Surface with still timing cannot carry sampling; frame-based Surface sampling must match its typed timing.",
    "A Mask source is one owned terminal text, image or still Surface; its content remains an ordinary owned subtree.",
    "An Audio source node owns one selected PreparedAudioSource, its preparation relation and its occurrence-local sampling relation; unrelated visual facts never enter the audio graph.",
  ],
};
