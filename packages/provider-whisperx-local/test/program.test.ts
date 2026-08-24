import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { localWhisperXProgram } from "../src/program.js";

const context = (config: Record<string, unknown> = {}) => ({
  hostStateRoot: join(tmpdir(), "hypit-whisperx-host"),
  dataRoot: tmpdir(), instance: "whisperx.test", config: config as never,
});

test("the Provider declares how to bring WhisperX up and how to recognise it", () => {
  const program = localWhisperXProgram(context());
  assert.equal(program.id, "whisperx");
  assert.match(program.start?.command ?? "", /hypit-whisperx-service(?:\.exe)?$/u);
  assert.equal(program.installation?.commands[0]?.command, "uv");
  assert.match(program.installation?.commands[1]?.command ?? "", /hypit-whisperx-prepare(?:\.exe)?$/u);
  const project = program.installation?.commands[0]?.args.at(-3) ?? "";
  assert.ok(isAbsolute(project), `${project} must be absolute`);
  assert.ok(existsSync(join(project, "pyproject.toml")), `${project} must be the pinned uv project`);
  assert.equal(program.stateRoot, join(context().hostStateRoot, "programs", "whisperx"));
});

test("a deployment that installs WhisperX elsewhere overrides the command", () => {
  const program = localWhisperXProgram(context({ serviceCommand: ["conda", "run", "whisperx-serve"] }));
  assert.deepEqual(program.start, { command: "conda", args: ["run", "whisperx-serve"] });
  assert.equal(program.installation, undefined);
  assert.equal(program.stateRoot, undefined);
});

test("a program answering with another identity is reported, never used", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true,
    protocol: "hypit.whisperx-service@1",
    serviceVersion: "0.1.0",
    whisperxVersion: "3.8.6",
    model: "large-v3",
    device: "cpu",
  }), { status: 200 })) as typeof fetch;
  try {
    const state = await localWhisperXProgram(context()).probe();
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
    const state = await localWhisperXProgram(context({ baseUrl: "http://127.0.0.1:9" })).probe();
    assert.equal(state.state, "down");
  } finally {
    globalThis.fetch = original;
  }
});
