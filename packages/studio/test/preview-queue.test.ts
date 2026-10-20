import assert from "node:assert/strict";
import test from "node:test";
import { createPreviewQueue } from "../src/ui/preview-queue.js";

test("timeline derivatives bound in-flight work and release a failed slot", async () => {
  const enqueue = createPreviewQueue(2);
  let active = 0;
  let peak = 0;
  const jobs = Array.from({ length: 84 }, (_, index) => enqueue(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    if (index === 2) throw new Error("decode failed");
    return index;
  }));
  const results = await Promise.allSettled(jobs);
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 83);
});
