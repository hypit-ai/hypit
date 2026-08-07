import type { ComponentPackage } from "@narratage/component-kit";
import type { NarrativeSelection, NarrativeSelectionRef } from "@narratage/narrative";
import type { SynchronizedMedia } from "@narratage/media";
import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import { brollProducers } from "./manifest.js";
import {
  appendBrollItem,
  appendBrollItemImplementationDigest,
  createBrollSet,
  createBrollSetImplementationDigest,
  finalizeBrollProgram,
  finalizeBrollProgramImplementationDigest,
} from "./author.js";
import {
  compileBrollImplementationDigest,
  compileBrollProduct,
  projectBrollAudio,
  projectBrollAudioImplementationDigest,
  projectBrollVisual,
  projectBrollVisualImplementationDigest,
} from "./program.js";
import type { BrollItemSpec, BrollProduct, BrollProgram, BrollSet, BrollTrackSpec } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const brollComponent = {
  name: "@narratage/broll",
  producers: [
    {
      producer: brollProducers.createSet,
      implementationDigest: createBrollSetImplementationDigest,
      handler: () => ({
        outputs: { set: { kind: "inline", value: canonicalize(createBrollSet()) } }, needs: {},
      }),
    },
    {
      producer: brollProducers.appendItem,
      implementationDigest: appendBrollItemImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { set: { kind: "inline", value: canonicalize(appendBrollItem(
          inline<BrollSet>(inputs.set?.value, "BrollSet"),
          inline<BrollTrackSpec>(inputs.track?.value, "BrollTrackSpec"),
          inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
          inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
          inline<SynchronizedMedia>(inputs.media?.value, "SynchronizedMedia"),
          inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelection"),
          inline<BrollItemSpec>(inputs.spec?.value, "BrollItemSpec"),
        )) } }, needs: {},
      }),
    },
    {
      producer: brollProducers.finalize,
      implementationDigest: finalizeBrollProgramImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { program: { kind: "inline", value: canonicalize(finalizeBrollProgram(
          inline<BrollSet>(inputs.set?.value, "BrollSet"),
          inline<BrollTrackSpec>(inputs.track?.value, "BrollTrackSpec"),
        )) } }, needs: {},
      }),
    },
    {
      producer: brollProducers.compile,
      implementationDigest: compileBrollImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { product: { kind: "inline", value: canonicalize(compileBrollProduct(
          inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<BrollProgram>(inputs.program?.value, "BrollProgram"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: brollProducers.projectVisual,
      implementationDigest: projectBrollVisualImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { visual: { kind: "inline", value: canonicalize(projectBrollVisual(inline<BrollProduct>(inputs.product?.value, "BrollProduct"))) } },
        needs: {},
      }),
    },
    {
      producer: brollProducers.projectAudio,
      implementationDigest: projectBrollAudioImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { audio: { kind: "inline", value: canonicalize(projectBrollAudio(inline<BrollProduct>(inputs.product?.value, "BrollProduct"))) } },
        needs: {},
      }),
    },
  ],
} satisfies ComponentPackage;
