import assert from "node:assert/strict";
import test from "node:test";

import type { AuthorResolvedReference } from "@hypit/generation-authoring/author";
import { promptTypes } from "@hypit/prompt";
import { compileSvmlDeclaration } from "../../../test/compile-svml-declaration.js";

import { wanImageAuthorDeclaration } from "../src/declaration.js";
import { wanEndpoints, wanModuleRef } from "../src/index.js";

const prompt: AuthorResolvedReference = {
  ref: { kind: "component-output", component: "direction", output: "text" },
  type: promptTypes.prompt,
};

test("Wan publishes the complete generated set and an explicit primary image", async () => {
  const decoded = await compileSvmlDeclaration({
    source: 'wan.image { id: story prompt: @prompt count: 4 image-set: true }',
    module: wanModuleRef,
    alias: "wan",
    compilers: [wanImageAuthorDeclaration],
    references: new Map([["prompt", prompt]]),
  });
  assert.deepEqual(decoded.components[0]?.outputs, {
    images: "story.images",
    image: "story.image",
  });
  assert.deepEqual(decoded.components[0]?.fragment.exports.map((item) => ({ name: item.name, type: item.type })), [
    { name: "image", type: { module: { name: "@hypit/blob" }, name: "Blob" } },
    { name: "images", type: wanEndpoints.image!.returns },
  ]);
  assert.deepEqual(decoded.components[0]?.fragment.operations.map((item) => item.id), [
    "bind-text-field:0001:prompt",
    "finalize-request",
    "generate",
    "select-primary-image",
  ]);
});
