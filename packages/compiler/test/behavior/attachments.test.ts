import assert from "node:assert/strict";
import test from "node:test";

import { mergeAttachments } from "../../src/compiler.js";

test("attachment merging preserves the owner's whole and ranged readers", async () => {
  const open = async function* (): AsyncIterable<Uint8Array> {
    yield Uint8Array.of(1, 2, 3);
  };
  const openRange = async function* (): AsyncIterable<Uint8Array> {
    yield Uint8Array.of(2);
  };

  const [attachment] = mergeAttachments([[{
    blob: { kind: "blob", resource: "res_attachment", size: 3, mediaType: "application/octet-stream" },
    open,
    openRange,
    location: "/fixture/attachment.bin",
  }]]);

  assert.equal(attachment?.open, open);
  assert.equal(attachment?.openRange, openRange);
  assert.equal(attachment?.location, "/fixture/attachment.bin");
});
