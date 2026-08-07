import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createTextNodeCompiler } from "@narratage/compiler-text-node";
import type { NodePackageContribution } from "@narratage/package-loader-node";
import { digestOf } from "@narratage/protocol";
import { createTextSurfaceHostFacet } from "@narratage/text";

const module = { name: "example.card", version: "1" } as const;
const resultType = { module, name: "CardResult" } as const;
const implementationDigest = digestOf("example.card/card-surface@1");

const installedPackage: NodePackageContribution = {
  format: "svml.node-package@1",
  name: "example-card",
  modules: [{
    manifest: {
      format: "svml.module@1",
      name: module.name,
      version: module.version,
      dependencies: [],
      types: [{ name: resultType.name, schema: { kind: "string", minLength: 1 } }],
      capabilities: [],
      surfaces: [{
        name: "card",
        tag: "Card",
        mode: "structured",
        outputs: [resultType],
        implementation: {
          kind: "trusted-frontend-surface",
          locator: "example.card/card",
          digest: implementationDigest,
        },
      }],
      producers: [],
    },
    specifiers: ["example.card@1"],
  }],
  hostFacets: [
    createTextSurfaceHostFacet({
      module,
      surface: "card",
      mode: "structured",
      implementationDigest,
      handler({ element }) {
        return {
          records: [{
            id: "card-result",
            type: resultType,
            value: { kind: "inline", value: "accepted" },
            range: element.range,
          }],
          components: [],
          fragments: [],
        };
      },
    }),
    {
      abi: "example.unselected-host@1",
      identity: { name: "must-remain-inert" },
      implementation() {
        throw new Error("an unselected Host facet executed");
      },
    },
  ],
};

test("Text compiler alone selects Text Surface Host facets from a generic package contribution", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-text-compiler-"));
  try {
    const source = join(root, "main.svml");
    await writeFile(source, `<?svml using="@narratage/text@1"?>
    <svml>
      <import as="example" from="example.card@1"/>
      <example:Card/>
    </svml>`, "utf8");
    const compiler = createTextNodeCompiler([installedPackage], { root });
    const result = await compiler.compileFile(source);

    assert.deepEqual(result.program.closure.modules.map((item) => item.ref), [module]);
    assert.equal(result.module.records[0]?.value.kind, "inline");
    assert.equal(result.elaboration.graph.operations.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
