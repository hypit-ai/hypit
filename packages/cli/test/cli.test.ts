import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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

test("CLI package lock activates an installed package without changing the official host", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-package-lock-"));
  const packageRoot = join(root, "node_modules", "example-empty");
  await mkdir(packageRoot, { recursive: true });
  const implementationDigest = `sha256:${"2".repeat(64)}`;
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "example-empty",
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    svml: { activation: "./activation.mjs" },
  }), "utf8");
  await writeFile(join(packageRoot, "activation.mjs"), `
    const module = { name: "example.empty", version: "1" };
    const digest = ${JSON.stringify(implementationDigest)};
    export default {
      format: "svml.node-package@1",
      name: "example-empty",
      modules: [{ manifest: {
        format: "svml.module@0", name: module.name, version: module.version,
        dependencies: [], types: [], capabilities: [], producers: [],
        surfaces: [{ name: "empty", tag: "Empty", mode: "structured", outputs: [],
          implementation: { kind: "trusted-frontend-surface", locator: "example/empty", digest } }],
      }, specifiers: ["example.empty@1"] }],
      textSurfaces: [{ module, surface: "empty", mode: "structured", implementationDigest: digest,
        handler() { return { records: [], components: [], fragments: [] }; } }],
    };
  `, "utf8");
  const file = join(root, "main.svml");
  const lockPath = join(root, "svml.packages.lock");
  await writeFile(file, `<svml>
    <import as="example" from="example.empty@1"/>
    <example:Empty/>
  </svml>`, "utf8");

  await assert.rejects(
    async () => await runCli(["check", file, "--root", root], { write() {} }),
    /No registered module satisfies example\.empty@1/,
  );

  let lockOutput = "";
  await runCli(["lock-packages", lockPath, "--package", "example-empty", "--root", root], {
    write: (text) => { lockOutput += text; },
  });
  assert.equal(JSON.parse(lockOutput).ok, true);

  let checkOutput = "";
  await runCli(["check", file, "--package-lock", lockPath, "--root", root], {
    write: (text) => { checkOutput += text; },
  });
  const checked = JSON.parse(checkOutput) as { readonly ok: boolean; readonly modules: readonly string[] };
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.modules, ["example.empty@1"]);
});
