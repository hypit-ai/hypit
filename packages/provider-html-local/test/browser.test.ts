import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserExecutablePath, recommendedBrowserVersion } from "../src/browser.js";
import { localChromiumHtmlRendererProgram } from "../src/program.js";
import { resolveExecutionOptions } from "../src/render.js";

test("browser inspection is read-only and ignores environment browser hints", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-browser-"));
  const saved = [process.env.CHROME_PATH, process.env.BROWSER];
  delete process.env.CHROME_PATH;
  delete process.env.BROWSER;
  t.after(async () => {
    for (const [index, key] of ["CHROME_PATH", "BROWSER"].entries()) {
      if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index];
    }
    await rm(directory, { recursive: true, force: true });
  });
  const options = { browserCacheDirectory: directory };
  const program = localChromiumHtmlRendererProgram({ ...options, id: "render", nodePath: process.execPath, ffprobePath: "ffprobe" });
  const state = await program.probe();
  assert.equal(state.state, "down");
  assert.ok(state.detail.includes(browserExecutablePath(options)));
  assert.match(state.detail, /runtime up/u);
  assert.deepEqual(await readdir(directory), [], "diagnosis must not prepare or download anything");
  const otherProject = localChromiumHtmlRendererProgram({ ...options, id: "other-render", nodePath: process.execPath, ffprobePath: "ffprobe" });
  assert.equal(otherProject.stateRoot, program.stateRoot, "shared browser installation uses the existing shared Program lifecycle");
  assert.equal(resolveExecutionOptions(options).browserCacheDirectory, directory);

  // Two different overrides previously selected different binaries in the CLI and engine.
  process.env.CHROME_PATH = process.execPath;
  process.env.BROWSER = join(directory, "wrong-env-browser");
  assert.equal(resolveExecutionOptions(options).chromePath, undefined);
  assert.equal(resolveExecutionOptions(options).browserVersion, recommendedBrowserVersion);
  assert.notEqual(browserExecutablePath(options), process.execPath);
  assert.equal((await program.probe()).state, "down", "system/environment browsers do not satisfy this selection");
  const invalid = { ...options, chromePath: join(directory, "missing-explicit-browser") };
  const configured = localChromiumHtmlRendererProgram({ ...invalid, id: "render", nodePath: process.execPath, ffprobePath: "ffprobe" });
  assert.equal(configured.installation, undefined, "explicit paths must never cause a managed replacement download");
  assert.equal((await configured.probe()).state, "down");
  assert.equal(resolveExecutionOptions(invalid).chromePath, invalid.chromePath);
  assert.deepEqual(await readdir(directory), []);
});


test("browser selection rejects ambiguous choices and floating versions", () => {
  assert.throws(() => browserExecutablePath({ chromePath: process.execPath, browserVersion: recommendedBrowserVersion }), /mutually exclusive/u);
  assert.throws(() => browserExecutablePath({ browserVersion: "latest" }), /exact four-part/u);
  assert.throws(() => browserExecutablePath({ chromePath: "" }), /must not be empty/u);
  const chosen = { browserVersion: "151.0.7922.71", browserCacheDirectory: join(tmpdir(), "explicit-browser-cache") };
  const program = localChromiumHtmlRendererProgram({ ...chosen, id: "render", nodePath: process.execPath, ffprobePath: "ffprobe" });
  assert.equal(program.installation!.commands[0]!.args.at(-1), chosen.browserVersion);
  assert.equal(program.installation!.commands[0]!.args.at(-2), chosen.browserCacheDirectory);
  assert.ok(program.installation!.commands[0]!.label!.includes(browserExecutablePath(chosen)));
});
