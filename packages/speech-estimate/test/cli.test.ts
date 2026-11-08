import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
    });
    const view = JSON.parse(output) as { readonly format: string; readonly seconds: number; readonly units: number; readonly rate: number };
    assert.equal(view.format, "hypit.speech-estimate@1");
    assert.equal(view.units, 20);
    assert.equal(view.seconds, 4);
    assert.equal(view.rate, 4.6);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("estimate reads one Segment directly from a standalone Script file", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-estimate-script-"));
  let output = "";
  try {
    await writeFile(join(root, "story.script"), "<opening><HOST>Use <API|A P I> today.</opening>\n");
    await runEstimateCli([
      "estimate", "story.script", "--segment", "opening", "--language", "en", "--rounding", "none", "--json",
    ], { write: (text) => { output += text; } }, {
      cwd: root,
      resolveProjectRoot: async () => { throw new Error("Script estimation does not resolve a project"); },
    });
    const view = JSON.parse(output) as { readonly source: string; readonly segment: string; readonly units: number };
    assert.equal(view.source, join(root, "story.script"));
    assert.equal(view.segment, "opening");
    assert.equal(view.units, 6);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
