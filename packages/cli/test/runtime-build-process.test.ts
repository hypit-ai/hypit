import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  loadNodePackageSelection,
} from "@narratage/package-loader-node";
import { digestOf } from "@narratage/protocol";
import { runtimeConfigRevision } from "@narratage/runtime-local/config";

import {
  ensureRuntimeProcess,
  runtimeProcessStatus,
  stopRuntimeProcess,
} from "@narratage/runtime-local/worker-process";

const execute = promisify(execFile);
const cliEntry = join(process.cwd(), "packages", "video-cli", "src", "cli.ts");
const tsxImport = import.meta.resolve("tsx");

async function cli(project: string, argv: readonly string[]): Promise<Record<string, unknown>> {
  const result = await execute(process.execPath, ["--import", tsxImport, cliEntry, ...argv, "--json"], {
    cwd: project,
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

async function cliHuman(project: string, argv: readonly string[]): Promise<string> {
  const result = await execute(process.execPath, ["--import", tsxImport, cliEntry, ...argv, "--no-color"], {
    cwd: project,
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout;
}

function authorSource(length: number): string {
  const chain = Array.from({ length }, (_, index) => {
    const id = `message-${String(index).padStart(3, "0")}`;
    const previous = index === 0 ? "seed" : `message-${String(index - 1).padStart(3, "0")}`;
    return `  <text:Render id="${id}" template={kit.pass}>\n`
      + `    <text:Set name="input" text={${previous}}/>\n`
      + "  </text:Render>";
  }).join("\n");
  return `<?svml using="@narratage/markup@1"?>

<svml>
  <import as="text" from="@narratage/text@1"/>
  <import as="kit" source="./pass.svs"/>
  <text:Value id="seed">durable execution</text:Value>
${chain}
</svml>
`;
}

async function waitForBuild(
  project: string,
  profile: string,
  build: string,
  timeoutMs = 20_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, unknown> | undefined;
  while (Date.now() <= deadline) {
    last = await cli(project, ["status", build, "--runtime", profile]);
    const dispatch = last.dispatch as { readonly phase?: string } | undefined;
    if (dispatch?.phase === "terminal") return last;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Build ${build} did not finish: ${JSON.stringify(last)}`);
}

test("CLI exits after durable submission and a restarted detached Worker completes a non-video Build", async () => {
  const project = await mkdtemp(join(tmpdir(), "narratage-runtime-build-process-"));
  const profile = join(project, "narratage.runtime.json");
  const source = join(project, "main.svml");
  const run = join(project, "build.svrun");
  try {
    await writeFile(join(project, "pass.svs"), `<?svml using="@narratage/text/svs@1"?>

<sheet version="1" id="pass">
  text-template.pass { separator: paragraph; }
  text-template.pass.block.input {
    kind: slot;
    order: 10;
    slot: input;
  }
</sheet>
`, "utf8");
    await writeFile(source, authorSource(5), "utf8");
    await writeFile(run, `<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="message-004"/>
</svrun>
`, "utf8");
    await writeFile(profile, JSON.stringify({
      format: "narratage.runtime-profile@1",
      runtime: {
        use: "@narratage/runtime-local",
        config: {
          dataRoot: ".narratage/runtime",
          infrastructure: {
            execution: { use: "@narratage/runtime-local" },
            state: { use: "@narratage/store-sqlite", config: { path: "runtime.sqlite" } },
            artifacts: { use: "@narratage/artifact-store-fs", config: { path: "artifacts" } },
            credentials: { use: "@narratage/credential-store-env", config: {} },
          },
          roles: {
            scheduler: { from: "execution", part: "scheduler" },
            worker: { from: "execution", part: "worker" },
            buildStore: { from: "state", part: "builds" },
            operationStore: { from: "state", part: "operations" },
            dispatchStore: { from: "state", part: "dispatch" },
            artifactStore: { from: "artifacts", part: "store" },
            credentialStores: [{ from: "credentials", part: "store" }],
          },
          endpoints: {},
          capacity: { maxActiveOperations: 2 },
        },
      },
    }, null, 2), "utf8");

    const dataRoot = join(project, ".narratage", "runtime");
    const authorPackages = await loadNodePackageSelection([
      "@narratage/run-markup",
      "@narratage/text",
    ], process.cwd());
    const workerRevision = digestOf({
      format: "narratage.runtime-worker-revision@1",
      profile: await runtimeConfigRevision(profile),
    });
    const parked = await ensureRuntimeProcess(profile, dataRoot, {
      command: process.execPath,
      args: ["-e", `
        const fs = require("node:fs");
        const path = require("node:path");
        const index = process.argv.indexOf("--ready-file");
        const ready = process.argv[index + 1];
        fs.mkdirSync(path.dirname(ready), { recursive: true });
        fs.writeFileSync(ready, String(process.pid));
        process.on("SIGTERM", () => process.exit(0));
        setInterval(() => {}, 1000);
      `],
    }, workerRevision, 5_000, authorPackages.map((item) => item.specifier));
    const submitted = await cli(project, [
      "build", run,
      "--runtime", profile,
      "--workspace", project,
      "--no-programs",
    ]);
    const build = String(submitted.build);
    assert.match(build, /^bld_[0-9a-f-]{36}$/u);
    assert.equal(submitted.status, "queued", "the foreground CLI reports durable admission, not execution ownership");
    assert.equal((submitted.dispatch as { readonly phase?: string }).phase, "queued");
    const originalProcess = await runtimeProcessStatus(profile, dataRoot, workerRevision);
    assert.equal(originalProcess.state, "running", "the detached Runtime process outlives the submitting CLI process");
    assert.equal(originalProcess.pid, parked.pid, "build reuses one profile-scoped Runtime process");

    await stopRuntimeProcess(profile, dataRoot, 10_000);
    const interrupted = await cli(project, ["status", build, "--runtime", profile]);
    assert.notEqual((interrupted.dispatch as { readonly phase?: string }).phase, "terminal",
      "the long Build is durably incomplete when its first Worker is killed");

    const restarted = await cli(project, ["runtime", "up", profile]);
    assert.equal((restarted.worker as { readonly state?: string }).state, "running");
    assert.notEqual((restarted.worker as { readonly pid?: number }).pid, originalProcess.pid);
    const logs = await cli(project, ["runtime", "logs", profile]);
    assert.equal(logs.format, "narratage.cli-runtime-logs@1");
    assert.equal(typeof logs.path, "string");
    assert.equal(typeof logs.text, "string");
    assert.match(await cliHuman(project, ["runtime", "logs", profile]), /Runtime logs[\s\S]*Path/u);
    const completed = await waitForBuild(project, profile, build);
    assert.equal((completed.build as { readonly status?: string }).status, "complete");
    assert.equal((completed.dispatch as { readonly terminal?: string }).terminal, "complete");

    const queue = await cli(project, ["queue", "--runtime", profile]);
    assert.equal((queue.dispatches as readonly { readonly phase: string }[])
      .filter((item) => item.phase !== "terminal").length, 0);
    const archive = await cli(project, ["builds", "--runtime", profile]);
    assert.deepEqual((archive.builds as readonly { readonly build: string }[]).map((item) => item.build), [build]);
    const inspected = await cli(project, ["inspect", build, "--runtime", profile]);
    assert.equal((inspected.archive as { readonly status?: string }).status, "complete");
    const exported = join(project, "output", "message.json");
    const materialized = await cli(project, [
      "get", build, "--runtime", profile, "--name", "message-004", "--to", exported,
    ]);
    assert.equal((materialized.materialized as { readonly kind?: string }).kind, "json");
    assert.notEqual(JSON.parse(await readFile(exported, "utf8")), undefined);

    await stopRuntimeProcess(profile, dataRoot, 10_000);
    const repeated = await cli(project, [
      "build", run,
      "--runtime", profile,
      "--workspace", project,
      "--no-programs",
      "--follow",
    ]);
    assert.equal(repeated.status, "complete");
    assert.notEqual(repeated.build, build,
      "repeating the same Run Source creates a fresh Build instead of reclaiming source-derived state");
  } finally {
    await stopRuntimeProcess(profile, join(project, ".narratage", "runtime"), 10_000).catch(() => undefined);
    await rm(project, { recursive: true, force: true });
  }
});
