import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseSvs } from "@hypit/svs";
import { renderText, sealTextBindings, textTemplateFromSvsRecipes } from "@hypit/text";

const cases = [
  { file: "speaker-v1.svs", id: "speaker-v1", bindings: { dialogue: "HOST: Meaning comes first." }, marker: "@audio1 is the speaker's voice-timbre reference" },
  { file: "broll-v1.svs", id: "broll-v1", bindings: { story: "A hand opens the product." }, marker: "silent B-roll" },
  { file: "podcast-v1.svs", id: "podcast-v1", bindings: { dialogue: "A: Hello.\nB: Hi." }, marker: "Host A uses @audio1" },
  { file: "call-v1.svs", id: "call-v1", bindings: { dialogue: "A: Hello.\nB: Hi." }, marker: "both tiles are live feeds" },
  { file: "street-interview-v1.svs", id: "street-interview-v1", bindings: { dialogue: "A: Why?\nB: Because." }, marker: "MICROPHONE CONTRACT" },
  { file: "motion-reference-v1.svs", id: "motion-reference-v1", bindings: {}, marker: "body motion" },
  { file: "camera-reference-v1.svs", id: "camera-reference-v1", bindings: {}, marker: "camera framing" },
] as const;

test("Seedance Kits are finite data programs with distinct rendered semantics", () => {
  for (const item of cases) {
    const source = readFileSync(new URL(`../kits/${item.file}`, import.meta.url), "utf8");
    const recipes = parseSvs(item.file, source.slice(source.indexOf("<sheet"))).recipes.map((recipe) => recipe.value);
    const template = textTemplateFromSvsRecipes(recipes, item.id);
    const output = renderText(template, sealTextBindings(item.bindings));
    assert.match(output.value, new RegExp(item.marker, "u"), item.file);
  }
});

test("official Seedance Kits select semantics by file and explicit axes, never inferred branches", () => {
  for (const item of cases) {
    const source = readFileSync(new URL(`../kits/${item.file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /kind:\s*variant|when-(?:param|select)-/u, item.file);
    assert.doesNotMatch(source, /slot:\s*extra/u, item.file);
  }
  const broll = readFileSync(new URL("../kits/broll-v1.svs", import.meta.url), "utf8");
  assert.doesNotMatch(broll, /reference-plan/u);
  const speaker = readFileSync(new URL("../kits/speaker-v1.svs", import.meta.url), "utf8");
  assert.match(speaker, /slot:\s*dialogue/u);
  assert.match(speaker, /slot:\s*action/u);
});
