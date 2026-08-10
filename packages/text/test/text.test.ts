import assert from "node:assert/strict";
import test from "node:test";
import { parseStructuredElement } from "@narratage/markup";
import type { SurfaceResolvedReference } from "@narratage/markup";

import {
  bindText,
  createTextRenderFragment,
  decodeTextRenderSurface,
  decodeTextValueSurface,
  renderText,
  sealText,
  sealTextBinding,
  sealTextBindings,
  sealTextTemplate,
  textTypes,
  verifyTextTemplate,
} from "@narratage/text";

test("text programs compose nested templates, choices, lists and transforms", () => {
  const template = sealTextTemplate({
    contract: "svml.text-template@1",
    definitions: {
      dialogue: {
        kind: "sequence",
        items: [
          { kind: "literal", value: "Spoken dialogue — say exactly:\n" },
          { kind: "transform", input: { kind: "slot", binding: "dialogue" }, transforms: [{ kind: "trim" }] },
        ],
      },
    },
    root: {
      kind: "join",
      separator: "\n\n",
      items: [
        { kind: "slot", binding: "base" },
        {
          kind: "choice",
          cases: [{
            when: { kind: "equals", binding: "camera", value: "handheld" },
            value: { kind: "literal", value: "Natural handheld camera movement." },
          }],
          otherwise: { kind: "literal", value: "Locked camera." },
        },
        {
          kind: "optional",
          when: { kind: "present", binding: "references" },
          value: {
            kind: "each",
            binding: "references",
            as: "reference",
            separator: "\n",
            value: { kind: "slot", binding: "reference" },
          },
        },
        { kind: "call", template: "dialogue" },
      ],
    },
  });
  const result = renderText(template, sealTextBindings({
    base: "A concise UGC video.",
    camera: "handheld",
    references: ["Image 1 is the person.", "Image 2 is the product."],
    dialogue: "  Hello world.  ",
  }));
  assert.equal(result.value, [
    "A concise UGC video.",
    "Natural handheld camera movement.",
    "Image 1 is the person.\nImage 2 is the product.",
    "Spoken dialogue — say exactly:\nHello world.",
  ].join("\n\n"));
});

test("graph Text bindings are explicit and cannot overwrite by accident", () => {
  const initial = sealTextBindings({ base: "first" });
  assert.throws(() => bindText(initial, sealTextBinding({ name: "base", mode: "set" }), sealText("second")), /already set/u);
  const appended = bindText(initial, sealTextBinding({ name: "references", mode: "append" }), sealText("one"));
  const twice = bindText(appended, sealTextBinding({ name: "references", mode: "append" }), sealText("two"));
  assert.deepEqual(twice.values.references, ["one", "two"]);
  const fragment = createTextRenderFragment([{ name: "dialogue" }]);
  assert.equal(fragment.inputs.length, 4);
  assert.equal(fragment.exports[0]?.type.name, "Text");
});

test("text templates reject recursion and ambiguous choices", () => {
  assert.throws(() => verifyTextTemplate({
    contract: "svml.text-template@1",
    root: { kind: "call", template: "loop" },
    definitions: { loop: { kind: "call", template: "loop" } },
  }), /cycle/u);
  assert.throws(() => renderText(sealTextTemplate({
    contract: "svml.text-template@1",
    root: {
      kind: "choice",
      cases: [
        { when: { kind: "present", binding: "x" }, value: { kind: "literal", value: "a" } },
        { when: { kind: "equals", binding: "x", value: true }, value: { kind: "literal", value: "b" } },
      ],
    },
  }), sealTextBindings({ x: true })), /matched 2/u);
});

test("one definition keeps lexical each bindings without hiding its global uses", () => {
  const template = sealTextTemplate({
    contract: "svml.text-template@1",
    definitions: { item: { kind: "slot", binding: "item" } },
    root: {
      kind: "join",
      separator: " / ",
      items: [{
        kind: "each",
        binding: "items",
        as: "item",
        separator: ", ",
        value: { kind: "call", template: "item" },
      }, { kind: "call", template: "item" }],
    },
  });
  assert.equal(renderText(template, sealTextBindings({ items: ["one", "two"], item: "global" })).value,
    "one, two / global");
});

test("Markup Text Surfaces expose literal and assembled Text as ordinary graph values", async () => {
  const literal = parseStructuredElement({
    name: "text.svml",
    text: `<text:Value id="base">
      Make a vertical product video.
    </text:Value>`,
  }, 0).element;
  const authored = await decodeTextValueSurface({
    sourceName: "text.svml",
    element: literal,
    resolveReference: () => undefined,
    resolveAsset: () => { throw new Error("no asset"); },
  });
  assert.equal((authored.records[0]?.value as { value?: { value?: string } }).value?.value, "Make a vertical product video.");

  const assembled = parseStructuredElement({
    name: "text.svml",
    text: `<text:Render id="prompt" template={kit}>
      <text:Param name="camera" value="handheld"/>
      <text:Param name="strict" value="true" type="boolean"/>
      <text:Set name="dialogue" text={dialogue}/>
      <text:Append name="references" text={first}/>
      <text:Append name="references" text={second}/>
    </text:Render>`,
  }, 0).element;
  const refs = new Map<string, SurfaceResolvedReference>([
    ["kit", { path: "kit", ref: { kind: "record", id: "kit" }, type: textTypes.template }],
    ["dialogue", { path: "dialogue", ref: { kind: "component-output", component: "script", output: "text" }, type: textTypes.text }],
    ["first", { path: "first", ref: { kind: "record", id: "first" }, type: textTypes.text }],
    ["second", { path: "second", ref: { kind: "record", id: "second" }, type: textTypes.text }],
  ]);
  const result = await decodeTextRenderSurface({
    sourceName: "text.svml",
    element: assembled,
    resolveReference: (path) => refs.get(path),
    resolveAsset: () => { throw new Error("no asset"); },
  });
  assert.equal(result.components.length, 1);
  assert.deepEqual(result.components[0]?.outputs, { text: "prompt" });
  assert.deepEqual(result.components[0]?.inputs["binding:binding-0001:text"], {
    kind: "component-output", component: "script", output: "text",
  });
  const initial = result.records.find((record) => record.id === "prompt.bindings");
  assert.deepEqual((initial?.value as { value?: { values?: unknown } }).value?.values,
    { camera: "handheld", strict: true });
  assert.equal(result.records.filter((record) => record.type.name === "TextBinding").length, 3);
});
