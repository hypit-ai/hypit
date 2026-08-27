import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createReferenceVideoTools } from "../src/tools.js";

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "hypit-gates-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "gate-fixture", private: true }), "utf8");
  await mkdir(join(root, "packages", "local-empty", "src"), { recursive: true });
  await writeFile(join(root, "packages", "local-empty", "package.json"), JSON.stringify({
    name: "@fixture/local-empty", version: "0.0.0-dev", type: "module", exports: { ".": "./src/index.ts" },
    hypit: { activation: "./src/activation.ts" }, dependencies: {},
  }), "utf8");
  await writeFile(join(root, "packages", "local-empty", "src", "index.ts"), "export const empty = true;\n", "utf8");
  await writeFile(join(root, "packages", "local-empty", "src", "activation.ts"), "export default { format: 'hypit.node-package@1', modules: [], hostFacets: [] };\n", "utf8");
  await writeFile(join(root, "main.svml"), `<svml><import as="script" from="@hypit/script@1"/><script:Script id="story"><opening>one two three four five</opening></script></svml>\n`, "utf8");
  await writeFile(join(root, "build.svrun"), `<svrun><author source="main.svml"/></svrun>\n`, "utf8");
  return root;
}

test("local package gate rejects an empty activation and an unbroken long Cue", async () => {
  const root = await project();
  const tools = createReferenceVideoTools({ packageRoot: root });
  const packageResult = await tools.validate_local_author_packages({ run: join(root, "build.svrun") });
  assert.equal(packageResult.passed, false);
  assert.match(JSON.stringify(packageResult), /PACKAGE_NO_SURFACE/u);
  const cueResult = await tools.validate_script_cues({ run: join(root, "build.svrun") });
  assert.equal(cueResult.passed, false);
  assert.equal((cueResult.violations as { wordCount: number }[])[0]?.wordCount, 5);
});
