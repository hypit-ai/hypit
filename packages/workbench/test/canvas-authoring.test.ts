import assert from "node:assert/strict";
import test from "node:test";

import {
  authoringBindingInputKeys,
  authoringVariantInputs,
  automaticAuthoringConnection,
  replaceableAuthoringConnections,
} from "../src/client/canvas-authoring.js";

const firstFrame = {
  id: "firstFrame", kind: "slot", input: "firstFrame", accepts: ["image"], required: true,
} as const;
const lastFrame = {
  id: "lastFrame", kind: "slot", input: "lastFrame", accepts: ["image"], required: false,
} as const;
const references = {
  id: "references", kind: "list", minItems: 0, entries: [
    { role: "image", prefix: "reference" },
    { role: "video", prefix: "reference" },
    { role: "audio", prefix: "reference", requiresAnyRole: ["image", "video"] },
  ],
} as const;
const editor = {
  output: { connectable: true, media: ["video"] },
  controls: [],
  ports: [firstFrame, lastFrame, references],
  variant: {
    input: "mode",
    default: "text",
    variants: [
      { value: "text", active: [] },
      { value: "frames", active: ["firstFrame", "lastFrame"] },
      { value: "references", active: ["references"] },
    ],
  },
} as const;

test("automatic Canvas assignment enters a compatible variant and fills required slots first", () => {
  const first = automaticAuthoringConnection(editor, { inputs: { mode: { value: "text" } } }, ["image"]);
  assert.equal(first?.port.id, "firstFrame");
  assert.deepEqual(first?.variant, { input: "mode", value: "frames" });

  const second = automaticAuthoringConnection(editor, {
    inputs: { mode: { value: "frames" }, firstFrame: { node: "image-1" } },
  }, ["image"]);
  assert.equal(second?.port.id, "lastFrame");
  assert.equal(second?.variant, undefined);
});

test("automatic Canvas assignment never changes variant when that would hide populated ports", () => {
  const option = automaticAuthoringConnection(editor, {
    inputs: {
      mode: { value: "frames" },
      firstFrame: { node: "image-1" },
      lastFrame: { node: "image-2" },
    },
  }, ["image"]);
  assert.equal(option, undefined);
});

test("automatic Canvas assignment preserves authored controls while allowing disposable defaults", () => {
  const withControl = {
    ...editor,
    controls: [{ id: "webSearch", input: "webSearch", value: { kind: "boolean" }, required: false, default: false }],
    variant: { ...editor.variant, variants: editor.variant.variants.map(variant => variant.value === "text"
      ? { ...variant, active: ["webSearch"] } : variant) },
  } as const;
  assert.equal(automaticAuthoringConnection(withControl, {
    inputs: { mode: { value: "text" }, webSearch: { value: false } },
  }, ["image"])?.variant?.value, "frames");
  assert.equal(automaticAuthoringConnection(withControl, {
    inputs: { mode: { value: "text" }, webSearch: { value: true } },
  }, ["image"]), undefined);
});

test("manual variant changes remove only inactive package defaults", () => {
  const withControl = {
    ...editor,
    controls: [{ id: "webSearch", input: "webSearch", value: { kind: "boolean" }, required: false, default: false }],
    variant: { ...editor.variant, variants: editor.variant.variants.map(variant => variant.value === "text"
      ? { ...variant, active: ["webSearch"] } : variant) },
  } as const;
  assert.deepEqual(authoringVariantInputs(withControl, {
    inputs: { mode: { value: "text" }, webSearch: { value: false } },
  }, "references"), { mode: { value: "references" } });
  assert.deepEqual(authoringVariantInputs(withControl, {
    inputs: { mode: { value: "text" }, webSearch: { value: true } },
  }, "references"), { mode: { value: "references" }, webSearch: { value: true } });
});

test("automatic Canvas assignment respects package-declared list role dependencies", () => {
  const emptyAudio = automaticAuthoringConnection(editor, {
    inputs: { mode: { value: "references" } },
  }, ["audio"]);
  assert.equal(emptyAudio, undefined);

  const afterImage = automaticAuthoringConnection(editor, {
    inputs: {
      mode: { value: "references" },
      "reference.1": { node: "image-1" },
      "reference.1.role": { value: "image" },
    },
  }, ["audio"]);
  assert.equal(afterImage?.port.id, "references");
  assert.equal(afterImage?.entry?.role, "audio");
});

test("occupied slots are explicit replacements, not automatic assignments", () => {
  const node = {
    inputs: {
      mode: { value: "frames" },
      firstFrame: { node: "image-1" },
      firstFramePersonReference: { value: false },
    },
  };
  assert.equal(automaticAuthoringConnection(editor, node, ["image"])?.port.id, "lastFrame");
  assert.deepEqual(replaceableAuthoringConnections(node, [firstFrame, lastFrame], ["image"])
    .map(option => option.port.id), ["firstFrame"]);
});

test("disconnecting a binding also removes its package-declared metadata", () => {
  const metadataEditor = {
    ...editor,
    ports: [
      { ...firstFrame, itemFields: [{ name: "personReference", input: { kind: "sibling", name: "firstFramePersonReference" }, value: { kind: "boolean" } }] },
      { ...references, entries: references.entries.map(entry => ({ ...entry,
        itemFields: entry.role === "audio" ? [] as const : [{ name: "personReference",
          input: { kind: "suffix" as const }, value: { kind: "boolean" as const } }],
      })) },
    ],
  } as const;
  assert.deepEqual(authoringBindingInputKeys(metadataEditor, {
    inputs: { firstFrame: { node: "image-1" }, firstFramePersonReference: { value: false } },
  }, "firstFrame"), ["firstFrame", "firstFramePersonReference"]);
  const referenceNode = {
    inputs: {
      "reference.1": { node: "image-1" },
      "reference.1.role": { value: "image" },
      "reference.1.personReference": { value: false },
    },
  };
  assert.deepEqual(authoringBindingInputKeys(metadataEditor, referenceNode, "reference.1"),
    ["reference.1", "reference.1.role", "reference.1.personReference"]);
  assert.deepEqual(authoringBindingInputKeys(metadataEditor, referenceNode, "reference.1.personReference"),
    ["reference.1", "reference.1.role", "reference.1.personReference"]);
});
