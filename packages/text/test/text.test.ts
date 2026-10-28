import assert from "node:assert/strict";
import test from "node:test";
import { formatRecipeValue, parseRecipe, recipeType } from "@hypit/recipe";
import { bindText, createTextRenderFragment, renderText, sealText, sealTextBinding, sealTextBindings, sealTextTemplate, textTemplateBindingNames, textTypes, textTemplateFromRecipes, verifyTextTemplate } from "@hypit/text";
import type { TextExpression } from "@hypit/text";

test("Text Templates keep sheet closing text inside authored prompt text", () => {
  const prompt = "Show the literal </sheet> tag in the video";
  const source = `<sheet version="1">
    text-template.demo {}
    text-template.demo.block.example { kind: fixed; order: 0; text: ${formatRecipeValue(prompt)}; }
  </sheet>`;
  const recipes = parseRecipe("template.svs", source).recipes.map((recipe) => recipe.value);
  const template = textTemplateFromRecipes(recipes, "demo");
  assert.equal(renderText(template, sealTextBindings({})).value, prompt);
});

test("text programs compose nested templates, choices, lists and transforms", () => {
  const template = sealTextTemplate({

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

    root: { kind: "call", template: "loop" },
    definitions: { loop: { kind: "call", template: "loop" } },
  }), /cycle/u);
  assert.throws(() => renderText(sealTextTemplate({

    root: {
      kind: "choice",
      cases: [
        { when: { kind: "present", binding: "x" }, value: { kind: "literal", value: "a" } },
        { when: { kind: "equals", binding: "x", value: true }, value: { kind: "literal", value: "b" } },
      ],
    },
  }), sealTextBindings({ x: true })), /matched 2/u);
});

test("replace expressions insert authored replacement text literally", () => {
  const template = sealTextTemplate({
    root: {
      kind: "replace",
      input: { kind: "literal", value: "price: X" },
      replacements: [
        { from: "X", to: "$& USD", mode: "all" },
        { from: "USD", to: "$$ USD", mode: "first" },
      ],
    },
  });
  assert.equal(renderText(template, sealTextBindings({})).value, "price: $& $$ USD");
});

function diamondTemplate(levels: number, leaf: TextExpression) {
  const definitions: Record<string, TextExpression> = { leaf };
  for (let level = 0; level < levels; level += 1) {
    const target = level === 0 ? "leaf" : `d${level - 1}`;
    definitions[`d${level}`] = { kind: "sequence", items: [
      { kind: "call", template: target }, { kind: "call", template: target },
    ] };
  }
  return sealTextTemplate({ definitions, root: { kind: "call", template: `d${levels - 1}` } });
}

test("TextTemplate collection memoizes diamond definitions and rendering remains bounded", () => {
  assert.deepEqual([...textTemplateBindingNames(diamondTemplate(30, { kind: "slot", binding: "leaf" }))], ["leaf"]);
  assert.throws(() => renderText(diamondTemplate(24, { kind: "literal", value: "x" }), sealTextBindings({})),
    /output limit/u);
});

test("one definition keeps lexical each bindings without hiding its global uses", () => {
  const template = sealTextTemplate({

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
