import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { openNodeGenerationWorkspace } from "../../packages/generation-canvas/src/node/index.js";
import { readGenerationGraphProjectFile } from "../../packages/generation-graph/src/node/index.js";
import {
  readMediaAssetDocumentFile,
  resolveMediaAssetDocumentFile,
  resolveMediaAssetMediaFile,
} from "../../packages/media-asset/src/node/index.js";
import { createNodeNleMediaResolver, readNleProjectFile } from "../../packages/nle/src/node/index.js";
import { resolveProjectRoot } from "../../packages/project/src/index.js";
import { parseLocalRuntimeProfile } from "../../packages/runtime-local/src/index.js";

const projectRoot = fileURLToPath(new URL("../../examples/production-project/", import.meta.url));

test("the recommended production project opens through each owning subsystem", async () => {
  assert.equal(await resolveProjectRoot({ cwd: `${projectRoot}/media/poster` }), projectRoot.slice(0, -1));

  const graph = await readGenerationGraphProjectFile(`${projectRoot}/generation.graph.json`);
  const workspace = await openNodeGenerationWorkspace({
    workspacePath: `${projectRoot}/generation.workspace.json`,
    observations: { readResult: async () => undefined },
  });
  const media = await readMediaAssetDocumentFile(`${projectRoot}/media/poster/poster.media.json`);
  const resolveBlob = async (path: string, mediaType: string) => ({
    kind: "blob" as const,
    resource: "res_production-project-poster" as const,
    size: (await stat(path)).size,
    mediaType,
  });
  const resolved = await resolveMediaAssetDocumentFile(
    `${projectRoot}/media/poster/poster.media.json`,
    resolveBlob,
  );
  const nle = (await readNleProjectFile(`${projectRoot}/film.nle.json`)).current;
  await createNodeNleMediaResolver(
    projectRoot,
    `${projectRoot}/film.nle.json`,
    nle,
    async (path) => await resolveMediaAssetMediaFile(path, resolveBlob),
  );
  const runtime = parseLocalRuntimeProfile(JSON.parse(
    await readFile(`${projectRoot}/hypit.runtime.json`, "utf8"),
  ) as unknown);

  assert(graph.nodes.length > 0);
  assert.equal(workspace.graph.id, graph.id);
  assert.equal(workspace.scene.items.length, workspace.workspace.nodes.length);
  assert.equal(workspace.observations.length, 0);
  assert.equal(media.id, "poster");
  assert.equal(resolved.id, media.id);
  assert.equal(nle.tracks[0]?.items[0]?.kind, "present");
  const firstItem = nle.tracks[0]?.items[0];
  assert.equal(firstItem?.kind === "present" ? firstItem.source : undefined, "media");
  assert.equal(runtime.dataRoot, ".hypit/runtimes/local");

  assert.equal(firstItem?.kind === "present" && firstItem.source === "media"
    ? firstItem.asset.path : undefined, "media/poster/poster.media.json");
});
