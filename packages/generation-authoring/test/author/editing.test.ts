import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorEditPlannerRegistry,
  planAuthorActionInvocation,
  type AuthorStructureDocument,
} from "@hypit/generation-authoring/author";

const module = { name: "@example/owner" } as const;

function document(): AuthorStructureDocument {
  return {
    source: { id: "/project/main.svml", name: "main.svml", bytes: new Uint8Array() },
    imports: "imports", declarations: "declarations", nodes: [],
    containers: [
      { container: "imports", kind: "imports", items: [] },
      { container: "declarations", kind: "declarations", items: [] },
    ],
    representation: null,
  };
}

test("projected actions execute only through their explicit declaration authority", () => {
  const registry = new AuthorEditPlannerRegistry();
  registry.register({
    module, declaration: "Thing", actions: [{
      name: "rename", summary: "Renames the authored thing.",
      input: { kind: "object", fields: { value: { schema: { kind: "string" } } } },
      plan({ subject }, input) {
        assert(subject !== undefined);
        assert.equal(typeof input, "object");
        return [{ kind: "replace", node: subject.node,
          value: { kind: "literal", value: (input as { value: string }).value, style: "quoted" } }];
      },
    }],
  });
  const source = document();
  assert.deepEqual(planAuthorActionInvocation(registry, source, {
    authority: { module, declaration: "Thing", action: "rename",
      subject: { source: source.source.id, node: "thing-label" } },
    input: { value: "Updated" },
  }), [{ kind: "replace", node: "thing-label",
    value: { kind: "literal", value: "Updated", style: "quoted" } }]);
  assert.throws(() => planAuthorActionInvocation(registry, source, {
    authority: { module, declaration: "Thing", action: "rename",
      subject: { source: "/another.svml", node: "thing-label" } },
    input: { value: "Wrong owner" },
  }), /belongs to/u);
});
