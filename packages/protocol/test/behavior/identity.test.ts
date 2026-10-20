import assert from "node:assert/strict";
import test from "node:test";

import {
  capabilityKey,
  createCapabilityRef,
  createModuleRef,
  createProducerRef,
  createTypeRef,
  moduleKey,
  parseCapabilityKey,
  parseModuleKey,
  parseProducerKey,
  parseTypeKey,
  producerKey,
  typeKey,
} from "@hypit/protocol";

test("Protocol owns the round trip for every logical reference key", () => {
  const module = createModuleRef("@example/visual", "2.1.0");
  const type = createTypeRef(module, "Frame");
  const producer = createProducerRef(module, "Render");
  const capability = createCapabilityRef(module, "image-generation");

  assert.deepEqual(parseModuleKey(moduleKey(module)), module);
  assert.deepEqual(parseTypeKey(typeKey(type)), type);
  assert.deepEqual(parseProducerKey(producerKey(producer)), producer);
  assert.deepEqual(parseCapabilityKey(capabilityKey(capability)), capability);
});

test("logical reference parsers reject keys without their complete identity", () => {
  assert.throws(() => parseModuleKey("@example/visual"), /module@version/u);
  assert.throws(() => parseTypeKey("@example/visual@2.1.0"), /module@version#name/u);
  assert.throws(() => parseProducerKey("@example/visual@2.1.0#"), /module@version#name/u);
  assert.throws(() => parseCapabilityKey("image-generation"), /capability key/u);
});
