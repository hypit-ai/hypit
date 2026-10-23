import assert from "node:assert/strict";
import test from "node:test";

import { CompilerError, ModulePackageRegistry } from "@hypit/compiler";
import type { ModuleManifest } from "@hypit/protocol";

function emptyManifest(name: string, version = "1"): ModuleManifest {
  return {
    format: "hypit.module@1",
    name,
    version,
    dependencies: [],
    types: [],
    capabilities: [],
    producers: [],
  };
}

test("registered module imports close transitive module dependencies", () => {
  const base = emptyManifest("example.base");
  const feature: ModuleManifest = {
    ...emptyManifest("example.feature"),
    dependencies: [{ name: base.name, version: base.version }],
  };
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: base });
  modules.register({ manifest: feature, specifiers: ["example.feature@stable"] });

  assert.deepEqual(modules.resolve("example.feature@stable"), { name: feature.name, version: feature.version });
  assert.deepEqual(
    modules.createClosure(["example.feature@stable"]).modules.map((item) => item.name).sort(),
    ["example.base", "example.feature"],
  );
});

test("module registration is atomic", () => {
  const first = emptyManifest("example.first");
  const second = emptyManifest("example.second");
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: first, specifiers: ["example.shared@1"] });
  assert.throws(
    () => modules.register({ manifest: second, specifiers: ["example.shared@1"] }),
    (error: unknown) => error instanceof CompilerError && error.code === "DUPLICATE_MODULE_SPECIFIER",
  );
  assert.equal(modules.resolve("example.second@1"), undefined);
});
