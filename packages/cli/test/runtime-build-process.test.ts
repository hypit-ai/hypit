import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  createNodePackageLock,
  writeNodePackageLock,
} from "@narratage/package-loader-node";

import {
  ensureRuntimeProcess,
  runtimeProcessStatus,
  stopRuntimeProcess,
} from "../src/runtime-process.js";

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
  const authorLockPath = join(project, "svml.packages.lock");
  const runtimeLockPath = join(project, "svml.runtime-packages.lock");
  const profile = join(project, "svml.runtime.json");
  const source = join(project, "main.svml");
  const run = join(project, "build.svrun");
  const build = "process-recovery-build";
  try {
    await writeNodePackageLock(authorLockPath, await createNodePackageLock([
      "@narratage/run-markup",
      "@narratage/text",
    ], process.cwd()));
    await writeNodePackageLock(runtimeLockPath, await createNodePackageLock([
      "@narratage/local",
      "@narratage/store-sqlite",
      "@narratage/artifact-store-fs",
      "@narratage/credential-store-env",
    ], process.cwd()));
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

<svrun version="1" targets="delivery">
  <author source="./main.svml"/>
  <target-set id="delivery">
    <target output="message-004" accepts="exact"/>
  </target-set>
</svrun>
`, "utf8");
    await writeFile(profile, JSON.stringify({
      format: "svml.runtime-config@1",
      root: ".",
      packageRoot: process.cwd(),
      packageLock: "./svml.packages.lock",
      runtimePackageLock: "./svml.runtime-packages.lock",
      runtimeServices: [
        { use: "@narratage/local", instance: "execution" },
        { use: "@narratage/store-sqlite", instance: "state", config: { path: ".svml/runtime.sqlite" } },
        { use: "@narratage/artifact-store-fs", instance: "artifacts", config: { path: ".svml/artifacts" } },
        { use: "@narratage/credential-store-env", instance: "credentials.env", config: {} },
      ],
      services: {
        scheduler: "execution.scheduler",
        worker: "execution.worker",
        stores: {
          build: "state.builds",
          operations: "state.operations",
          dispatch: "state.dispatch",
          journal: "state.journal",
          artifacts: "artifacts",
          credentials: ["credentials.env"],
        },
      },
      endpoints: [],
      permissions: ["filesystem:state", "filesystem:artifacts", "environment:credentials"],
      scheduling: { maxConcurrency: 2 },
    }, null, 2), "utf8");

    const parked = await ensureRuntimeProcess(profile, {
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
    }, 5_000);
    const submitted = await cli(project, [
      "build", run,
      "--build-id", build,
      "--runtime", profile,
      "--package-lock", authorLockPath,
      "--package-root", process.cwd(),
      "--root", project,
      "--no-services",
    ]);
    assert.equal(submitted.status, "queued", "the foreground CLI reports durable admission, not execution ownership");
    assert.equal((submitted.dispatch as { readonly phase?: string }).phase, "queued");
    const originalProcess = await runtimeProcessStatus(profile);
    assert.equal(originalProcess.state, "running", "the detached Runtime process outlives the submitting CLI process");
    assert.equal(originalProcess.pid, parked.pid, "build reuses one profile-scoped Runtime process");

    const follower = spawn(process.execPath, [
      "--import", tsxImport, cliEntry,
      "build", run,
      "--build-id", build,
      "--runtime", profile,
      "--package-lock", authorLockPath,
      "--package-root", process.cwd(),
      "--root", project,
      "--no-services",
      "--follow",
      "--json",
    ], { cwd: project, stdio: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(follower.exitCode, null, "--follow is observing the still-queued Build");
    const followerExit = new Promise<void>((resolve, reject) => {
      follower.once("exit", () => resolve());
      follower.once("error", reject);
    });
    follower.kill("SIGINT");
    await followerExit;
    const afterInterrupt = await cli(project, ["status", build, "--runtime", profile]);
    assert.equal((afterInterrupt.dispatch as { readonly admission?: string }).admission, "open",
      "interrupting --follow does not translate into Build cancellation");

    await stopRuntimeProcess(profile, 10_000);
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
  } finally {
    await stopRuntimeProcess(profile, 10_000).catch(() => undefined);
    await rm(project, { recursive: true, force: true });
  }
});
