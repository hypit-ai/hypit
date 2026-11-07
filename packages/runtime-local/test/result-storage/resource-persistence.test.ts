import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { buildResultDirectory, FileRunFinalization } from "../../src/result-storage/index.js";
import type { BlobRef } from "@hypit/protocol";
import { productPublicationDirectory } from "@hypit/hypit/product/node";

import {
  structuredType,
  publicationIntent,
  videoType,
} from "./repository-scenario.js";

test("one same-Run resource backs a published video and a structured Product", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-result-"));
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const video: BlobRef = {
    kind: "blob",
    resource: "res_same-build-video",
    size: bytes.byteLength,
    mediaType: "video/mp4",
  };
  try {
    const result = await FileRunFinalization.create(root, join(root, "products"), {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "/project/main.svml",
      targets: ["shot.video"],
      publication: publicationIntent([
        { name: "shot.video", record: "record:video" },
        { name: "shot.take", record: "record:take" },
        { name: "shot.take-copy", record: "record:take" },
        { name: "unused.video", record: "record:unused" },
      ]),
    });
    assert.equal(
      result.directory,
      join(root, "2026-09-02", "bld_20260902T100000000Z_0000000001"),
    );
    const storedManifest = JSON.parse(await readFile(join(result.directory, "result.json"), "utf8")) as object;
    assert.equal(Object.hasOwn(storedManifest, "id"), false);
    assert.equal((await result.read()).id, "bld_20260902T100000000Z_0000000001");
    const manifest = await result.sync({
      records: [
          { id: "record:video", type: videoType, value: video },
          {
            id: "record:take",
            type: structuredType,
            value: ({ media: { visual: { artifact: video } } }),
          },
        ],
      resources: {
        async open(artifact) {
          assert.equal(artifact.resource, video.resource);
          return (async function* () { yield bytes; })();
        },
      },
    });
    assert.deepEqual(Object.keys(manifest.outputs).sort(), ["shot.take", "shot.take-copy", "shot.video"]);
    const productDirectory = productPublicationDirectory(join(root, "products"), manifest.id);
    assert.equal(manifest.outputs["shot.video"]?.representation, "file");
    assert.equal(manifest.outputs["shot.take"]?.representation, "structured");
    const publication = JSON.parse(await readFile(join(productDirectory, "product.json"), "utf8")) as {
      readonly products: Readonly<Record<string, { readonly value:
        | { readonly kind: "product-file"; readonly path: string }
        | { readonly kind: "value"; readonly path: string } }>>;
    };
    const storedVideo = publication.products["shot.video"]?.value;
    const takeValue = publication.products["shot.take"]?.value;
    const takeCopy = publication.products["shot.take-copy"]?.value;
    const videoPath = storedVideo?.kind === "product-file" ? storedVideo.path : undefined;
    const takePath = takeValue?.kind === "value" ? takeValue.path : undefined;
    assert.ok(videoPath);
    assert.ok(takePath);
    assert.equal(takeCopy?.kind === "value" ? takeCopy.path : undefined, takePath);
    assert.equal(videoPath, "files/file-0001.mp4");
    const take = JSON.parse(await readFile(join(productDirectory, takePath), "utf8")) as {
      readonly format: string;
      readonly value: { readonly media: { readonly visual: { readonly artifact: null } } };
      readonly resources: readonly [{ readonly at: readonly string[]; readonly file: { readonly path: string } }];
    };
    assert.equal(take.format, "hypit.product-value@1");
    assert.equal(take.value.media.visual.artifact, null);
    assert.deepEqual(take.resources[0].at, ["media", "visual", "artifact"]);
    assert.equal(take.resources[0].file.path, videoPath);
    assert.deepEqual(await readdir(join(productDirectory, "files")), [videoPath.split("/").at(-1)]);

    const failed = await result.finish({ outcome: "failed", failure: "final render failed" });
    assert.equal(failed.outcome, "failed");
    assert.equal(failed.failure, "final render failed");
    assert.deepEqual(Object.keys(failed.outputs).sort(), ["shot.take", "shot.take-copy", "shot.video"]);
    await result.finish({ outcome: "failed", failure: "final render failed" });
    assert.equal((await readdir(productDirectory)).includes(".writer.json"), false);
    await assert.rejects(
      result.finish({ outcome: "complete" }),
      /already finished with a different outcome/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
