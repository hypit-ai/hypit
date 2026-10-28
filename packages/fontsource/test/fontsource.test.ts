import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, compileAuthorDeclarations } from "@hypit/author";
import type { AuthorDeclaration } from "@hypit/author";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { mediaTypes } from "@hypit/media";
import { fontsourceFaceAuthorDeclaration } from "../src/index.js";

const range = { start: 0, end: 120 };
const encoder = new TextEncoder();

function declaration(packageValue = "@fontsource-variable/inter"): AuthorDeclaration {
  return {
    module: fontsourceFaceAuthorDeclaration.module,
    name: fontsourceFaceAuthorDeclaration.declaration,
    fields: [
      { name: "id", value: { kind: "literal", value: "inter" } },
      { name: "package", value: { kind: "literal", value: packageValue } },
      { name: "weight", value: { kind: "literal", value: "700" } },
      { name: "style", value: { kind: "literal", value: "normal" } },
    ],
    children: [],
    range,
  };
}

async function compile(value: AuthorDeclaration, requests: string[], reads: string[]) {
  const registry = new AuthorDeclarationRegistry();
  registry.register(fontsourceFaceAuthorDeclaration);
  return await compileAuthorDeclarations({
    sourceName: "fontsource.test.svml",
    declarations: [value],
    registry,
    readAsset(request) {
      reads.push(request.from);
      if (request.from.endsWith("/metadata.json")) {
        return encoder.encode(JSON.stringify({
          id: "inter", family: "Inter", weights: [400, 700], styles: ["normal", "italic"],
          variable: { wght: { min: "100", max: "900", step: "1" } },
        }));
      }
      if (request.from.endsWith("/wght.css")) {
        return encoder.encode(`@font-face { src: url(./files/inter-latin.woff2); unicode-range: U+0000-00FF; }
@font-face { src: url(./files/inter-cjk.woff2); unicode-range: U+3000-9FFF; }`);
      }
      throw new Error(`Unexpected readable asset ${request.from}`);
    },
    resolveAsset(request) {
      requests.push(request.from);
      return {
        kind: "blob",
        resource: fixtureResource(`fontsource:${request.from}`),
        size: 2_048,
        mediaType: request.mediaType,
      };
    },
  });
}

test("Fontsource Face reads package metadata through its Host and preserves every Unicode shard", async () => {
  const requests: string[] = [];
  const reads: string[] = [];
  const result = await compile(declaration(), requests, reads);
  assert.deepEqual(result.records[0]!.type, mediaTypes.fontArtifact);
  assert.deepEqual(reads, [
    "package:@fontsource-variable/inter/metadata.json",
    "package:@fontsource-variable/inter/wght.css",
  ]);
  assert.deepEqual(requests, [
    "package:@fontsource-variable/inter/files/inter-latin.woff2",
    "package:@fontsource-variable/inter/files/inter-cjk.woff2",
  ]);
  const value = result.records[0]!.value as unknown as { sources: unknown[]; weight: number };
  assert.equal(value.sources.length, 2);
  assert.equal(value.weight, 700);
});

test("Fontsource Face rejects a package prefix before requesting Host resources", async () => {
  const requests: string[] = [];
  const reads: string[] = [];
  await assert.rejects(async () => await compile(declaration("some-font"), requests, reads), /must name one @fontsource/u);
  assert.deepEqual(reads, []);
  assert.deepEqual(requests, []);
});
