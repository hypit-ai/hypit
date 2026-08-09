import type { ComponentPackage } from "@narratage/component-kit";
import type { NarrativeSelection, NarrativeSelectionRef } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { SpatialFrame } from "@narratage/spatial";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import { textTrackProducers } from "./manifest.js";
import {
  appendFullTextItem,
  appendFullTextItemImplementationDigest,
  appendSelectedTextItem,
  appendSelectedTextItemImplementationDigest,
  compileTextTrackImplementationDigest,
  compileTextTrackProgram,
  createTextTrackSet,
  createTextTrackSetImplementationDigest,
  finalizeTextTrack,
  finalizeTextTrackImplementationDigest,
  renderTextTrack,
  renderTextTrackImplementationDigest,
} from "./program.js";
import type {
  TextItemSpec,
  TextTrackHeader,
  TextTrackProgram,
  TextTrackSet,
  TextTrackSpec,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const textTrackComponent = {
  name: "@narratage/text-track",
  producers: [{
    producer: textTrackProducers.createSet,
    implementationDigest: createTextTrackSetImplementationDigest,
    handler: () => ({
      outputs: { set: { kind: "inline", value: canonicalize(createTextTrackSet()) } }, needs: {},
    }),
  }, {
    producer: textTrackProducers.appendFull,
    implementationDigest: appendFullTextItemImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: { set: { kind: "inline", value: canonicalize(appendFullTextItem(
        inline<TextTrackSet>(inputs.set?.value, "TextTrackSet"),
        inline<TextTrackHeader>(inputs.header?.value, "TextTrackHeader"),
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
        inline<TextItemSpec>(inputs.spec?.value, "TextItemSpec"),
      )) } }, needs: {},
    }),
  }, {
    producer: textTrackProducers.appendSelected,
    implementationDigest: appendSelectedTextItemImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: { set: { kind: "inline", value: canonicalize(appendSelectedTextItem(
        inline<TextTrackSet>(inputs.set?.value, "TextTrackSet"),
        inline<TextTrackHeader>(inputs.header?.value, "TextTrackHeader"),
        inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelection"),
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
        inline<TextItemSpec>(inputs.spec?.value, "TextItemSpec"),
      )) } }, needs: {},
    }),
  }, {
    producer: textTrackProducers.finalize,
    implementationDigest: finalizeTextTrackImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: { program: { kind: "inline", value: canonicalize(finalizeTextTrack(
        inline<TextTrackHeader>(inputs.header?.value, "TextTrackHeader"),
        inline<TextTrackSet>(inputs.set?.value, "TextTrackSet"),
      )) } }, needs: {},
    }),
  }, {
    producer: textTrackProducers.compile,
    implementationDigest: compileTextTrackImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: { program: { kind: "inline", value: canonicalize(compileTextTrackProgram(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TextTrackSpec>(inputs.spec?.value, "TextTrackSpec"),
      )) } },
      needs: {},
    }),
  }, {
    producer: textTrackProducers.render,
    implementationDigest: renderTextTrackImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: { track: { kind: "inline", value: canonicalize(renderTextTrack(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TextTrackProgram>(inputs.program?.value, "TextTrackProgram"),
      )) } },
      needs: {},
    }),
  }],
} satisfies ComponentPackage;
