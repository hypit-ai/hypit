import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { CliIo } from "@hypit/cli";

import { cliCommandModules, runDownloadCli } from "../src/cli.js";

function output(): { readonly io: CliIo; readonly text: () => string } {
  let value = "";
  return {
    io: {
      write: (chunk) => { value += chunk; },
      setExitCode: () => {},
      readSecret: async () => "",
      terminal: { isTTY: false, color: false, unicode: false, columns: 100 },
    },
    text: () => value,
  };
}

test("yt-dlp owns one download CLI root", async () => {
  assert.deepEqual(cliCommandModules[0]!.commands, ["download"]);
  const shown = output();
  await runDownloadCli(["download", "--help"], shown.io);
  assert.match(shown.text(), /hypit download <http-or-https-url>/u);
  assert.match(shown.text(), /hypit download prepare/u);
});

test("download validates URL and overwrite policy before invoking yt-dlp", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-download-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(runDownloadCli(["download", "not-a-url", "--to", "clip.mp4"], output().io, directory), /http or https URL/u);
  await assert.rejects(runDownloadCli(["download", "https://example.test/video", "--to", "clip.txt"], output().io, directory), /must end in/u);
  await writeFile(join(directory, "clip.mp4"), "existing");
  await assert.rejects(runDownloadCli(["download", "https://example.test/video", "--to", "clip.mp4"], output().io, directory), /already exists/u);
});
