import assert from "node:assert/strict";
import test from "node:test";

import type { AuthorResolvedReference } from "@hypit/author";
import { textTypes } from "@hypit/text";
import { compileMarkupDeclaration } from "../../../test/compile-markup-declaration.js";

import { wanImageAuthorDeclaration, wanMarkupDeclarations } from "../src/declaration.js";
import { wanEndpoints, wanModuleRef } from "../src/index.js";

const prompt: AuthorResolvedReference = {
  path: "prompt",
  ref: { kind: "component-output", component: "direction", output: "text" },
  type: textTypes.text,
};

test("Wan publishes the complete generated set and an explicit primary image", async () => {
  const decoded = await compileMarkupDeclaration({
    source: '<wan:Image id="story" prompt={prompt} count="4" image-set="true"/>',
    module: wanModuleRef,
    alias: "wan",
    compilers: [wanImageAuthorDeclaration],
    syntax: wanMarkupDeclarations,
    references: new Map([["prompt", prompt]]),
  });
  assert.deepEqual(decoded.components[0]?.outputs, {
    images: "story.images",
    image: "story.image",
  });
  assert.deepEqual(decoded.components[0]?.fragment.exports.map((item) => ({ name: item.name, type: item.type })), [
    { name: "image", type: { module: { name: "@hypit/blob", version: "1" }, name: "Blob" } },
    { name: "images", type: wanEndpoints.image!.returns },
  ]);
  assert.deepEqual(decoded.components[0]?.fragment.operations.map((item) => item.id), [
    "bind-text:0001:prompt",
    "finalize-request",
    "generate",
    "select-primary-image",
  ]);
});
