import assert from "node:assert/strict";
import test from "node:test";

import { createLocalMediaCliCommandModules } from "../src/cli.js";

test("the local media CLI adapter explicitly owns the media command", async () => {
  const module = createLocalMediaCliCommandModules()
    .find(candidate => candidate.commands.some(command => command === "media"));
  assert(module !== undefined);
  let output = "";
  await module.writeHelp(["media", "--help"], { write: text => { output += text; } });
  assert.match(output, /hypit media/u);
});
