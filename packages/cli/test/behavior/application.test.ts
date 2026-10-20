import assert from "node:assert/strict";
import test from "node:test";

import { runCliApplication } from "../../src/application.js";
import type { CliApplication, CliCommandModule } from "../../src/application.js";
import { cliDistribution } from "../distribution-scenario.js";

const unusedDistribution = cliDistribution();

function application(commandModules: readonly CliCommandModule[]): CliApplication {
  return { distribution: unusedDistribution, commandModules };
}

test("application dispatches one explicitly assembled command module", async () => {
  const calls: string[][] = [];
  let receivedContext: Parameters<CliCommandModule["run"]>[2] | undefined;
  const module: CliCommandModule = {
    format: "hypit.cli-command@1",
    id: "test.tools",
    commands: ["probe", "inspect-tool"],
    writeHelp(argv, io) { io.write(`help:${argv.join(" ")}`); },
    run(argv, io, context) { calls.push([...argv]); receivedContext = context; io.write("ran"); },
  };
  let output = "";
  await runCliApplication(["probe", "asset.bin"], { write: text => { output += text; } }, application([module]));
  assert.equal(output, "ran");
  assert.deepEqual(calls, [["probe", "asset.bin"]]);
  assert.equal(receivedContext?.distribution, unusedDistribution);
  assert.equal(typeof receivedContext?.cwd, "string");
  assert.equal(typeof receivedContext?.resolveProjectRoot, "function");
});

test("application composes root and topic help without teaching generic CLI the module", async () => {
  const module: CliCommandModule = {
    format: "hypit.cli-command@1",
    id: "test.frames",
    commands: ["frames"],
    writeRootHelp(io) { io.write("\nFrames\n  frames <source>\n"); },
    writeHelp(_argv, io) { io.write("frames help\n"); },
    run() { throw new Error("help cannot execute the command"); },
  };
  let root = "";
  await runCliApplication([], { write: text => { root += text; } }, application([module]));
  assert.match(root, /check <source>/u);
  assert.match(root, /Frames\n  frames <source>/u);

  let topic = "";
  await runCliApplication(["help", "frames"], { write: text => { topic += text; } }, application([module]));
  assert.equal(topic, "frames help\n");
});

test("the generic Host has no second package installation command", async () => {
  let help = "";
  await runCliApplication([], { write: text => { help += text; } }, application([]));
  assert.doesNotMatch(help, /packages install|packages status/u);
  await assert.rejects(
    runCliApplication(["packages", "status", "example@1.0.0"], { write() {} }, application([])),
    /Unknown command/u,
  );
});

test("arguments after passthrough do not become application help", async () => {
  let ran = false;
  const module: CliCommandModule = {
    format: "hypit.cli-command@1",
    id: "test.capture",
    commands: ["capture"],
    writeHelp() { throw new Error("script --help must remain script input"); },
    run() { ran = true; },
  };
  await runCliApplication(["capture", "run", "script.mjs", "--", "--help"], { write() {} }, application([module]));
  assert.equal(ran, true);
});

test("application rejects command shadowing instead of silently choosing an owner", async () => {
  const command = (id: string, name: string): CliCommandModule => ({
    format: "hypit.cli-command@1",
    id,
    commands: [name],
    writeHelp() {},
    run() {},
  });
  await assert.rejects(
    runCliApplication(["tool"], { write() {} }, application([command("one", "tool"), command("two", "tool")])),
    /owned by both one and two/u,
  );
  await assert.rejects(
    runCliApplication(["build"], { write() {} }, application([command("video", "build")])),
    /cannot replace generic command "build"/u,
  );
});
