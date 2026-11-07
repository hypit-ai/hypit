import { audiovisualTypes } from "@hypit/audiovisual";
import { audioProgramTypes } from "@hypit/audio-program";
import { sealGraphFragment } from "@hypit/author";
import type { FragmentOperation } from "@hypit/author";
import { mediaTypes } from "@hypit/media";

import { audiovisualAudioProducers, audiovisualAudioTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function sourceFold(count: number): { readonly operations: FragmentOperation[]; readonly result: string } {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Audiovisual Audio Fragment Source count must be a non-negative safe integer.");
  }
  const operations: FragmentOperation[] = [{
    id: "sources:create",
    producer: audiovisualAudioProducers.createSources,
    inputs: {},
    result: { kind: "output", name: "sources" },
  }];
  let result = "sources:create";
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index + 1).padStart(4, "0");
    const id = `sources:append:${suffix}`;
    operations.push({
      id,
      producer: audiovisualAudioProducers.appendSource,
      inputs: { sources: operation(result), source: input(`source-${suffix}`) },
      result: { kind: "output", name: "sources" },
    });
    result = id;
  }
  return { operations, result };
}

function sourceInputs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `source-${String(index + 1).padStart(4, "0")}`,
    type: audiovisualAudioTypes.source,
  }));
}

/** Close one Programme to the selected continuous Audio terminal. */
export function createAudiovisualAudioFragment(sourceCount: number) {
  const fold = sourceFold(sourceCount);
  return sealGraphFragment({
    inputs: [
      { name: "program", type: audiovisualTypes.program },
      { name: "output", type: audiovisualAudioTypes.output },
      ...sourceInputs(sourceCount),
    ],
    operations: [...fold.operations, {
      id: "program:compile",
      producer: audiovisualAudioProducers.compile,
      inputs: {
        program: input("program"),
        sources: operation(fold.result),
        output: input("output"),
      },
      result: { kind: "output", name: "program" },
    }],
    exports: [{ name: "program", type: audioProgramTypes.program, root: operation("program:compile") }],
  });
}

/** Publish one closed child Programme as a parent terminal Source implementation. */
export function createAudiovisualProgramAudioSourceFragment(sourceCount: number) {
  const fold = sourceFold(sourceCount);
  return sealGraphFragment({
    inputs: [
      { name: "program", type: audiovisualTypes.program },
      { name: "output", type: audiovisualAudioTypes.output },
      ...sourceInputs(sourceCount),
    ],
    operations: [...fold.operations, {
      id: "source:close",
      producer: audiovisualAudioProducers.programSource,
      inputs: {
        program: input("program"),
        sources: operation(fold.result),
        output: input("output"),
      },
      result: { kind: "output", name: "source" },
    }],
    exports: [{ name: "source", type: audiovisualAudioTypes.source, root: operation("source:close") }],
  });
}

export const preparedMediaAudioSourceFragment = sealGraphFragment({
  inputs: [
    { name: "media", type: mediaTypes.prepared },
    { name: "output", type: audiovisualAudioTypes.output },
  ],
  operations: [{
    id: "source",
    producer: audiovisualAudioProducers.preparedMediaSource,
    inputs: { media: input("media"), output: input("output") },
    result: { kind: "output", name: "source" },
  }],
  exports: [{ name: "source", type: audiovisualAudioTypes.source, root: operation("source") }],
});
