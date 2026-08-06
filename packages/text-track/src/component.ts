import type { ComponentPackage } from "@svml/component-kit";
import type {
  CompleteSemanticMap,
  NarrativeSelectionRef,
  ProgramSpace,
} from "@svml/contracts";
import type { StoredValue } from "@svml/protocol";
import { canonicalize } from "@svml/protocol";

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
  name: "@svml/text-track",
  producers: [{
    producer: textTrackProducers.createSet,
    implementationDigest: createTextTrackSetImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: { set: { kind: "inline", value: canonicalize(createTextTrackSet(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<TextTrackHeader>(inputs.header?.value, "TextTrackHeader"),
      )) } }, needs: {},
    }),
  }, {
    producer: textTrackProducers.appendFull,
    implementationDigest: appendFullTextItemImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: { set: { kind: "inline", value: canonicalize(appendFullTextItem(
        inline<TextTrackSet>(inputs.set?.value, "TextTrackSet"),
        inline<TextItemSpec>(inputs.spec?.value, "TextItemSpec"),
      )) } }, needs: {},
    }),
  }, {
    producer: textTrackProducers.appendSelected,
    implementationDigest: appendSelectedTextItemImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: { set: { kind: "inline", value: canonicalize(appendSelectedTextItem(
        inline<TextTrackSet>(inputs.set?.value, "TextTrackSet"),
        inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelection"),
        inline<TextItemSpec>(inputs.spec?.value, "TextItemSpec"),
      )) } }, needs: {},
    }),
  }, {
    producer: textTrackProducers.finalize,
    implementationDigest: finalizeTextTrackImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: { program: { kind: "inline", value: canonicalize(finalizeTextTrack(
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
