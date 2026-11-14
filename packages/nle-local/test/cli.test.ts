import assert from "node:assert/strict";
import test from "node:test";

import { createLocalNleCliCommandModules } from "../src/cli.js";

test("the local NLE CLI adapter presents delivery and sparse-frame commands", async () => {
  const module = createLocalNleCliCommandModules()
    .find(candidate => candidate.commands.some(command => command === "nle"));
  assert(module !== undefined);
  let output = "";
  await module.writeHelp(["nle", "--help"], { write: text => { output += text; } });
  assert.match(output, /hypit nle export <project\.nle\.json> --to <output\.mp4>/u);
  assert.match(output, /hypit nle frames <project\.nle\.json>/u);
  assert.match(output, /hypit nle review <project\.nle\.json>/u);
  assert.match(output, /--picture-target <name>/u);
  assert.match(output, /--resolution <WxH>/u);
  assert.match(output, /--start-frame <n>/u);
  assert.match(output, /--end-frame-exclusive <n>/u);
});
