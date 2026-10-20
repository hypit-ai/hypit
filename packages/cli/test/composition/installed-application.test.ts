import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runInstalledCliApplication } from "../../src/installed-application.js";
import type { CliCommandModule } from "../../src/application.js";
import { cliDistribution } from "../distribution-scenario.js";

const unusedDistribution = cliDistribution();

const hostModule: CliCommandModule = {
  format: "hypit.cli-command@1",
  id: "test.host-bound",
  commands: ["host-tool"],
  writeHelp(_argv, io) { io.write("host tool help\n"); },
  run(_argv, io) { io.write("host port reached\n"); },
};

async function fixture(command = "greet"): Promise<{
  readonly root: string;
  readonly distribution: string;
  readonly project: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-composition-"));
  const distribution = join(root, "distribution");
  const project = join(root, "project");
  const extension = join(project, "node_modules", "@acme", "tools");
  await mkdir(distribution, { recursive: true });
  await mkdir(extension, { recursive: true });
  await writeFile(join(distribution, "package.json"), JSON.stringify({
    name: "@hypit/hypit", version: "0.3.0", hypit: { cli: { use: [] } },
  }));
  await writeFile(join(project, "package.json"), JSON.stringify({
    name: "example", private: true, devDependencies: { "@acme/tools": "1.2.3" },
    hypit: { project: true },
  }));
  await writeFile(join(extension, "package.json"), JSON.stringify({
    name: "@acme/tools", version: "1.2.3", type: "module", exports: { "./cli": "./cli.mjs" },
  }));
  await writeFile(join(extension, "cli.mjs"), `export const cliCommandModules = [{
    format: "hypit.cli-command@1",
    id: "@acme/tools",
    commands: [${JSON.stringify(command)}],
    writeRootHelp(io) { io.write("\\nAcme\\n  ${command} <name>\\n"); },
    writeHelp(_argv, io) { io.write("${command} help\\n"); },
    run(argv, io) { io.write("hello " + (argv[1] ?? "world") + "\\n"); }
  }];\n`);
  return { root, distribution, project };
}

test("the root Host enables and removes one installed project command contribution", async () => {
  const value = await fixture();
  try {
    const options = { distribution: unusedDistribution, distributionRoot: value.distribution, cwd: value.project };
    let selected = "";
    await runInstalledCliApplication(["cli", "use", "@acme/tools/cli"], {
      write: text => { selected += text; },
    }, options);
    assert.match(selected, /selected: @acme\/tools\/cli/u);
    const manifest = JSON.parse(await readFile(join(value.project, "package.json"), "utf8"));
    assert.deepEqual(manifest.hypit.cli.use, ["@acme/tools/cli"]);

    let output = "";
    await runInstalledCliApplication(["greet", "Hypit"], { write: text => { output += text; } }, options);
    assert.equal(output, "hello Hypit\n");

    let status = "";
    await runInstalledCliApplication(["cli", "status", "--json"], {
      write: text => { status += text; },
    }, options);
    assert.deepEqual(JSON.parse(status).contributions[0], {
      origin: "project", specifier: "@acme/tools/cli", package: "@acme/tools",
      version: "1.2.3", commands: ["greet"],
    });

    await runInstalledCliApplication(["cli", "remove", "@acme/tools/cli"], { write() {} }, options);
    await assert.rejects(
      runInstalledCliApplication(["greet"], { write() {} }, options),
      /Unknown command/u,
    );
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("the executable contributes an already-bound command without disguising it as a package selection", async () => {
  const value = await fixture("host-tool");
  try {
    const options = {
      distribution: unusedDistribution,
      distributionRoot: value.distribution,
      cwd: value.project,
      commandModules: [hostModule],
    };
    let output = "";
    await runInstalledCliApplication(["host-tool"], { write: text => { output += text; } }, options);
    assert.equal(output, "host port reached\n");

    let status = "";
    await runInstalledCliApplication(["cli", "status", "--json"], {
      write: text => { status += text; },
    }, options);
    assert.deepEqual(JSON.parse(status).contributions, [{
      origin: "application", id: "test.host-bound", commands: ["host-tool"],
    }]);

    await assert.rejects(
      runInstalledCliApplication(["cli", "use", "@acme/tools/cli"], { write() {} }, options),
      /owned by both test\.host-bound and @acme\/tools/u,
    );
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("installing a package does not grant commands before explicit project selection", async () => {
  const value = await fixture();
  try {
    await assert.rejects(runInstalledCliApplication(["greet"], { write() {} }, {
      distribution: unusedDistribution, distributionRoot: value.distribution, cwd: value.project,
    }), /Unknown command/u);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("a project command contribution cannot replace a root command", async () => {
  const value = await fixture("build");
  try {
    await assert.rejects(runInstalledCliApplication(["cli", "use", "@acme/tools/cli"], { write() {} }, {
      distribution: unusedDistribution, distributionRoot: value.distribution, cwd: value.project,
    }), /cannot replace generic command "build"/u);
    const manifest = JSON.parse(await readFile(join(value.project, "package.json"), "utf8"));
    assert.deepEqual(manifest.hypit, { project: true });
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("a project cannot select a package that its package.json does not own", async () => {
  const value = await fixture();
  try {
    const manifestPath = join(value.project, "package.json");
    await writeFile(manifestPath, JSON.stringify({ name: "example", private: true, hypit: { project: true } }));
    await assert.rejects(runInstalledCliApplication(["cli", "use", "@acme/tools/cli"], { write() {} }, {
      distribution: unusedDistribution, distributionRoot: value.distribution, cwd: value.project,
    }), /not a direct dependency/u);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});
