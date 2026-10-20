import assert from "node:assert/strict";
import test from "node:test";
import { materializeWireRequest, mappingSupportsRequest, planWireRequest } from "../src/mapping.js";
import type { GenerationWireMapping } from "../src/mapping.js";
import type { GenerationRequest as ModelFieldRequest } from "../src/request.js";

const mapping: GenerationWireMapping = {
  capability: { module: { name: "example", version: "1" }, name: "video" },
  routes: [{ model: "video" }], fields: { image: { as: "url", field: "image" } },
};
const request = (fields?: Record<string, boolean>): ModelFieldRequest => ({
  ports: { image: [{ role: "image", artifact: {
    kind: "blob", resource: "res_image", mediaType: "image/png", size: 1,
  }, ...(fields === undefined ? {} : { fields }) }] },
});

test("a supplied optional item field must be mapped before any resource is uploaded", async () => {
  assert.equal(mappingSupportsRequest(mapping, request()), true);
  for (const flag of [true, false]) {
    assert.equal(mappingSupportsRequest(mapping, request({ personReference: flag })), false);
    let uploads = 0;
    assert.throws(() => planWireRequest(mapping, request({ personReference: flag })), /image.personReference/u);
    assert.equal(uploads, 0);
  }
});

test("item fields reach their declared transport or body destination, including false", async () => {
  for (const flag of [true, false]) {
    const transport: GenerationWireMapping = { ...mapping, fields: {
      image: { as: "url", field: "image", resourceFields: ["personReference"] },
    } };
    assert.equal(mappingSupportsRequest(transport, request({ personReference: flag })), true);
    const wire = await materializeWireRequest(planWireRequest(transport, request({ personReference: flag })), async (_blob, fields) => {
      assert.deepEqual(fields, { personReference: flag }); return "https://example.test/image";
    });
    assert.deepEqual(wire.input, { image: "https://example.test/image" });
    const body: GenerationWireMapping = { ...mapping, fields: {
      image: { as: "itemObject", field: "images", urlKey: "url", fieldKeys: { personReference: "person" } },
    } };
    assert.equal(mappingSupportsRequest(body, request({ personReference: flag })), true);
    assert.deepEqual((await materializeWireRequest(planWireRequest(body, request({ personReference: flag })), async () => "url")).input,
      { images: [{ url: "url", person: flag }] });
  }
});
