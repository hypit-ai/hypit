import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { canonicalize } from "@hypit/protocol";
import type { RuntimeEndpointAdapterImplementation } from "@hypit/runtime-local/extension";
import { hypitPackage } from "../../src/activation.js";
import { browserDownloadUrl, browserExecutablePath, installHtmlBrowser, recommendedBrowserVersion, requireBrowserExecutable } from "../../src/browser.js";

test("Profile mirror reaches the real preparation command and installs its archive", {
  skip: process.platform === "win32" || spawnSync("zip", ["-v"], { stdio: "ignore" }).status !== 0,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-browser-mirror-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cacheDir = join(directory, "cache");
  const path = browserExecutablePath({ browserCacheDirectory: cacheDir });
  const archiveRoot = dirname(dirname(path));
  const fixtureRoot = join(directory, "fixture");
  const entry = relative(archiveRoot, path);
  await mkdir(dirname(join(fixtureRoot, entry)), { recursive: true });
  // A protocol fixture exercises transfer, unpacking and executable/version inspection, not rendering.
  await writeFile(join(fixtureRoot, entry), `#!${process.execPath}\nconsole.log('Chrome Headless Shell ${recommendedBrowserVersion}');\n`);
  await chmod(join(fixtureRoot, entry), 0o755);
  const archive = join(directory, "browser.zip");
  await promisify(execFile)("zip", ["-q", "-r", archive, "."], { cwd: fixtureRoot });
  const bytes = await readFile(archive);
  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url!);
    response.writeHead(200, { "Content-Length": bytes.length });
    response.end(bytes);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address() as import("node:net").AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/chrome`;
  const adapter = hypitPackage.facets[0]!.implementation as RuntimeEndpointAdapterImplementation;
  const activation = await adapter.activate({
    hostStateRoot: directory, dataRoot: directory, instance: "render", pool: "machine",
    config: canonicalize({ browserCacheDirectory: "cache", browserDownloadBaseUrl: `${baseUrl}/` }),
  });
  const program = activation.program!;
  const command = program.installation!.commands[0]!;
  assert.equal(command.args.at(-1), baseUrl);
  assert.ok(command.label!.includes(browserDownloadUrl({ browserDownloadBaseUrl: baseUrl })));
  assert.equal((await program.probe()).state, "down");
  assert.deepEqual(requests, [], "doctor must not contact the mirror");
  const result = await promisify(execFile)(command.command, [...command.args], { timeout: 30_000 });
  assert.ok(result.stdout.includes(`Download source: ${browserDownloadUrl({ browserDownloadBaseUrl: baseUrl })}`));
  await requireBrowserExecutable(path, recommendedBrowserVersion);
  assert.deepEqual(requests, [new URL(browserDownloadUrl({ browserDownloadBaseUrl: baseUrl })).pathname]);
  await promisify(execFile)(command.command, [...command.args], { timeout: 30_000 });
  assert.equal(requests.length, 1, "healthy installation is reused without a second download");
});

test("failed mirror download or unpack never requests the official source", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-browser-mirror-failure-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let status = 503;
  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url!);
    response.writeHead(status);
    response.end("not a browser archive");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address() as import("node:net").AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/chosen-mirror`;
  const unexpected: unknown[] = [];
  const originalHttpRequest = http.request;
  t.mock.method(http, "request", (...args: Parameters<typeof http.request>) => {
    const options = args[0] as import("node:http").RequestOptions;
    if (options.hostname !== "127.0.0.1" || Number(options.port) !== address.port) {
      unexpected.push(options);
      throw new Error("Unexpected download destination");
    }
    return Reflect.apply(originalHttpRequest, http, args);
  });
  t.mock.method(https, "request", (...args: unknown[]) => { unexpected.push(args[0]); throw new Error("Unexpected HTTPS download"); });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  for (status of [503, 200]) {
    await assert.rejects(installHtmlBrowser(join(directory, String(status)), recommendedBrowserVersion, baseUrl), error => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(baseUrl));
      assert.ok(error.message.includes(recommendedBrowserVersion));
      return true;
    });
  }
  assert.equal(requests.length, 2);
  assert.deepEqual(unexpected, [], "neither HTTP failure nor invalid archive may trigger another source");
});
