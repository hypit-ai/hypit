import assert from "node:assert/strict";
import test from "node:test";

import {
  createSourceBuildCliCommandModules,
} from "../src/index.js";
import { createBuildOperationsCliCommandModules } from "@hypit/build-operations-cli";
import type { BuildCliServices } from "../src/index.js";

const unused = new Proxy({}, {
  get(_target, property) { throw new Error(`unused Build CLI service ${String(property)}`); },
}) as BuildCliServices;

test("Source and accepted-Build operations are independent command modules", async () => {
  const [source] = createSourceBuildCliCommandModules(unused);
  const [operations] = createBuildOperationsCliCommandModules(unused);
  assert(source !== undefined);
  assert(operations !== undefined);
  assert(source.commands.includes("build"));
  assert(!source.commands.includes("history"));
  assert(operations.commands.includes("history"));
  assert(!operations.commands.includes("build"));
  let output = "";
  await source.writeHelp(["build", "--help"], { write: text => { output += text; } });
  assert.match(output, /hypit build/u);
});
