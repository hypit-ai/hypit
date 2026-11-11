import assert from "node:assert/strict";
import test from "node:test";

import { generationCanvasPresentationPackagesFromFacets } from "../../packages/generation-canvas/src/index.js";
import { generationNodePackagesFromFacets } from "../../packages/generation-graph/src/index.js";
import type {
  GenerationGraphInput,
  GenerationGraphNode,
  GenerationNodeAuthoringShape,
  GenerationOperationNodeDeclaration,
} from "../../packages/generation-graph/src/index.js";

import elevenLabs from "../../packages/elevenlabs-speech/src/activation.js";
import fishAudio from "../../packages/fishaudio-speech/src/activation.js";
import gptImage from "../../packages/gpt-image/src/activation.js";
import grokImagine from "../../packages/grok-imagine/src/activation.js";
import mediaAsset from "../../packages/media-asset-generation/src/activation.js";
import mimoSpeech from "../../packages/mimo-speech/src/activation.js";
import minimaxH3 from "../../packages/minimax-h3/src/activation.js";
import nanoBanana from "../../packages/nano-banana/src/activation.js";
import pixverse from "../../packages/pixverse/src/activation.js";
import seedance from "../../packages/seedance/src/activation.js";
import seedream from "../../packages/seedream/src/activation.js";
import volcengineMatting from "../../packages/volcengine-matting/src/activation.js";
import wan from "../../packages/wan/src/activation.js";

const contributions = [
  gptImage, nanoBanana, seedream, wan,
  seedance, grokImagine, pixverse, minimaxH3, volcengineMatting,
  mimoSpeech, elevenLabs, fishAudio,
  mediaAsset,
] as const;

function scalarValue(control: GenerationNodeAuthoringShape["controls"][number]): string | number | boolean {
  if (control.default !== undefined) return control.default as string | number | boolean;
  if (control.value.kind === "text") return "A concise authored test";
  if (control.value.kind === "enum") return control.value.values[0]!;
  if (control.value.kind === "number") return control.value.minimum ?? 1;
  return false;
}

function authorPort(
  shape: GenerationNodeAuthoringShape,
  id: string,
  inputs: Record<string, GenerationGraphInput>,
): boolean {
  const port = shape.ports.find((item) => item.id === id);
  if (port === undefined) return false;
  if (port.kind === "slot") {
    inputs[port.input] = { node: "fixture-media" };
    for (const field of port.itemFields ?? []) {
      if (field.default === undefined) continue;
      const input = field.input.kind === "sibling" ? field.input.name : `${port.input}.${field.name}`;
      inputs[input] = { value: field.default };
    }
    return true;
  }
  const entry = port.entries[0]!;
  inputs[`${entry.prefix}.1`] = { node: "fixture-media" };
  for (const field of entry.itemFields ?? []) {
    if (field.default === undefined) continue;
    const input = field.input.kind === "sibling" ? field.input.name : `${entry.prefix}.1.${field.name}`;
    inputs[input] = { value: field.default };
  }
  return true;
}

function authoredInputs(shape: GenerationNodeAuthoringShape): Record<string, GenerationGraphInput> {
  const inputs: Record<string, GenerationGraphInput> = {};
  const variant = shape.variant?.variants.find((item) => item.value === shape.variant?.default);
  const active = variant === undefined ? undefined : new Set(variant.active);
  if (shape.variant !== undefined) inputs[shape.variant.input] = { value: shape.variant.default };
  for (const control of shape.controls) {
    if (active !== undefined && !active.has(control.id)) continue;
    if (control.required || control.default !== undefined) inputs[control.input] = { value: scalarValue(control) };
  }
  for (const port of shape.ports) {
    if (active !== undefined && !active.has(port.id)) continue;
    if (port.kind === "slot" && port.required) inputs[port.input] = { node: "fixture-media" };
    if (port.kind === "list") {
      for (let index = 1; index <= port.minItems; index += 1) {
        inputs[`${port.entries[0]!.prefix}.${index}`] = { node: "fixture-media" };
      }
    }
  }
  if (variant?.requiresOneOf !== undefined && !variant.requiresOneOf.some((id) => {
    const port = shape.ports.find((item) => item.id === id);
    if (port === undefined) return false;
    return port.kind === "slot"
      ? inputs[port.input] !== undefined
      : port.entries.some((entry) => Object.keys(inputs).some((input) => input.startsWith(`${entry.prefix}.`)));
  })) {
    authorPort(shape, variant.requiresOneOf[0]!, inputs);
  }
  for (const rule of shape.rules ?? []) {
    if (rule.kind !== "atLeastOneOf" || rule.fields.some((name) => Object.keys(inputs).some((input) =>
      input === name || input.startsWith(`${name}.`)))) continue;
    const control = shape.controls.find((item) => item.input === rule.fields[0]);
    if (control !== undefined) inputs[control.input] = { value: scalarValue(control) };
  }
  return inputs;
}

test("every distributed media model contributes one runnable package-owned Canvas node", () => {
  const nodes = contributions.flatMap((contribution) =>
    generationNodePackagesFromFacets(contribution.facets).flatMap((item) => item.nodes));
  const presentations = contributions.flatMap((contribution) =>
    generationCanvasPresentationPackagesFromFacets(contribution.facets).flatMap((item) => item.nodes));
  const operations = nodes.filter((node): node is GenerationOperationNodeDeclaration => node.kind === "operation");
  assert.equal(operations.length, 21);
  assert.equal(presentations.length, 24, "21 models plus image/video/audio asset presentations");
  const presented = new Set(presentations.map((item) => JSON.stringify(item.using)));
  for (const declaration of operations) {
    assert(declaration.authoring !== undefined, `${declaration.using.name} has no authoring shape`);
    assert(presented.has(JSON.stringify(declaration.using)), `${declaration.using.name} has no Canvas presentation`);
    const node: GenerationGraphNode = {
      id: `test-${declaration.using.name.replace(/[^A-Za-z0-9]+/gu, "-")}`,
      using: declaration.using,
      inputs: authoredInputs(declaration.authoring),
    };
    const resolved = declaration.resolve({
      node,
      project: { format: "hypit.generation-graph@1", id: "catalog", name: "Catalog", revision: 0, nodes: [node] },
    });
    assert.equal(resolved.kind, "ready", `${declaration.using.name} did not close from its own declared authoring shape`);
  }
});
