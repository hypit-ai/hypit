import assert from "node:assert/strict";
import test from "node:test";

import { compileSvmlDeclaration } from "../../../test/compile-svml-declaration.js";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { mediaTypes } from "@hypit/media";
import { fontsourceAuthorDeclarations, fontsourceModuleRef } from "../src/index.js";

const encoder = new TextEncoder();

function declaration(packageValue = "@fontsource-variable/inter"): string {
  return `fontsource.face {
  id: inter
  package: "${packageValue}"
  weight: 700
  style: normal
}`;
}

async function compile(source: string, requests: string[], reads: string[]) {
  return await compileSvmlDeclaration({
    source,
    module: fontsourceModuleRef,
    alias: "fontsource",
    compilers: fontsourceAuthorDeclarations,
    readAsset(from) {
      reads.push(from);
      if (from.endsWith("/metadata.json")) {
        return encoder.encode(JSON.stringify({
          id: "inter", family: "Inter", weights: [400, 700], styles: ["normal", "italic"],
          variable: { wght: { min: "100", max: "900", step: "1" } },
        }));
      }
      if (from.endsWith("/wght.css")) {
        return encoder.encode(`@font-face { src: url(./files/inter-latin.woff2); unicode-range: U+0000-00FF; }
@font-face { src: url(./files/inter-cjk.woff2); unicode-range: U+3000-9FFF; }`);
      }
      throw new Error(`Unexpected readable asset ${from}`);
    },
    resolveAsset(from, mediaType) {
      requests.push(from);
      return {
        kind: "blob",
        resource: fixtureResource(`fontsource:${from}`),
        size: 2_048,
        mediaType: mediaType!,
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
