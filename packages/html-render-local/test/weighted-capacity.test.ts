import assert from "node:assert/strict";
import test from "node:test";
import { WeightedCapacity } from "../src/weighted-capacity.js";

test("weighted capacity owns only numeric attempt-local leases", () => {
  const capacity = new WeightedCapacity(5);
  const first = capacity.tryAcquire(3)!;
  assert.equal(capacity.used, 3);
  assert.equal(capacity.tryAcquire(3), undefined);
  const overflow = capacity.tryAcquire(3, true)!;
  assert.equal(capacity.used, 6);
  assert.equal(capacity.peak, 6);
  first.release();
  first.release();
  assert.equal(capacity.used, 3);
  overflow.release();
  assert.equal(capacity.used, 0);
});
