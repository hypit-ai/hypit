import assert from "node:assert/strict";
import test from "node:test";

import { createConnectLifecycle } from "../src/ui/connect-lifecycle.js";

/**
 * The back-forward-cache shape the Studio panel depends on. A real `pagehide` invalidates the running
 * attempt before the server is told to cancel it, and the guarded `finally` of that invalidated
 * request then refuses to touch anything — so the busy flag and the authorization hint must already
 * be clear here, and a second authorization must be able to start without a remount.
 */
test("pagehide releases the panel so a second authorization can start without remounting", () => {
  const lifecycle = createConnectLifecycle();
  const first = lifecycle.begin();
  lifecycle.open(first.generation);
  lifecycle.setBusy(true);
  assert.deepEqual(lifecycle.state(), { generation: first.generation, busy: true, pendingGeneration: first.generation });

  // What the pagehide handler does synchronously, before any keepalive request goes out.
  const released = lifecycle.release();
  lifecycle.setBusy(false);
  assert.equal(released.releasedGeneration, first.generation);
  assert.deepEqual(lifecycle.state(), { generation: first.generation + 1, busy: false, pendingGeneration: undefined });

  // The restored page starts a second authorization: it becomes the current generation.
  const second = lifecycle.begin();
  lifecycle.open(second.generation);
  const state = lifecycle.state();
  assert.ok(second.generation > first.generation);
  assert.equal(state.pendingGeneration, second.generation);
  assert.equal(state.busy, false);
});

test("a late answer from a released attempt is not the current generation", () => {
  const lifecycle = createConnectLifecycle();
  const first = lifecycle.begin();
  lifecycle.open(first.generation);
  const attempt = lifecycle.state().generation;
  lifecycle.release();
  const second = lifecycle.begin();
  lifecycle.open(second.generation);
  // The panel compares the attempt it started against the current generation before rendering.
  assert.notEqual(attempt, lifecycle.state().generation);
});

test("releasing with nothing open still invalidates the running attempt", () => {
  const lifecycle = createConnectLifecycle();
  const first = lifecycle.begin();
  lifecycle.setBusy(true);
  const released = lifecycle.release();
  assert.equal(released.releasedGeneration, undefined);
  assert.equal(lifecycle.state().busy, false);
  assert.equal(lifecycle.begin().generation, first.generation + 2);
});
