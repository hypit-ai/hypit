import type { ComponentPackage } from "@svml/component-kit";
import type { ProgramSpace } from "@svml/contracts";
import type { StoredValue } from "@svml/protocol";
import { canonicalize } from "@svml/protocol";

import { textTrackProducers } from "./manifest.js";
import {
  compileTextTrackImplementationDigest,
  compileTextTrackProgram,
  renderTextTrack,
  renderTextTrackImplementationDigest,
} from "./program.js";
import type { TextTrackProgram, TextTrackSpec } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const textTrackComponent = {
  name: "@svml/text-track",
  producers: [{
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
