import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test from "node:test";

import { downloadVideo, isVideoUrl } from "../src/download.js";

test("only http and https links are fetched; Windows paths stay files", () => {
  assert.equal(isVideoUrl("https://youtu.be/example"), true);
  assert.equal(isVideoUrl("http://example.test/clip.mp4"), true);
  assert.equal(isVideoUrl("C:\\clip.mp4"), false);
  assert.equal(isVideoUrl("c:\\clip.mp4"), false);
  assert.equal(isVideoUrl("file:///tmp/clip.mp4"), false);
  assert.equal(isVideoUrl("/tmp/clip.mp4"), false);
});

test("download with a missing environment reports preparation without installing anything", async (t) => {
  let calls = 0;
  t.mock.method(childProcess, "spawnSync", (command: string, args: string[]) => {
    calls++;
    assert.notEqual(command, "uv");
    assert.deepEqual(args, ["--ignore-config", "--version"]);
    return { status: null, error: new Error("ENOENT"), stdout: "", stderr: "" };
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(downloadVideo("https://example.invalid/video", join(tmpdir(), "never-fetched.mp4")), /download prepare/u);
  assert.equal(calls, 1);
});

test("download resolves its locked runtime from an installed package outside the checkout", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-installed-yt-dlp-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const modules = join(directory, "node_modules", "@hypit");
  const installed = join(modules, "yt-dlp");
  await mkdir(join(installed, "src"), { recursive: true });
  await mkdir(join(installed, "runtime"), { recursive: true });
  await cp(new URL("../package.json", import.meta.url), join(installed, "package.json"));
  await cp(new URL("../src/download.ts", import.meta.url), join(installed, "src", "download.ts"));
  await cp(new URL("../src/environment.ts", import.meta.url), join(installed, "src", "environment.ts"));
  const host = join(modules, "hypit");
  await mkdir(host, { recursive: true });
  await writeFile(join(host, "package.json"), JSON.stringify({
    name: "@hypit/hypit", type: "module", exports: { "./cli": "./cli.mjs" },
  }));
  await writeFile(join(host, "cli.mjs"), `export { hypitHostStateRoot } from ${JSON.stringify(import.meta.resolve("@hypit/hypit/cli"))};`);
  const sourceRuntime = fileURLToPath(new URL("../runtime", import.meta.url));
  for (const name of ["pyproject.toml", "uv.lock"]) await cp(join(sourceRuntime, name), join(installed, "runtime", name));
  let calls = 0;
  t.mock.method(childProcess, "spawnSync", (command: string, args: string[]) => {
    calls++;
    assert.notEqual(command, "uv", "download must not run the environment installer");
    if (args.includes("--version")) return { status: 0, stderr: "", stdout: "2026.08.19\n" };
    return { status: 0, stderr: "", stdout: "" };
  });
  t.mock.method(childProcess, "execFile", (command: string, ...rest: unknown[]) => {
    calls++;
    const callback = (typeof rest.at(-1) === "function" ? rest.at(-1) : undefined) as ((err: Error | null, stdout: string, stderr: string) => void) | undefined;
    const args = (Array.isArray(rest[0]) ? rest[0] : []) as string[];
    if (command === "ffmpeg") {
      callback?.(null, "ffmpeg", "");
      return;
    }
    assert.match(command, /yt-dlp/u);
    assert.ok(args.includes("--no-remote-components"));
    assert.ok(args.includes("--ignore-config"));
    assert.equal(args.at(-1), "https://example.test/video");
    const output = args[args.indexOf("--output") + 1]!.replace("%(ext)s", "mp4");
    writeFileSync(output, "downloaded bytes");
    callback?.(null, "", "");
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const module = await import(pathToFileURL(join(installed, "src", "download.ts")).href);
  const target = join(directory, "reference.mp4");
  await module.downloadVideo("https://example.test/video", target);
  assert.equal(await readFile(target, "utf8"), "downloaded bytes");
  assert.equal(calls, 3);
});

test("a link serving one muxed file is remuxed into the target container", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-remux-yt-dlp-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  t.mock.method(childProcess, "spawnSync", () => ({ status: 0, stderr: "", stdout: "2026.08.19\n" }));
  t.mock.method(childProcess, "execFile", (command: string, ...rest: unknown[]) => {
    const callback = (typeof rest.at(-1) === "function" ? rest.at(-1) : undefined) as ((err: Error | null, stdout: string, stderr: string) => void) | undefined;
    const args = (Array.isArray(rest[0]) ? rest[0] : []) as string[];
    if (command !== "ffmpeg") {
      // The link offers only one muxed MP4 format, so `b` wins and no merge runs.
      const remux = args.includes("--remux-video") ? args[args.indexOf("--remux-video") + 1]! : "mp4";
      writeFileSync(args[args.indexOf("--output") + 1]!.replace("%(ext)s", remux), `${remux} container`);
    }
    callback?.(null, "", "");
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const target = join(directory, "reference.mkv");
  await downloadVideo("https://example.test/video", target);
  assert.equal(await readFile(target, "utf8"), "mkv container");
});

test("the pinned yt-dlp project belongs to its behavior package", () => {
  const project = fileURLToPath(new URL("../runtime", import.meta.url));
  assert.ok(existsSync(join(project, "pyproject.toml")));
  assert.ok(existsSync(join(project, "uv.lock")));
});

test("the pinned yt-dlp environment includes its browser-impersonation transport", async () => {
  const project = fileURLToPath(new URL("../runtime", import.meta.url));
  const [declaration, lock] = await Promise.all([
    readFile(join(project, "pyproject.toml"), "utf8"),
    readFile(join(project, "uv.lock"), "utf8"),
  ]);
  assert.match(declaration, /yt-dlp\[default,curl-cffi\]==2026\.8\.19/u);
  assert.match(lock, /name = "curl-cffi"/u);
});
