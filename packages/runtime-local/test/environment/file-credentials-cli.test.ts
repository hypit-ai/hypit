import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const launcher = fileURLToPath(new URL("../../../../bin/hypit.mjs", import.meta.url));

test("an explicitly selected file Store supports CLI login, repair and logout without starting execution", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-file-credentials-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = join(root, "host");
  const run = (...args: string[]) => exec(process.execPath, [launcher, ...args, "--json"], {
    cwd: root, env: { ...process.env, HYPIT_STATE_HOME: state }, timeout: 30_000, windowsHide: true,
  });
  await writeFile(join(root, "package.json"), JSON.stringify({ private: true, hypit: { project: true } }));
  await run("runtime", "init", "--project", root);
  const profilePath = join(root, "hypit.runtime.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  assert.equal(profile.credentials.local.use, "@hypit/credential-store-local", "initialization preserves the existing starter choice");
  const directory = join(root, "chosen-credentials");
  profile.credentials = { local: { use: "@hypit/credential-store-local", config: { backend: "file", path: directory } } };
  profile.endpoints = { "hypihub.default": { ...profile.endpoints["hypihub.default"], config: {
    ...profile.endpoints["hypihub.default"].config,
    apiKey: { store: "local", key: "test.oauth" },
  } } };
  await writeFile(profilePath, JSON.stringify(profile));
  const auth = (action: string, ...args: string[]) => run("auth", action, "hypihub.default", "--runtime", profilePath, ...args);
  assert.equal(JSON.parse((await auth("status")).stdout).credentials[0].configured, false);
  const input = join(root, "input.txt");
  await writeFile(input, "test-secret-never-display");
  await auth("login", "--from", input);
  const status = (await auth("status")).stdout;
  assert.equal(JSON.parse(status).credentials[0].configured, true);
  assert.doesNotMatch(status, /test-secret-never-display/u);
  const path = join(directory, (await readdir(directory))[0]!);
  await writeFile(path, "corrupt-secret-never-display");
  await assert.rejects(auth("status"), error => {
    const output = String((error as { stdout?: string }).stdout);
    assert.match(JSON.parse(output).error.message, /Cannot decode credential file/u);
    assert.doesNotMatch(output, /corrupt-secret-never-display/u);
    return true;
  });
  await auth("login", "--from", input);
  assert.equal(JSON.parse((await auth("status")).stdout).credentials[0].configured, true);
  await writeFile(path, "corrupt-again");
  await auth("logout");
  assert.equal(JSON.parse((await auth("status")).stdout).credentials[0].configured, false);
  assert.deepEqual(await readdir(directory), []);
});
