import assert from "node:assert/strict";
import test from "node:test";
import { autoWorkerLimit, CaptureConcurrency } from "../src/concurrency.js";
import { renderWorkerLimit, resolveLocalHtmlExecutionOptions } from "../src/render.js";

test("automatic reservations respect memory, explicit ceiling and actual frame range", () => {
  assert.equal(autoWorkerLimit(16, 6 * 1024 ** 3), 2);
  assert.equal(autoWorkerLimit(2, 32 * 1024 ** 3), 1);
  const auto = resolveLocalHtmlExecutionOptions({ workers: "auto", maxWorkers: 6 });
  assert.equal(renderWorkerLimit(auto, 45, 30), 2);
  assert.equal(renderWorkerLimit(auto, 900, 30), 6);
  const fixed = resolveLocalHtmlExecutionOptions({ workers: 8 });
  assert.equal(renderWorkerLimit(fixed, 45, 30), 8);
  assert.equal(renderWorkerLimit(fixed, 3, 30), 3);
});

test("auto expands using completed work and retires the extra browser when throughput falls", () => {
  const scheduler = new CaptureConcurrency(4, true);
  assert.equal(scheduler.target, 2);
  scheduler.settled(0);
  let decision;
  for (let i = 1; i <= 4; i++) decision = scheduler.complete({ now: i * 500, frames: 30,
    remainingFrames: 20_000, startupMs: 1_000, active: 2 });
  assert.equal(decision?.workers, 3);
  scheduler.settled(3_000);
  for (let i = 1; i <= 6; i++) decision = scheduler.complete({ now: 3_000 + i * 750, frames: 30,
    remainingFrames: 20_000, startupMs: 1_000, active: 3 });
  assert.equal(decision?.workers, 2);
  assert.match(decision!.reason, /did not improve/);
});

test("short remaining work does not pay for more browsers, and fixed workers never adapt", () => {
  for (const automatic of [true, false]) {
    const scheduler = new CaptureConcurrency(4, automatic);
    scheduler.settled(0);
    const original = scheduler.target;
    for (let i = 1; i <= 12; i++) {
      assert.equal(scheduler.complete({ now: i * 500, frames: 30, remainingFrames: 20,
        startupMs: 1_000, active: original }), undefined);
    }
    assert.equal(scheduler.target, original);
  }
});

test("a slower scene is not assumed to improve with fewer browsers", () => {
  const scheduler = new CaptureConcurrency(4, true);
  let now = 0;
  scheduler.settled(now);
  const sample = (active: number, interval: number, remainingFrames: number) => {
    let result;
    for (let i = 0; i < active * 2; i++) {
      now += interval;
      result = scheduler.complete({ now, frames: 30, remainingFrames, startupMs: 1_000, active });
    }
    return result;
  };
  // Establish a rate without enough work to justify adding a browser.
  sample(2, 500, 1);
  assert.equal(sample(2, 1_000, 10_000)?.workers, 1);
  scheduler.settled(now);
  assert.equal(sample(1, 2_000, 10_000)?.workers, 2);
});
