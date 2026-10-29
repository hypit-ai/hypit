import type { ValueSchema } from "@hypit/hypit/protocol";

import {
  visualElementSchema,
  visualImageSchema,
  visualMaskSchema,
  visualPathCommandSchema,
  visualProgramSchema,
  visualProcessSchema,
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
    process: visualProcessSchema,
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
    "A Present owns exactly one typed root or package-owned Programme; a Visual Process owns named, independently timed picture contributions and a package-owned Programme.",
    "Element ids are unique within one Present for identity only. Layout, paint order, attributes and animation belong to the selected Programme package.",
    "Mask owns explicit mask and content branches, while Program owns uniquely named typed slots whose order has no paint meaning.",
    "Typed text owns exact font artifacts and semantic typography or paint. Renderer-specific HTML and CSS remain inside the HTML Programme.",
    "An image owns one image Artifact; a video owns one selected PreparedVisualSource and an exact occurrence-local sampling relation.",
    "A Surface with still timing cannot carry sampling; frame-based Surface sampling must match its typed timing.",
    "A Mask source is one typed visual element or package-owned Programme; its content remains an ordinary owned subtree.",
    "An Audio source node owns one selected PreparedAudioSource, its preparation relation and its occurrence-local sampling relation; unrelated visual facts never enter the audio graph.",
  ],
};
