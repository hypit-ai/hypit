import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "@svml/cli";

test("official v2 CLI checks a real Script source through the Node compiler host", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-"));
  const file = join(root, "main.svml");
  await writeFile(join(root, "studio.svs"), `<sheet version="1">
    caption.host {
      color: #ffffff;
      font-size: 72;
    }
  </sheet>`, "utf8");
  await writeFile(file, `<svml>
    <import from="@svml/script@1"/>
    <import as="studio" from="./studio.svs" using="@svml/svs@1"/>
    <script id="story">
      <opening>
        <ALICE>Meaning becomes the source.
      </opening>
    </script>
  </svml>`, "utf8");
  let output = "";
  await runCli(["check", file], { write: (text) => { output += text; } });
  const result = JSON.parse(output) as {
    readonly ok: boolean;
    readonly units: number;
    readonly modules: readonly string[];
    readonly exports: readonly { readonly name: string; readonly kind: string }[];
  };
  assert.equal(result.ok, true);
  assert.equal(result.units, 2);
  assert.deepEqual([...result.modules].sort(), [
    "@svml/narrative@0.0.0-dev",
    "@svml/script@0.0.0-dev",
    "@svml/svs@1",
  ]);
  assert.deepEqual(result.exports, [{ name: "story", type: {
    module: { name: "@svml/narrative", version: "0.0.0-dev" },
    name: "Narrative",
  }, kind: "record" }]);
});

test("official v2 CLI closes the explicit HyperFrames render package without loading a Provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-render-"));
  const file = join(root, "main.svml");
  await writeFile(file, `<svml>
    <import as="render" from="@svml/hyperframes-render@1"/>
  </svml>`, "utf8");
  let output = "";
  await runCli(["check", file], { write: (text) => { output += text; } });
  const result = JSON.parse(output) as {
    readonly ok: boolean;
    readonly modules: readonly string[];
    readonly exports: readonly unknown[];
  };
  assert.equal(result.ok, true);
  assert.deepEqual([...result.modules].sort(), [
    "@svml/composition@0.0.0-dev",
    "@svml/hyperframes-render@0.0.0-dev",
    "@svml/hyperframes@0.0.0-dev",
    "@svml/media-pipeline@0.0.0-dev",
    "@svml/media@0.0.0-dev",
    "@svml/narrative@0.0.0-dev",
    "@svml/program-space@0.0.0-dev",
    "@svml/speech@0.0.0-dev",
  ]);
  assert.deepEqual(result.exports, []);
});
