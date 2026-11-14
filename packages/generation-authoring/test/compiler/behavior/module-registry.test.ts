import assert from "node:assert/strict";
import test from "node:test";

import { CompilerError, ModulePackageRegistry } from "@hypit/generation-authoring/compiler";
import { createGenerationModuleFacet, generationModulesFromFacets } from "@hypit/generation-build";
import type { GenerationModuleDefinition } from "@hypit/generation-build";

function emptyManifest(name: string): GenerationModuleDefinition {
  return {
    name,
    dependencies: [],
    types: [],
    capabilities: [],
    producers: [],
  };
}

test("registered module imports close transitive module dependencies", () => {
  const base = emptyManifest("example.base");
  const feature: GenerationModuleDefinition = {
    ...emptyManifest("example.feature"),
    dependencies: [{ name: base.name }],
  };
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: base });
  modules.register({ manifest: feature });

  assert.deepEqual(modules.resolve("example.feature"), { name: feature.name });
  assert.deepEqual(
    modules.createClosure(["example.feature"]).modules.map((item) => item.name).sort(),
    ["example.base", "example.feature"],
  );
});

test("module registration is atomic", () => {
  const first = emptyManifest("example.first");
  const second = emptyManifest("example.first");
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: first });
  assert.throws(
    () => modules.register({ manifest: second }),
    (error: unknown) => error instanceof CompilerError && error.code === "DUPLICATE_MODULE_PACKAGE",
  );
  assert.equal(modules.resolve("example.second@1"), undefined);
});

test("Generation declarations are installed independently from Module identity", () => {
  const manifest: GenerationModuleDefinition = {
    ...emptyManifest("example.generated"),
    types: ["Output"],
    producers: [{
      name: "make-output",
      inputs: [],
      result: {
        kind: "output",
        name: "output",
        type: { module: { name: "example.generated" }, name: "Output" },
      },
    }],
  };
  const modules = new ModulePackageRegistry();
  modules.register({ manifest });
  assert.deepEqual(modules.createClosure([manifest.name]).modules[0]?.producers, []);

  const [declaration] = generationModulesFromFacets([createGenerationModuleFacet(manifest)]);
  modules.registerGeneration(declaration!);
  assert.deepEqual(
    modules.createClosure([manifest.name]).modules[0]?.producers.map((item) => item.name),
    ["make-output"],
  );
});
