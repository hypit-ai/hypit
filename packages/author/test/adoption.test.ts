import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorAdopterRegistry,
  createAuthorAdopterFacet,
  installAuthorAdopterFacets,
} from "@hypit/author";

const module = { name: "example.adoption", version: "1" } as const;
const accepted = { module, name: "Accepted" } as const;
const other = { module, name: "Other" } as const;
const ref = { module, name: "accepted" } as const;
const adopter = {
  ref,
  accepts: accepted,
  adopt({ offer }: { readonly offer: { readonly value: import("@hypit/protocol").Value } }) {
    return {
      imports: [{ kind: "module" as const, from: "example.adoption@1", alias: "example" }],
      declarations: [{
        module,
        name: "accepted",
        fields: [{ name: "id", value: { kind: "literal" as const, value: "kept" } }],
        children: [],
        text: String(offer.value),
      }],
      resources: [],
      result: "kept",
    };
  },
};

test("an explicitly selected adopter turns one exact typed offer into author drafts", async () => {
  const registry = new AuthorAdopterRegistry();
  installAuthorAdopterFacets([createAuthorAdopterFacet(adopter)], registry);
  assert.deepEqual(registry.forType(accepted).map((item) => item.ref), [ref]);
  assert.deepEqual(await registry.adopt(ref, { type: accepted, value: "value" }, {}), {
    imports: [{ kind: "module", from: "example.adoption@1", alias: "example" }],
    declarations: [{
      module,
      name: "accepted",
      fields: [{ name: "id", value: { kind: "literal", value: "kept" } }],
      children: [],
      text: "value",
    }],
    resources: [],
    result: "kept",
  });
  await assert.rejects(registry.adopt(ref, { type: other, value: "value" }, {}), /accepts.*not/u);
});

test("adopter lookup never infers a choice from a unique Type match", async () => {
  const registry = new AuthorAdopterRegistry();
  registry.register(adopter);
  assert.equal(registry.forType(accepted).length, 1);
  await assert.rejects(
    registry.adopt({ module, name: "not-selected" }, { type: accepted, value: "value" }, {}),
    /is not installed/u,
  );
});
