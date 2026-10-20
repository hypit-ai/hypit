import assert from "node:assert/strict";
import test from "node:test";
import { injectRuntimeShim } from "../src/preview/runtime-shim.js";

test("Studio adds only its host-ready notification to shared playback", () => {
  const html = injectRuntimeShim("<body></body>");
  assert.match(html, /window\.__hypitPlayFrame/u);
  assert.match(html, /hypit-preview-ready/u);
  assert.equal((html.match(/<script>/gu) ?? []).length, 1);
});
