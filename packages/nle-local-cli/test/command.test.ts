import assert from "node:assert/strict";
import test from "node:test";

import { createLocalNleCliCommandModules } from "../src/index.js";

test("the local NLE CLI adapter explicitly owns the export command", async () => {
  const module = createLocalNleCliCommandModules()
    .find(candidate => candidate.commands.some(command => command === "nle"));
  assert(module !== undefined);
  let output = "";
  await module.writeHelp(["nle", "--help"], { write: text => { output += text; } });
  assert.match(output, /hypit nle export <project\.nle\.json> --to <output\.mp4>/u);
});
