import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMarkupNodeCompiler } from "@narratage/compiler-markup-node";
import type { NodePackageContribution } from "@narratage/package-loader-node";
import { digestOf } from "@narratage/protocol";
import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import { NodeFilesystemWorkspace } from "@narratage/workspace-fs-node";

const module = { name: "example.card", version: "1" } as const;
const resultType = { module, name: "CardResult" } as const;
const implementationDigest = digestOf("example.card/card-surface@1");
const cardSurface = {
  name: "card",
  tag: "Card",
  mode: "structured",
  outputs: [resultType],
  implementation: { digest: implementationDigest },
} as const;

const installedPackage: NodePackageContribution = {
  format: "svml.node-package@1",
  modules: [{
    manifest: {
      format: "svml.module@1",
      name: module.name,
      version: module.version,
      dependencies: [],
      types: [{ name: resultType.name, schema: { kind: "string", minLength: 1 } }],
      capabilities: [],
      producers: [],
    },
    specifiers: ["example.card@1"],
  }],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module,
      declaration: cardSurface,
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

test("Markup compiler alone selects Markup Surface Host facets from a generic package contribution", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-markup-compiler-"));
  try {
    const source = join(root, "main.svml");
    await writeFile(source, `<?svml using="@narratage/markup@1"?>
    <svml>
      <import as="example" from="example.card@1"/>
      <example:Card/>
    </svml>`, "utf8");
    const compiler = createMarkupNodeCompiler([installedPackage], {
      workspace: new NodeFilesystemWorkspace({ root }),
    });
    const result = await compiler.compileFile(source);

    assert.deepEqual(result.program.closure.modules.map((item) => ({
      name: item.manifest.name,
      version: item.manifest.version,
    })), [module]);
    assert.equal(result.program.records[0]?.value.kind, "inline");
    assert.equal(result.graph.operations.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
