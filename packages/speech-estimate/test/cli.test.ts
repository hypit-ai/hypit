import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runEstimateCli } from "../src/cli.js";

test("estimate presents the deterministic speech estimate without opening a Runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-estimate-"));
  let output = "";
  try {
    await runEstimateCli([
      "estimate", "--text", "Video editing begins with meaning, not a pile of clips on a timeline.",
      "--language", "en", "--pace", "normal", "--rounding", "round", "--json",
    ], { write: (text) => { output += text; } }, {
      cwd: root,
      resolveProjectRoot: async () => { throw new Error("inline estimation does not resolve a project"); },
    }, {} as never);
    const view = JSON.parse(output) as { readonly format: string; readonly seconds: number; readonly units: number; readonly rate: number };
    assert.equal(view.format, "hypit.speech-estimate@1");
    assert.equal(view.units, 20);
    assert.equal(view.seconds, 4);
    assert.equal(view.rate, 4.6);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
