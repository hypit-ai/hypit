import assert from "node:assert/strict";
import test from "node:test";

import type { GenerationGraphProject } from "@hypit/hypit/generation-graph";
import { createNodeGenerationGraphProjectHost } from "@hypit/hypit/generation-graph/node";
import { generationProducers } from "@hypit/generation";

import blobPackage from "../../blob/src/activation.js";
import generationPackage from "../../generation/src/activation.js";
import promptPackage from "../../prompt/src/activation.js";
import seedancePackage from "../../seedance/src/activation.js";
import { seedanceGenerationNodes } from "../../seedance/src/generation.js";
import { seedanceEndpointsByModel } from "../../seedance/src/index.js";
import textPackage from "../../text/src/activation.js";
import gptImagePackage from "../src/activation.js";
import {
  gptImageGenerationNode,
  gptImageGenerationNodes,
} from "../src/generation.js";
import { gptImageEndpoints } from "../src/index.js";

function installedPackages() {
  return [
    { specifier: "@hypit/blob", contribution: blobPackage },
    { specifier: "@hypit/generation", contribution: generationPackage },
    { specifier: "@hypit/text", contribution: textPackage },
    { specifier: "@hypit/prompt", contribution: promptPackage },
    { specifier: "@hypit/gpt-image", contribution: gptImagePackage },
    { specifier: "@hypit/seedance", contribution: seedancePackage },
  ];
}

test("GPT Image contributes its exact model node from its own package", () => {
  const nodes = gptImagePackage.facets.flatMap((facet) =>
    facet.abi === "hypit.generation-node-package@1"
      ? (facet as { implementation: { nodes: readonly unknown[] } }).implementation.nodes
      : []);
  assert.deepEqual(nodes, [gptImageGenerationNode]);
  assert.deepEqual(gptImageGenerationNode.using, gptImageGenerationNodes.image);
});

test("two GPT Image nodes feed one Seedance reference-video without duplicating the shared image", async () => {
  const project: GenerationGraphProject = {
    format: "hypit.generation-graph@1",
    id: "generated-reference-shot",
    name: "Generated reference shot",
    revision: 0,
    nodes: [{
      id: "holding",
      using: gptImageGenerationNodes.image,
      inputs: {
        prompt: { value: "A presenter holding the product, editorial photography." },
        aspectRatio: { value: "9:16" },
        resolution: { value: "2K" },
      },
    }, {
      id: "walking",
      using: gptImageGenerationNodes.image,
      inputs: {
        prompt: { value: "The same presenter walking through the studio." },
        aspectRatio: { value: "9:16" },
        resolution: { value: "2K" },
        "images.1": { node: "holding" },
      },
    }, {
      id: "motion",
      using: seedanceGenerationNodes["seedance-2.5"],
      inputs: {
        mode: { value: "references" },
        prompt: { value: "A continuous camera move connects both poses." },
        duration: { value: 6 },
        aspectRatio: { value: "9:16" },
        "referenceImage.1": { node: "holding" },
        "referenceImage.1.personReference": { value: true },
        "referenceImage.2": { node: "walking" },
        "referenceImage.2.personReference": { value: true },
      },
    }],
  };
  const host = createNodeGenerationGraphProjectHost({ packages: installedPackages() });
  const prepared = await host.prepare(project, ["motion"]);
  const producers = prepared.definition.plan.steps.map((step) => step.producer.name);
  assert.equal(producers.filter((name) => name === gptImageEndpoints.image!.producer.name).length, 2);
  assert.equal(producers.filter((name) =>
    name === seedanceEndpointsByModel["seedance-2.5"].producer.name).length, 1);
  assert.equal(producers.filter((name) => name === generationProducers.primaryImage.name).length, 2);
  assert.equal(producers.filter((name) => name === generationProducers.primaryVideo.name).length, 1);
  assert.deepEqual(prepared.generated.map((item) => item.node).sort(), ["holding", "motion", "walking"]);
  assert.deepEqual(prepared.executionPackages, ["@hypit/gpt-image", "@hypit/seedance"]);
});
