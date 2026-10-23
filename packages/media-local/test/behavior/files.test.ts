import assert from "node:assert/strict";
import test from "node:test";

import type { CliIo } from "@hypit/hypit/cli";

import { gridFrameCount, gridSampleTimes, runMediaCli } from "../../src/files.js";

function io(): { readonly io: CliIo; text: () => string } {
  let out = "";
  return {
    io: {
      write: (chunk) => { out += chunk; },
      setExitCode: () => {},
      readSecret: async () => "",
      terminal: { isTTY: false, color: false, unicode: false, columns: 100 },
    },
    text: () => out,
  };
}

test("grid frame counts follow the measured bounds", () => {
  assert.equal(gridFrameCount(0.5), 4);
  assert.equal(gridFrameCount(4), 6);
  assert.equal(gridFrameCount(30), 9);
  assert.deepEqual(gridSampleTimes(1, 2, 4), [1.125, 1.375, 1.625, 1.875]);
});

test("media help names the available commands and both cut forms", () => {
  const out = io();
  runMediaCli(["media"], out.io);
  for (const name of ["probe", "cut", "frames", "grid", "waveform", "spectrogram", "boundaries"]) {
    assert.match(out.text(), new RegExp(`hypit media ${name}`));
  }
  assert.doesNotMatch(out.text(), /hypit media tiles?\b/u);
  assert.doesNotMatch(out.text(), /fetch/u);
  assert.match(out.text(), /--start <s> --end <s> \| --keep <start:end>/);
  assert.match(out.text(), /--label-time/);
  assert.match(out.text(), /--no-time/);
  assert.match(out.text(), /--header/);
});
