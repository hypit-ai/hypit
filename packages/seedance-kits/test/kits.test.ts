import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { AuthorDeclarationRegistry } from "@hypit/author";
import {
  promptTemplateAuthorDeclaration,
  renderPrompt,
  sealPromptBindings,
  type PromptTemplate,
} from "@hypit/prompt";
import { decodeSvmlDeclarations } from "@hypit/svml";

const cases = [
  { file: "speaker-v1.svml", id: "speaker-v1", slots: { dialogue: "HOST: Meaning comes first." }, marker: "@audio1 is the speaker's voice-timbre reference" },
  { file: "broll-v1.svml", id: "broll-v1", slots: { story: "A hand opens the product." }, marker: "silent B-roll" },
  { file: "podcast-v1.svml", id: "podcast-v1", slots: { dialogue: "A: Hello.\nB: Hi." }, marker: "Host A uses @audio1" },
  { file: "call-v1.svml", id: "call-v1", slots: { dialogue: "A: Hello.\nB: Hi." }, marker: "both tiles are live feeds" },
  { file: "street-interview-v1.svml", id: "street-interview-v1", slots: { dialogue: "A: Why?\nB: Because." }, marker: "MICROPHONE CONTRACT" },
  { file: "motion-reference-v1.svml", id: "motion-reference-v1", slots: {}, marker: "body motion" },
  { file: "camera-reference-v1.svml", id: "camera-reference-v1", slots: {}, marker: "camera framing" },
] as const;

test("Seedance Kits compile as ordinary SVML Prompt Templates with distinct semantics", async () => {
  const compilers = new AuthorDeclarationRegistry();
  compilers.register(promptTemplateAuthorDeclaration);
  for (const item of cases) {
    const source = readFileSync(new URL(`../kits/${item.file}`, import.meta.url));
    const decoded = await decodeSvmlDeclarations({ id: item.file, name: item.file, bytes: source }, {
      compilers,
      resolveAsset() { throw new Error("Prompt Kits contain no assets"); },
    });
    const record = decoded.records.find((candidate) => candidate.id === item.id);
    assert.ok(record, item.file);
    const output = renderPrompt(record.value as unknown as PromptTemplate, sealPromptBindings({}, item.slots));
    assert.match(output.value, new RegExp(item.marker, "u"), item.file);
  }
});
