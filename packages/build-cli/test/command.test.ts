import assert from "node:assert/strict";
import test from "node:test";

import { createBuildCliCommandModules } from "../src/index.js";
import type { CliDistribution } from "@hypit/cli";

const unused = new Proxy({}, {
  get(_target, property) { throw new Error(`unused Build CLI service ${String(property)}`); },
}) as CliDistribution;

test("the Build adapter owns long-compilation commands and their help", async () => {
  const [module] = createBuildCliCommandModules(unused);
  assert(module !== undefined);
  assert(module.commands.includes("build"));
  assert(module.commands.includes("history"));
  assert(!module.commands.includes("version"));
  let output = "";
  await module.writeHelp(["build", "--help"], { write: text => { output += text; } });
  assert.match(output, /hypit build/u);
});
