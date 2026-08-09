import assert from "node:assert/strict";
import test from "node:test";

import { artifactTypes } from "@narratage/artifact";
import { generationProducers, generationTypes } from "@narratage/generation";
import { narrativeTypes } from "@narratage/narrative";
import { digestOf } from "@narratage/protocol";
import { parseStructuredElement } from "@narratage/text";
import type { SurfaceResolvedReference } from "@narratage/text";

import mimoNodePackage from "../src/activation.js";
import {
  decodeMimoPresetSurface,
  decodeMimoVoiceCloneSurface,
  decodeMimoVoiceDesignSurface,
  mimoTtsEndpoints,
  mimoTtsPorts,
  sealMimoTtsRequest,
} from "../src/index.js";

function parsed(source: string) {
  return parseStructuredElement({ name: "mimo.svml", text: source }, 0).element;
}

function authored(path: string, type: SurfaceResolvedReference["type"], value: unknown): SurfaceResolvedReference {
  return {
    path,
    ref: { kind: "record", id: path },
    type,
    record: {
      id: path,
      type,
      value: type.name === artifactTypes.blob.name
        ? value as never
        : { kind: "inline", value: value as never },
      digest: digestOf(value),
      conformance: "exact",
      origin: { kind: "authored", sourceDigest: digestOf("mimo-source"), frontendClosureDigest: digestOf("mimo-frontend") },
    },
  };
}

const speech = {
  contract: "svml.narrative-speech-excerpt@1",
  kind: "segment",
  id: "opening",
  tokenStart: 0,
  tokenEndExclusive: 4,
  speech: "Exact authored words stay exact.",
};
const sample = { kind: "blob" as const, digest: digestOf("voice-sample"), size: 4, mediaType: "audio/wav" };
const refs = new Map<string, SurfaceResolvedReference>([
  ["story.segment.opening.speech", authored("story.segment.opening.speech", narrativeTypes.speechExcerpt, speech)],
  ["voice", authored("voice", artifactTypes.blob, sample)],
]);
const context = (source: string) => ({
  sourceName: "mimo.svml",
  element: parsed(source),
  resolveReference: (path: string) => refs.get(path),
  resolveAsset: () => { throw new Error("no asset"); },
});

test("MiMo declares three audio models without Provider facts", () => {
  assert.deepEqual(Object.values(mimoTtsPorts).map((ports) => ports.result), ["audio", "audio", "audio"]);
  assert.deepEqual(Object.values(mimoTtsEndpoints).map((endpoint) => endpoint.returns), [
    generationTypes.audioSet,
    generationTypes.audioSet,
    generationTypes.audioSet,
  ]);
  assert.equal(JSON.stringify(mimoTtsPorts).includes("xiaomimimo.com"), false);
  assert.equal(mimoTtsPorts["mimo-v2.5-tts"].ports.find((port) => port.name === "text")?.value.kind, "text");
  assert.equal("maxChars" in mimoTtsPorts["mimo-v2.5-tts"].ports[0]!.value, false);
  assert.throws(() => sealMimoTtsRequest("mimo-v2.5-tts-voicedesign", {
    text: ["Do not rewrite me."],
  }), /voiceDescription is required/u);
});

test("one installed author package contributes all three Surfaces without a Runtime Provider", () => {
  assert.equal(mimoNodePackage.name, "@narratage/mimo-tts");
  assert.equal(mimoNodePackage.modules[0]?.manifest.version, "1");
  assert.deepEqual(mimoNodePackage.modules[0]?.manifest.surfaces.map((surface) => surface.name),
    ["preset", "voiceDesign", "voiceClone"]);
  assert.equal(JSON.stringify(mimoNodePackage).includes("MIMO_API_KEY"), false);
});

test("the three author Surfaces are separate components with one ordinary audio output", async () => {
  const results = await Promise.all([
    decodeMimoPresetSurface(context(`<mimo:Preset id="preset" speech={story.segment.opening.speech} voice="Chloe">
      Warm, restrained delivery.
    </mimo:Preset>`)),
    decodeMimoVoiceDesignSurface(context(`<mimo:VoiceDesign id="designed" speech={story.segment.opening.speech}>
      A clear, confident young woman with a grounded conversational tone.
    </mimo:VoiceDesign>`)),
    decodeMimoVoiceCloneSurface(context(`<mimo:VoiceClone id="cloned" speech={story.segment.opening.speech} sample={voice}>
      Calm and direct.
    </mimo:VoiceClone>`)),
  ]);
  for (const result of results) {
    assert.equal(result.components.length, 1);
    assert.deepEqual(Object.keys(result.components[0]!.outputs), ["audio"]);
    assert.deepEqual(result.fragments[0]!.operations.map((operation) => operation.producer.name), [
      result.fragments[0]!.operations[0]!.producer.name,
      generationProducers.primaryAudio.name,
    ]);
    assert.equal(result.records[0]!.value.kind, "inline");
    const request = result.records[0]!.value.kind === "inline"
      ? result.records[0]!.value.value as Record<string, unknown> : {};
    assert.equal((request.ports as Record<string, unknown[]>).text?.[0], speech.speech);
    assert.equal(JSON.stringify(request).includes("optimize_text_preview"), false);
  }
});

test("voice clone refuses a non-audio sample before any Need exists", async () => {
  const wrong = { ...sample, mediaType: "video/mp4" };
  const invalid = new Map(refs);
  invalid.set("voice", authored("voice", artifactTypes.blob, wrong));
  assert.throws(() => decodeMimoVoiceCloneSurface({
    ...context('<mimo:VoiceClone id="bad" speech={story.segment.opening.speech} sample={voice}/>'),
    resolveReference: (path) => invalid.get(path),
  }), /must be audio/u);
});
