import { artifactTypes } from "@hypit/artifact";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation } from "@hypit/elaborator";
import { textTypes } from "@hypit/text";

import type { GeminiModel } from "./manifest.js";
import { geminiProducers, geminiTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createGeminiFragment(model: GeminiModel, mediaCount: number) {
  if (!Number.isSafeInteger(mediaCount) || mediaCount < 0) throw new Error("Gemini media count is invalid");
  const inputs = [
    { name: "instruction", type: textTypes.text },
    { name: "prompt", type: textTypes.text },
    ...Array.from({ length: mediaCount }, (_item, index) => ({
      name: `media-${String(index + 1).padStart(4, "0")}`,
      type: artifactTypes.blob,
    })),
  ];
  const operations: FragmentOperation[] = [{
    id: "start-request", producer: geminiProducers.start,
    inputs: { instruction: input("instruction"), prompt: input("prompt") },
    result: { kind: "output" as const, name: "draft" },
  }];
  let draft = operation("start-request");
  for (let index = 0; index < mediaCount; index += 1) {
    const id = `bind-media-${String(index + 1).padStart(4, "0")}`;
    operations.push({
      id, producer: geminiProducers.bindMedia,
      inputs: { draft, media: input(`media-${String(index + 1).padStart(4, "0")}`) },
      result: { kind: "output" as const, name: "draft" },
    });
    draft = operation(id);
  }
  operations.push({
    id: "finalize-request", producer: geminiProducers.finalize, inputs: { draft },
    result: { kind: "output" as const, name: "request" },
  });
  operations.push({
    id: "generate", producer: geminiProducers[model], inputs: { request: operation("finalize-request") },
    result: { kind: "need" as const, name: "text" },
  });
  return sealGraphFragment({
    inputs,
    operations,
    exports: [{ name: "text", type: textTypes.text, root: operation("generate") }],
  });
}
