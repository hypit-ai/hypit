import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createActivatedNodeCompiler,
  createNodeAuthorPackageLock,
  loadNodeAuthorPackages,
  writeNodeAuthorPackageLock,
} from "@svml/package-loader-node";

const implementationDigest = `sha256:${"1".repeat(64)}`;

async function fixture(): Promise<{
  readonly root: string;
  readonly activation: string;
  readonly dependency: string;
  readonly source: string;
  readonly lock: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "svml-package-loader-"));
  const packageRoot = join(root, "node_modules", "example-card");
  const dependencyRoot = join(root, "node_modules", "example-helper");
  await mkdir(packageRoot, { recursive: true });
  await mkdir(dependencyRoot, { recursive: true });
  const activation = join(packageRoot, "activation.mjs");
  const dependency = join(dependencyRoot, "index.mjs");
  await writeFile(join(dependencyRoot, "package.json"), JSON.stringify({
    name: "example-helper",
    version: "1.0.0",
    type: "module",
    exports: "./index.mjs",
  }, null, 2), "utf8");
  await writeFile(dependency, "export const helper = true;\n", "utf8");
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "example-card",
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    dependencies: { "example-helper": "1.0.0" },
    svml: { authorActivation: "./activation.mjs" },
  }, null, 2), "utf8");
  await writeFile(activation, `
    const module = { name: "example.card", version: "1" };
    const digest = ${JSON.stringify(implementationDigest)};
    export default {
      format: "svml.node-author-package@1",
      name: "example-card",
      modules: [{
        manifest: {
          format: "svml.module@0",
          name: module.name,
          version: module.version,
          dependencies: [],
          types: [],
          capabilities: [],
          surfaces: [{
            name: "card",
            tag: "Card",
            mode: "structured",
            outputs: [],
            implementation: {
              kind: "trusted-frontend-surface",
              locator: "example-card/card",
              digest,
            },
          }],
          producers: [],
        },
        specifiers: ["example.card@1"],
      }],
      textSurfaces: [{
        module,
        surface: "card",
        mode: "structured",
        implementationDigest: digest,
        handler() { return { records: [], components: [], fragments: [] }; },
      }],
    };
  `, "utf8");
  const source = join(root, "main.svml");
  await writeFile(source, `<svml>
    <import as="example" from="example.card@1"/>
    <example:Card/>
  </svml>`, "utf8");
  return { root, activation, dependency, source, lock: join(root, "svml.packages.lock") };
}

test("an installed locked package adds a Surface without an official CLI registration", async () => {
  const item = await fixture();
  const lock = await createNodeAuthorPackageLock(["example-card"], item.root);
  assert.deepEqual(lock.artifacts.map((artifact) => artifact.name), ["example-card", "example-helper"]);
  await writeNodeAuthorPackageLock(item.lock, lock);
  const packages = await loadNodeAuthorPackages(item.lock, item.root);
  const compiler = createActivatedNodeCompiler(packages, { root: item.root });
  const result = await compiler.compileFile(item.source);

  assert.equal(packages[0]?.name, "example-card");
  assert.deepEqual(result.program.closure.modules.map((module) => module.ref), [
    { name: "example.card", version: "1" },
  ]);
  assert.equal(result.elaboration.graph.operations.length, 0);
});

test("dependency bytes are rejected before a locked activation is reused", async () => {
  const item = await fixture();
  const lock = await createNodeAuthorPackageLock(["example-card"], item.root);
  await writeNodeAuthorPackageLock(item.lock, lock);
  await writeFile(item.dependency, `${await readFile(item.dependency, "utf8")}\n// changed bytes\n`, "utf8");

  await assert.rejects(
    async () => await loadNodeAuthorPackages(item.lock, item.root),
    /installed author package bytes do not match the lock/,
  );
});
