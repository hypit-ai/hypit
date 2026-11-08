import assert from "node:assert/strict";
import test from "node:test";

import blobPackage from "../../blob/src/activation.js";
import generationPackage from "../../generation/src/activation.js";
import promptPackage from "../../prompt/src/activation.js";
import textPackage from "../../text/src/activation.js";
import {
  createGenerationNodePackageFacet,
  type GenerationGraphProject,
} from "@hypit/hypit/generation-graph";
import { createNodeGenerationGraphProjectHost } from "@hypit/hypit/generation-graph/node";
import { blobTypes } from "@hypit/blob";

import mimoPackage from "../src/activation.js";
import {
  mimoSpeechEndpoints,
} from "../src/index.js";
import { mimoSpeechGenerationNodes } from "../src/generation.js";

const audioValueUsing = {
  module: { name: "@test/mimo-values", version: "1" },
  name: "audio",
} as const;

function installedPackages() {
  return [
    { specifier: "@hypit/blob", contribution: blobPackage },
    { specifier: "@hypit/generation", contribution: generationPackage },
    { specifier: "@hypit/text", contribution: textPackage },
    { specifier: "@hypit/prompt", contribution: promptPackage },
    { specifier: "@hypit/mimo-speech", contribution: mimoPackage },
    { specifier: "@test/mimo-values", contribution: {
      format: "hypit.package@1" as const,
      facets: [createGenerationNodePackageFacet({ nodes: [{
        kind: "value",
        using: audioValueUsing,
        inputs: ["audio"],
        type: blobTypes.blob,
        load: ({ inputs }) => inputs.audio!,
      }] })],
    } },
  ];
}

test("MiMo contributes graph-native VoiceDesign and VoiceClone nodes", () => {
  const nodes = mimoPackage.facets.flatMap((facet) =>
    facet.abi === "hypit.generation-node-package@1"
      ? (facet as { implementation: { nodes: readonly { using: { name: string } }[] } }).implementation.nodes
      : []);
  assert.deepEqual(nodes.map((node) => node.using.name), [
    "mimo-v2.5-tts-voicedesign.audio",
    "mimo-v2.5-tts-voiceclone.audio",
  ]);
});

test("two authored speech nodes lower through the same generation graph as media models", async () => {
  const project: GenerationGraphProject = {
    format: "hypit.generation-graph@1",
    id: "two-voices",
    name: "Two voices",
    revision: 0,
    nodes: [{
      id: "alice-voice",
      using: mimoSpeechGenerationNodes.voiceDesign,
      inputs: {
        speech: { value: "The exact authored line stays intact." },
        voiceDescription: { value: "A quick, confident young woman with playful precision." },
      },
    }, {
      id: "reference",
      using: audioValueUsing,
      inputs: { audio: { value: {
        kind: "blob", resource: "res_voice", size: 8, mediaType: "audio/wav",
      } } },
    }, {
      id: "bob-voice",
      using: mimoSpeechGenerationNodes.voiceClone,
      inputs: {
        speech: { value: "A second exact line is generated independently." },
        instruction: { value: "Dry, amused and conversational." },
        voiceReference: { node: "reference" },
      },
    }],
  };
  const prepared = await createNodeGenerationGraphProjectHost({
    packages: installedPackages(),
    assets: {
      readAsset: () => new Uint8Array(),
      resolveAsset: () => { throw new Error("The test value closes over its authored Blob."); },
      attachments: () => [],
    },
  })
    .prepare(project, ["alice-voice", "bob-voice"]);
  assert.deepEqual(prepared.generated.map((item) => item.node).sort(), ["alice-voice", "bob-voice"]);
  assert.deepEqual(prepared.executionPackages, ["@hypit/mimo-speech"]);
  assert.deepEqual(prepared.definition.plan.steps.filter((step) =>
    step.producer.name === mimoSpeechEndpoints.voiceDesign.producer.name
      || step.producer.name === mimoSpeechEndpoints.voiceClone.producer.name)
    .map((step) => step.producer.name).sort(), [
    mimoSpeechEndpoints.voiceClone.producer.name,
    mimoSpeechEndpoints.voiceDesign.producer.name,
  ].sort());
});

test("MiMo graph nodes reject hidden or mistyped author inputs before submission", async () => {
  const host = createNodeGenerationGraphProjectHost({ packages: installedPackages() });
  const invalid: GenerationGraphProject = {
    format: "hypit.generation-graph@1",
    id: "invalid-voice",
    name: "Invalid voice",
    revision: 0,
    nodes: [{
      id: "voice",
      using: mimoSpeechGenerationNodes.voiceDesign,
      inputs: {
        speech: { value: "Speak this." },
        voiceDescription: { value: "Clear and direct." },
        provider: { value: "must-not-live-in-the-recipe" },
      },
    }],
  };
  await assert.rejects(async () => await host.prepare(invalid, ["voice"]), /unknown input provider/u);
});
