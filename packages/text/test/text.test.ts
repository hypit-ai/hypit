import assert from "node:assert/strict";
import test from "node:test";

import { sealText, verifyText } from "@hypit/text";

test("Text remains one exact ordinary string value", () => {
  assert.deepEqual(sealText("exact words"), { value: "exact words" });
  assert.throws(() => verifyText({ value: 1 }), /Text.value/u);
});
