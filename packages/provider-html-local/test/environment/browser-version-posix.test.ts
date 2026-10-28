import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { browserExecutablePath } from "../../src/browser.js";
import { localHtmlRendererProgram } from "../../src/program.js";

test("a wrong-version managed executable cannot satisfy readiness or trigger a different selection", {
  skip: process.platform === "win32",
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-browser-mismatch-"));
  try {
    const options = { browserCacheDirectory: directory, browserVersion: "151.0.7922.71" };
    const path = browserExecutablePath(options);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `#!${process.execPath}\nconsole.log('Chrome Headless Shell 999.0.0.0');\n`);
    await chmod(path, 0o755);
    const program = localHtmlRendererProgram({ ...options, id: "render", nodePath: process.execPath, ffprobePath: "ffprobe" });
    const state = await program.probe();
    assert.equal(state.state, "down");
    assert.match(state.detail, /Expected Chrome Headless Shell 151\.0\.7922\.71/u);
    assert.match(await readFile(path, "utf8"), /999\.0\.0\.0/u, "probe must not repair files");
    assert.equal(program.installation!.commands[0]!.args.at(-1), options.browserVersion);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
