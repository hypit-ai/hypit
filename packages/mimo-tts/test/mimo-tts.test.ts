import assert from "node:assert/strict";
import test from "node:test";

import { generationProducers, generationTypes } from "@hypit/generation";
import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";
import { sealText, textTypes } from "@hypit/text";

import mimoNodePackage from "../src/activation.js";
import {
  decodeMimoVoiceDesignSurface,
  mimoTtsEndpoints,
  mimoTtsMarkupSurfaces,
  mimoTtsModels,
  mimoTtsPorts,
  sealMimoTtsRequest,
} from "../src/index.js";

function parsed(source: string) {
  return parseStructuredElement({ name: "mimo.svml", text: source }, 0).element;
}

const speech = sealText("Exact authored words stay exact.");
const reference: SurfaceResolvedReference = {
  path: "story.segment.opening.speech",
  ref: { kind: "record", id: "story.segment.opening.speech" },
  type: textTypes.text,
  record: {
    id: "story.segment.opening.speech",
    type: textTypes.text,
    value: { kind: "inline", value: speech },
  },
};
const context = (source: string) => ({
  sourceName: "mimo.svml",
  element: parsed(source),
  resolveReference: (path: string) => path === reference.path ? reference : undefined,
  resolveAsset: () => { throw new Error("no asset"); },
});

test("MiMo declares only the VoiceDesign audio model without Provider facts", () => {
  assert.deepEqual(mimoTtsModels, ["mimo-v2.5-tts-voicedesign"]);
  assert.deepEqual(Object.values(mimoTtsPorts).map((ports) => ports.result), ["audio"]);
  assert.deepEqual(Object.values(mimoTtsEndpoints).map((endpoint) => endpoint.returns), [generationTypes.audioSet]);
  assert.equal(JSON.stringify(mimoTtsPorts).includes("xiaomimimo.com"), false);
  assert.throws(() => sealMimoTtsRequest("mimo-v2.5-tts-voicedesign", {
    text: ["Do not rewrite me."],
  }), /voiceDescription is required/u);
});

test("the installed author package contributes only VoiceDesign", () => {
  assert.equal(mimoNodePackage.format, "hypit.node-package@1");
  assert.equal(mimoNodePackage.modules[0]?.manifest.version, "1");
  assert.deepEqual(mimoTtsMarkupSurfaces.map((surface) => surface.name), ["voiceDesign"]);
  assert.equal(JSON.stringify(mimoNodePackage).includes("MIMO_API_KEY"), false);
});

test("VoiceDesign produces one ordinary audio output", async () => {
  const result = await decodeMimoVoiceDesignSurface(context(`<mimo:VoiceDesign id="designed" speech={story.segment.opening.speech}>
    A clear, confident young woman with a grounded conversational tone.
  </mimo:VoiceDesign>`));
  assert.equal(result.components.length, 1);
  assert.deepEqual(Object.keys(result.components[0]!.outputs), ["audio"]);
  assert.deepEqual(result.fragments[0]!.operations.map((operation) => operation.producer.name), [
    "bind-request-mimo-v2.5-tts-voicedesign-text-text",
    "finalize-request-mimo-v2.5-tts-voicedesign",
    "request-mimo-v2.5-tts-voicedesign",
    generationProducers.primaryAudio.name,
  ]);
  assert.equal(result.records[0]!.value.kind, "inline");
  const request = result.records[0]!.value.kind === "inline"
    ? result.records[0]!.value.value as Record<string, unknown> : {};
  assert.equal((request.ports as Record<string, unknown[]>).text, undefined);
  assert.deepEqual(result.components[0]!.inputs["speech:text"], {
    kind: "record",
    id: "story.segment.opening.speech",
  });
  assert.equal(JSON.stringify(request).includes("optimize_text_preview"), false);
});
