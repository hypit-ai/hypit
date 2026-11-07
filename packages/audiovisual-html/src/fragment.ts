import { audiovisualTypes } from "@hypit/audiovisual";
import { sealGraphFragment } from "@hypit/author";
import type { FragmentOperation } from "@hypit/author";
import { htmlProgramTypes } from "@hypit/html-program";
import { mediaTypes } from "@hypit/media";

import { audiovisualHtmlProducers, audiovisualHtmlTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function sourceFold(count: number): { readonly operations: FragmentOperation[]; readonly result: string } {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Audiovisual HTML Fragment Source count must be a non-negative safe integer.");
  }
  const operations: FragmentOperation[] = [{
    id: "sources:create",
    producer: audiovisualHtmlProducers.createSources,
    inputs: {},
    result: { kind: "output", name: "sources" },
  }];
  let result = "sources:create";
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index + 1).padStart(4, "0");
    const id = `sources:append:${suffix}`;
    operations.push({
      id,
      producer: audiovisualHtmlProducers.appendSource,
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
    type: audiovisualHtmlTypes.source,
  }));
}

export function createAudiovisualHtmlFragment(sourceCount: number) {
  const fold = sourceFold(sourceCount);
  return sealGraphFragment({
    inputs: [
      { name: "program", type: audiovisualTypes.program },
      { name: "output", type: audiovisualHtmlTypes.output },
      ...sourceInputs(sourceCount),
    ],
    operations: [...fold.operations, {
      id: "program:compile",
      producer: audiovisualHtmlProducers.compile,
      inputs: {
        program: input("program"),
        sources: operation(fold.result),
        output: input("output"),
      },
      result: { kind: "output", name: "program" },
    }],
    exports: [{ name: "program", type: htmlProgramTypes.program, root: operation("program:compile") }],
  });
}

export function createAudiovisualProgramHtmlSourceFragment(sourceCount: number) {
  const fold = sourceFold(sourceCount);
  return sealGraphFragment({
    inputs: [
      { name: "program", type: audiovisualTypes.program },
      ...sourceInputs(sourceCount),
    ],
    operations: [...fold.operations, {
      id: "source:close",
      producer: audiovisualHtmlProducers.programSource,
      inputs: { program: input("program"), sources: operation(fold.result) },
      result: { kind: "output", name: "source" },
    }],
    exports: [{ name: "source", type: audiovisualHtmlTypes.source, root: operation("source:close") }],
  });
}

export const preparedMediaHtmlSourceFragment = sealGraphFragment({
  inputs: [{ name: "media", type: mediaTypes.prepared }],
  operations: [{
    id: "source",
    producer: audiovisualHtmlProducers.preparedMediaSource,
    inputs: { media: input("media") },
    result: { kind: "output", name: "source" },
  }],
  exports: [{ name: "source", type: audiovisualHtmlTypes.source, root: operation("source") }],
});
