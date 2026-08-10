import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import test from "node:test";

import { localWhisperXService } from "../src/service.js";

const context = (config: Record<string, unknown> = {}) => ({
  root: "/tmp", instance: "whisperx.test", config: config as never,
});

test("the Provider declares how to bring WhisperX up and how to recognise it", () => {
  const service = localWhisperXService(context());
  assert.equal(service.id, "whisperx");
  assert.equal(service.start?.command, "uv");
  assert.equal(service.start?.args.at(-1), "svml-whisperx-service");
  assert.equal(service.prepare?.args.at(-1), "svml-whisperx-prepare");
  // Absolute: a Runtime root is wherever the Profile lives, not where the
  // pinned uv project lives.
  const project = service.start?.args.at(-3) ?? "";
  assert.ok(isAbsolute(project), `${project} must be absolute`);
  assert.ok(existsSync(join(project, "pyproject.toml")), `${project} must be the pinned uv project`);
});

test("a deployment that installs WhisperX elsewhere overrides the command", () => {
  const service = localWhisperXService(context({ serviceCommand: ["conda", "run", "whisperx-serve"] }));
  assert.deepEqual(service.start, { command: "conda", args: ["run", "whisperx-serve"] });
  assert.equal(service.prepare, undefined);
});

test("custom prepare and probe-only deployments do not inherit managed lifecycle commands", () => {
  const prepared = localWhisperXService(context({ servicePrepareCommand: ["make", "models"] }));
  assert.deepEqual(prepared.prepare, { command: "make", args: ["models"] });
  assert.equal(prepared.start, undefined);
});

test("a program answering with another identity is reported, never used", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true,
    protocol: "svml.whisperx-service@1",
    serviceVersion: "0.1.0",
    whisperxVersion: "3.8.6",
    model: "large-v3",
    device: "cpu",
    punktTabDigest: "sha256:" + "0".repeat(64),
  }), { status: 200 })) as typeof fetch;
  try {
    const state = await localWhisperXService(context()).probe();
    assert.equal(state.state, "mismatch");
    assert.match(state.state === "mismatch" ? state.detail : "", /model is large-v3, expected small/u);
  } finally {
    globalThis.fetch = original;
  }
});

test("nothing answering is down, not a mismatch", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch;
  try {
    const state = await localWhisperXService(context({ baseUrl: "http://127.0.0.1:9" })).probe();
    assert.equal(state.state, "down");
  } finally {
    globalThis.fetch = original;
  }
});
