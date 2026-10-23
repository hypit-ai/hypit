import assert from "node:assert/strict";
import test from "node:test";

import {
  capabilityKey,
  capabilityIdentity,
  createCapabilityRef,
  createModuleRef,
  createProducerRef,
  createTypeRef,
  moduleKey,
  moduleIdentity,
  parseCapabilityKey,
  parseModuleKey,
  parseProducerKey,
  parseTypeKey,
  producerKey,
  producerIdentity,
  typeKey,
  typeIdentity,
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

test("logical reference identities preserve tuple boundaries", () => {
  assert.notEqual(
    moduleIdentity({ name: "example@one", version: "two" }),
    moduleIdentity({ name: "example", version: "one@two" } as never),
  );
  const left = { module: { name: "example#one", version: "1" }, name: "two" };
  const right = { module: { name: "example", version: "1" }, name: "one#two" };
  assert.notEqual(typeIdentity(left), typeIdentity(right as never));
  assert.notEqual(producerIdentity(left), producerIdentity(right as never));
  assert.notEqual(capabilityIdentity(left), capabilityIdentity(right as never));
});

test("logical reference parsers reject keys without their complete identity", () => {
  assert.throws(() => parseModuleKey("@example/visual"), /module@version/u);
  assert.throws(() => parseTypeKey("@example/visual@2.1.0"), /module@version#name/u);
  assert.throws(() => parseProducerKey("@example/visual@2.1.0#"), /module@version#name/u);
  assert.throws(() => parseCapabilityKey("image-generation"), /capability key/u);
  assert.throws(() => createModuleRef("example", "one@two"), /must not contain @/u);
  assert.throws(() => createTypeRef(createModuleRef("example", "1"), "one#two"), /must not contain #/u);
});
