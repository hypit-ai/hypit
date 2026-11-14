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

test("the CLI changes an Environment-owned credential without opening a Generation Runtime", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hypit-environment-auth-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = join(root, "host");
  const credentials = join(root, "credentials");
  const environment = join(root, "hypit.environment.json");
  await writeFile(join(root, "package.json"), JSON.stringify({ private: true, hypit: { project: true } }));
  await writeFile(environment, JSON.stringify({
    format: "hypit.execution-environment-local@1",
    dataRoot: join(root, "environment-state"),
    credentials: {
      local: { use: "@hypit/credential-store-local", config: { backend: "file", path: credentials } },
    },
    endpoints: {
      "hypihub.default": {
        use: "@hypit/provider-hypihub",
        config: {
          baseUrl: "https://hypit.ai",
          apiKey: { store: "local", key: "test.oauth" },
        },
      },
    },
  }));
  const run = (...args: string[]) => exec(process.execPath, [launcher, ...args, "--json"], {
    cwd: root,
    env: { ...process.env, HYPIT_STATE_HOME: state },
    timeout: 30_000,
    windowsHide: true,
  });
  const auth = (action: string, ...args: string[]) => run(
    "auth", action, "hypihub.default", "--environment", environment, ...args,
  );
  assert.equal(JSON.parse((await auth("status")).stdout).credentials[0].configured, false);
  const input = join(root, "input.txt");
  await writeFile(input, "test-secret-never-display");
  const login = await auth("login", "--from", input);
  assert.doesNotMatch(login.stdout, /test-secret-never-display/u);
  assert.equal(JSON.parse((await auth("status")).stdout).credentials[0].configured, true);
  const credential = join(credentials, (await readdir(credentials))[0]!);
  await writeFile(credential, "corrupt-secret-never-display");
  await assert.rejects(auth("status"), (error) => {
    const output = String((error as { stdout?: string }).stdout);
    assert.match(JSON.parse(output).error.message, /Cannot decode credential file/u);
    assert.doesNotMatch(output, /corrupt-secret-never-display/u);
    return true;
  });
  await auth("login", "--from", input);
  await writeFile(credential, "corrupt-again");
  await auth("logout");
  assert.equal(JSON.parse((await auth("status")).stdout).credentials[0].configured, false);
  assert.deepEqual(await readdir(credentials), []);
  assert.equal(await readFile(environment, "utf8").then((value) => JSON.parse(value).format),
    "hypit.execution-environment-local@1");
});
