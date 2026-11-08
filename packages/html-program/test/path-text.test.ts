import assert from "node:assert/strict";
import test from "node:test";

import { htmlPathTextRuntime } from "../src/index.js";

test("HTML path text runtime remains renderer-local geometry", () => {
  assert.doesNotThrow(() => new Function(htmlPathTextRuntime));
  assert.match(htmlPathTextRuntime, /getTotalLength/u);
  assert.match(htmlPathTextRuntime, /getPointAtLength/u);
  assert.doesNotMatch(htmlPathTextRuntime, /Caption|Timeline|NLE|anchor lookup/u);
});
