import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure } from "@hypit/core";
import {
  AuthorFrontendRegistry,
  SourceClosureError,
  compileSourceClosure,
} from "@hypit/elaborator";
import type { AuthorSourceUnit } from "@hypit/elaborator";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";

const moduleRef = { name: "example.identity", version: "1" } as const;
const identityType = { module: moduleRef, name: "PublicIdentity" } satisfies TypeRef;
const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [{ name: identityType.name }],
  capabilities: [],
  producers: [],
};
const frontendId = "example.identity-frontend@1";

function source(id: string, name: string): AuthorSourceUnit {
  return { id, name, text: `<?svml using="${frontendId}"?>\nidentity` };
}

test("Source Closure rejects a repeated domain-declared public identity", async () => {
  const frontends = new AuthorFrontendRegistry();
  frontends.register({
    id: frontendId,
    discover(unit) {
      return {
        modules: [],
        sources: unit.name === "main"
          ? [{ from: "./child", alias: "child", range: { start: 0, end: 0 } }]
          : [],
      };
    },
    decode() {
      return {
        records: [],
        components: [],
        fragments: [],
        exports: [],
        identities: [{ namespace: identityType, id: "story" }],
      };
    },
  });
  await assert.rejects(
    compileSourceClosure({
      entry: source("/project/main", "main"),
      closure: createResolvedClosure([manifest]),
      frontends,
      resolveSource() {
        return source("/project/child", "child");
      },
    }),
    (error: unknown) => error instanceof SourceClosureError
      && error.code === "DUPLICATE_SOURCE_IDENTITY"
      && error.subject === "story",
  );
});

test("Source Closure hygienizes author provenance across imported Sources", async () => {
  const frontends = new AuthorFrontendRegistry();
  frontends.register({
    id: frontendId,
    discover(unit) {
      return {
        modules: [],
        sources: unit.name === "main"
          ? [{ from: "./child", alias: "child", range: { start: 0, end: 0 } }]
          : [],
      };
    },
    decode(unit) {
      return {
        records: [{ id: "value", type: identityType, value: { kind: "inline", value: unit.name } }],
        components: [],
        fragments: [],
        exports: [{ name: "value", ref: { kind: "record", id: "value" }, type: identityType }],
        provenance: [{
          range: { start: 1, end: 9 },
          records: ["value"],
          components: [],
          outputs: [],
          inputs: [{ name: "label", range: { start: 2, end: 7 }, kind: "literal" }],
        }],
      };
    },
  });
  const compiled = await compileSourceClosure({
    entry: source("/project/main", "main"),
    closure: createResolvedClosure([manifest]),
    frontends,
    resolveSource() { return source("/project/child", "child"); },
  });
  assert.equal(compiled.provenance.elements.length, 2);
  const bySource = new Map(compiled.provenance.elements.map((item) => [item.sourceName, item] as const));
  assert.equal(bySource.get("main")?.records[0]?.id, "/project/main::record::value");
  assert.equal(bySource.get("child")?.records[0]?.id, "/project/child::record::value");
  assert.notEqual(bySource.get("main")?.inputs[0]?.id, bySource.get("child")?.inputs[0]?.id);
});
