import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { captureBrowserExecutablePath } from "@hypit/browser-capture";
import { runCaptureCli } from "../src/capture.js";
import type { CliIo } from "@hypit/cli";

const executablePath = process.env.HYPIT_CAPTURE_TEST_BROWSER ?? await captureBrowserExecutablePath();
const exec = promisify(execFile);
const launcher = resolve("bin/hypit.mjs");

test("capture rejects incomplete or contradictory requests before browser work", async () => {
  const io: CliIo = { write: () => {}, setExitCode: () => {} };
  await assert.rejects(runCaptureCli(["capture", "screenshot", "https://example.com"], io), /requires --to/);
  await assert.rejects(runCaptureCli(["capture", "screenshot", "https://example.com", "--to", "x.png",
    "--full-page", "--selector", "main"], io), /Choose --full-page/);
  await assert.rejects(runCaptureCli(["capture", "screenshot", "https://example.com", "--to", "x.png",
    "--clip", "1,2,3"], io), /--clip needs/);
  await assert.rejects(runCaptureCli(["capture", "run", "x.mjs", "--to", "x.png"], io), /belongs to capture screenshot/);
});

test("the shipped launcher captures from a plain project and passes script arguments without project dependencies", {
  skip: !existsSync(executablePath) && "Chrome is not installed", timeout: 30_000,
}, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-capture-cli-"));
  try {
    await writeFile(join(work, "page.html"), "<style>body{margin:0;height:1000px}</style><p>Product evidence</p>");
    const common = ["--browser", executablePath, "--json"];
    const first = await exec(process.execPath, [launcher, "capture", "screenshot", "page.html",
      "--to", "assets/page.png", "--full-page", "--viewport", "400x300", ...common], { cwd: work });
    const view = JSON.parse(first.stdout);
    assert.equal(view.outputs[0].width, 400);
    assert.equal(view.outputs[0].height, 1000);
    assert.equal(view.outputs[0].path, join(await realpath(work), "assets/page.png"));
    await writeFile(join(work, "task.mjs"), `export const options = { launch: { defaultViewport: { width: 240, height: 160 } } };
      export default async ({page, screenshot, args, log}) => {
        if(args[0] !== '--help') throw new Error('script arguments were not forwarded');
        await page.setContent('<p>Authored HTML</p>');
        log('Capturing the authored card');
        await screenshot({path: 'assets/card.png'});
      };`);
    const second = await exec(process.execPath, [launcher, "capture", "run", "task.mjs", ...common,
      "--", "--help"], { cwd: work });
    assert.equal(JSON.parse(second.stdout).outputs[0].width, 240);
    assert.match(second.stderr, /Capturing the authored card/);
    assert.equal(existsSync(join(work, "node_modules")), false);
  } finally { await rm(work, { recursive: true, force: true }); }
});
