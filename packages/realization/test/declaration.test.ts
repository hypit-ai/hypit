import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
} from "@hypit/author";
import type { TypeRef } from "@hypit/protocol";

import {
  realizationSelectAuthorDeclaration,
} from "../src/declaration.js";

const mediaModule = { name: "example.media", version: "1" } as const;
const videoType = { module: mediaModule, name: "Video" } satisfies TypeRef;
const imageType = { module: mediaModule, name: "Image" } satisfies TypeRef;

function registry(): AuthorDeclarationRegistry {
  const result = new AuthorDeclarationRegistry();
  result.register(realizationSelectAuthorDeclaration);
  return result;
}

test("Realization Select emits one source-neutral durable relation", async () => {
  const decoded = await compileAuthorDeclarations({
    sourceName: "selection.svml",
    registry: registry(),
    declarations: [{
      module: realizationSelectAuthorDeclaration.module,
      name: realizationSelectAuthorDeclaration.declaration,
      fields: [
        { name: "output", value: { kind: "reference", path: "generation.video" } },
        { name: "record", value: { kind: "reference", path: "accepted-video" } },
      ],
      children: [],
      range: { start: 0, end: 80 },
    }],
    resolveReference(path) {
      if (path === "generation.video") {
        return {
          path,
          ref: { kind: "component-output", component: "generation", output: "video" },
          type: videoType,
        };
      }
      if (path === "accepted-video") {
        return {
          path,
          ref: { kind: "record", id: "accepted-video" },
          type: videoType,
          record: { id: "accepted-video", type: videoType, value: "video" },
        };
      }
      return undefined;
    },
    resolveAsset() {
      throw new Error("unused");
    },
  });

  assert.deepEqual(decoded.realizations, [{
    output: { kind: "component-output", component: "generation", output: "video" },
    record: { kind: "record", id: "accepted-video" },
  }]);
  assert.deepEqual(decoded.provenance?.[0]?.realizations, decoded.realizations);
  assert.deepEqual(decoded.records, []);
  assert.deepEqual(decoded.components, []);
});

test("Realization Select rejects a Record with a different Type", async () => {
  await assert.rejects(
    compileAuthorDeclarations({
      sourceName: "selection.svml",
      registry: registry(),
      declarations: [{
        module: realizationSelectAuthorDeclaration.module,
        name: realizationSelectAuthorDeclaration.declaration,
        fields: [
          { name: "output", value: { kind: "reference", path: "generation.video" } },
          { name: "record", value: { kind: "reference", path: "accepted-image" } },
        ],
        children: [],
        range: { start: 0, end: 80 },
      }],
      resolveReference(path) {
        return path === "generation.video"
          ? {
              path,
              ref: { kind: "component-output" as const, component: "generation", output: "video" },
              type: videoType,
            }
          : {
              path,
              ref: { kind: "record" as const, id: "accepted-image" },
              type: imageType,
              record: { id: "accepted-image", type: imageType, value: "image" },
            };
      },
      resolveAsset() {
        throw new Error("unused");
      },
    }),
    /cannot connect .*Image.* to .*Video/u,
  );
});
