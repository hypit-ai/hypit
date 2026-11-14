import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGenerationGraphProject, serializeGenerationGraphProject } from "@hypit/generation-graph";
import { createGenerationGraphProjectObjectOwnerFacet } from "@hypit/generation-graph/node";
import { createProductionContextHostFromFacets } from "@hypit/production-context";

import { createGenerationWorkspace, serializeGenerationWorkspace } from "../src/index.js";
import { createGenerationWorkspaceProjectObjectOwnerFacet } from "../src/node/index.js";

test("a Generation Workspace reaches its Graph through Project Object owners", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-context-"));
  try {
    const generation = join(directory, "generation");
    await mkdir(generation);
    await writeFile(join(generation, "campaign.graph.json"), serializeGenerationGraphProject(
      createGenerationGraphProject({ id: "campaign", name: "Campaign Graph" }),
    ));
    await writeFile(join(generation, "campaign.workspace.json"), serializeGenerationWorkspace(
      createGenerationWorkspace({
        id: "campaign-canvas",
        name: "Campaign Canvas",
        graph: { path: "campaign.graph.json" },
      }),
    ));

    const context = await createProductionContextHostFromFacets([
      createGenerationWorkspaceProjectObjectOwnerFacet(),
      createGenerationGraphProjectObjectOwnerFacet(),
    ]).project(directory);

    assert.deepEqual(context.objects.map((object) => object.label), ["Campaign Graph", "Campaign Canvas"]);
    assert.deepEqual(context.objects.find((object) => object.label === "Campaign Canvas")?.references, [{
      path: "generation/campaign.graph.json",
      format: "hypit.generation-graph@1",
    }]);
    assert.deepEqual(context.unresolved, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
