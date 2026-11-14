import assert from "node:assert/strict";
import test from "node:test";

import {
  capabilityIdentity,
  capabilityKey,
  createCapabilityRef,
  createModuleFacet,
  createModuleRef,
  createProducerRef,
  createTypeRef,
  moduleIdentity,
  moduleKey,
  modulesFromFacets,
  parseCapabilityKey,
  parseModuleKey,
  parseProducerKey,
  parseTypeKey,
  producerIdentity,
  producerKey,
  typeIdentity,
  typeKey,
} from "@hypit/module";

test("semantic Module references use package-owned logical names", () => {
  const module = createModuleRef("@example/visual");
  const type = createTypeRef(module, "Frame");
  const capability = createCapabilityRef(module, "image-generation");
  const producer = createProducerRef(createModuleRef("@example/visual"), "Render");

  assert.deepEqual(parseModuleKey(moduleKey(module)), module);
  assert.deepEqual(parseTypeKey(typeKey(type)), type);
  assert.deepEqual(parseCapabilityKey(capabilityKey(capability)), capability);
  assert.deepEqual(parseProducerKey(producerKey(producer)), producer);
  assert.deepEqual(parseModuleKey("@example/visual"), module);
  assert.throws(() => parseTypeKey("@example/visual"), /module#name/u);
  assert.throws(() => parseCapabilityKey("image-generation"), /capability key/u);
  assert.throws(() => parseProducerKey("@example/visual#"), /module#name/u);
  assert.throws(() => createModuleRef("example#module"), /must not contain #/u);
  assert.throws(() => createModuleRef("@example/visual@1"), /unversioned logical package name/u);
  assert.throws(() => createTypeRef(createModuleRef("example"), "one#two"), /must not contain #/u);

  assert.notEqual(
    moduleIdentity({ name: "example@one" }),
    moduleIdentity({ name: "example" }),
  );
  assert.notEqual(typeIdentity({ module: { name: "example.one" }, name: "two" }),
    typeIdentity({ module: { name: "example" }, name: "one.two" }));
  assert.notEqual(capabilityIdentity({ module: { name: "example.one" }, name: "two" }),
    capabilityIdentity({ module: { name: "example" }, name: "one.two" }));
  assert.notEqual(producerIdentity({ module: { name: "example.one" }, name: "two" }),
    producerIdentity({ module: { name: "example" }, name: "one.two" }));
});

test("Module Facets publish one exact Manifest without Generation ownership", () => {
  const manifest = {
    name: "@example/visual",
    dependencies: [],
    types: ["Picture"],
    capabilities: [],
    producers: [],
  };
  assert.deepEqual(modulesFromFacets([createModuleFacet(manifest)]), [{
    name: "@example/visual",
    dependencies: [],
    types: ["Picture"],
  }]);
});
