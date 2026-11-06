import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry } from "@hypit/author";
import {
  bindPromptSlot,
  promptAuthorDeclarations,
  promptTypes,
  renderPrompt,
  sealPromptBindings,
  sealPromptSlotBinding,
  sealPromptTemplate,
  validatePromptValues,
} from "@hypit/prompt";
import { decodeSvmlDeclarations } from "@hypit/svml";
import { sealText } from "@hypit/text";

const template = sealPromptTemplate({
  separator: "paragraph",
  parts: [
    { kind: "fixed", name: "base", text: "Create a useful shot." },
    { kind: "choice", name: "energy", default: "calm", options: [
      { name: "calm", text: "Keep the performance calm." },
      { name: "active", text: "Use an active performance." },
    ] },
    { kind: "slot", name: "dialogue", required: true, label: "SCRIPT:" },
    { kind: "slot", name: "action", required: false },
  ],
});

test("Prompt renders fixed, chosen and explicitly bound parts in author order", () => {
  let bindings = sealPromptBindings({ energy: "active" });
  bindings = bindPromptSlot(bindings, sealPromptSlotBinding({ name: "dialogue" }), sealText("Hello."));
  assert.equal(renderPrompt(template, bindings).value,
    "Create a useful shot.\n\nUse an active performance.\n\nSCRIPT:\nHello.");
});

test("Prompt choices and required slots are closed by their Template", () => {
  assert.throws(() => validatePromptValues(template, { camera: "wide" }, "preset"), /unknown choice/u);
  assert.throws(() => validatePromptValues(template, { energy: "loud" }, "preset"), /unsupported option/u);
  assert.throws(() => renderPrompt(template, sealPromptBindings()), /dialogue is required/u);
});

test("ordinary SVML authors Template, Preset and Render without an SVS frontend", async () => {
  const registry = new AuthorDeclarationRegistry();
  promptAuthorDeclarations.forEach((declaration) => registry.register(declaration));
  const source = `module prompt from "@hypit/prompt@1"

prompt.Template "shot" {
  fixed "base" { text: "Create a product shot." }
  choose "energy" {
    default: calm
    option "calm" { text: "Keep the motion calm." }
    option "active" { text: "Use energetic motion." }
  }
  slot "action" { required: true label: "ACTION:" }
}

prompt.Preset "launch" {
  template: @shot
  values: { energy: active }
}

prompt.Render "direction" {
  template: @shot
  preset: @launch
  bind "action" { value: "The package opens." }
}
`;
  const decoded = await decodeSvmlDeclarations({
    id: "prompt.svml",
    name: "prompt.svml",
    bytes: new TextEncoder().encode(source),
  }, {
    compilers: registry,
    resolveAsset() { throw new Error("Prompt does not use assets"); },
  });
  assert.equal(decoded.records.some((record) => record.id === "shot" && record.type.name === promptTypes.template.name), true);
  assert.equal(decoded.records.some((record) => record.id === "launch" && record.type.name === promptTypes.preset.name), true);
  assert.deepEqual(decoded.components.map((component) => component.id), ["direction"]);
  assert.deepEqual(decoded.exports.map((item) => item.name), ["direction", "launch", "shot"]);
});
