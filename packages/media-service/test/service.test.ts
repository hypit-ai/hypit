import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  serializeMediaAssetDocument,
  type MediaAssetDocument,
  type MediaRepresentationDeclaration,
} from "@hypit/media-asset";
import { readMediaAssetDocumentFile } from "@hypit/media-asset/node";
import { projectObjectRef } from "@hypit/project";

import {
  createNodeProjectMediaService,
  createNodeProjectMediaServicePool,
} from "../src/node/index.js";

function image(id: string): MediaAssetDocument {
  return {
    format: "hypit.media-asset@1",
    id,
    media: {
      file: { path: `${id}.png`, mediaType: "image/png" },
      interpretation: {
        id: `${id}:media`,
        picture: {
          kind: "constant",
          streamIndex: 0,
          interpretation: {
            codedWidth: 16,
            codedHeight: 9,
            sampleAspectRatio: { numerator: 1, denominator: 1 },
            rotationDegrees: 0,
            picture: {
              colorPrimaries: "bt709",
              colorTransfer: "srgb",
              colorMatrix: "rgb",
              colorRange: "full",
              bitDepth: 8,
              alphaMode: "opaque",
            },
          },
        },
      },
    },
    representations: [],
  };
}

test("one Project Media Service publishes atomic shared Catalog generations", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-project-media-"));
  const first = join(root, "media", "first");
  await mkdir(first, { recursive: true });
  await writeFile(join(first, "first.png"), "first");
  await writeFile(join(first, "first.media.json"), serializeMediaAssetDocument(image("first")));
  const service = createNodeProjectMediaService(root);
  try {
    const publications: number[] = [];
    const unsubscribe = service.subscribe((generation) => publications.push(generation));
    const [left, right] = await Promise.all([service.observe(), service.observe()]);
    assert.equal(left.generation, 1);
    assert.deepEqual(right, left);
    assert.deepEqual(left.assets.map((asset) => asset.ref.path), ["media/first/first.media.json"]);
    assert.equal(left.assets[0]?.width, 16);
    assert.deepEqual(publications, [1]);

    const unchanged = await service.refresh();
    assert.equal(unchanged.generation, 1);
    assert.deepEqual(publications, [1]);

    const ref = projectObjectRef("media/first/first.media.json", "hypit.media-asset@1");
    assert.equal(service.resource(ref)?.size, 5);
    assert.equal(service.materialization(ref)?.document.id, "first");

    const second = join(root, "media", "second");
    await mkdir(second, { recursive: true });
    await writeFile(join(second, "second.png"), "second");
    await writeFile(join(second, "second.media.json"), serializeMediaAssetDocument(image("second")));
    const refreshed = await service.refresh();
    assert.ok(refreshed.generation >= 2);
    assert.deepEqual(refreshed.assets.map((asset) => asset.ref.path), [
      "media/first/first.media.json",
      "media/second/second.media.json",
    ]);
    assert.equal(publications.at(-1), refreshed.generation);

    await writeFile(join(first, "first.png"), "first expanded");
    const resourceChanged = await service.refresh();
    assert.equal(resourceChanged.assets.find((asset) => asset.name === "first")?.size, 14);

    const third = join(root, "media", "third");
    await mkdir(third, { recursive: true });
    await writeFile(join(third, "third.png"), "third");
    await writeFile(join(third, "third.media.json"), serializeMediaAssetDocument(image("third")));
    const deadline = Date.now() + 2_000;
    while ((await service.observe()).assets.length < 3 && Date.now() < deadline) await delay(20);
    assert.equal((await service.observe()).assets.length, 3);
    unsubscribe();
  } finally {
    await service.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("a Project Host pool shares one service only while Bench sessions overlap", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-project-media-pool-"));
  const pool = createNodeProjectMediaServicePool();
  try {
    const first = pool.acquire(root);
    const second = pool.acquire(root);
    assert.equal(second.service, first.service);
    await first.release();
    assert.equal((await second.service.observe()).generation, 1);
    await second.release();

    const next = pool.acquire(root);
    assert.notEqual(next.service, first.service);
    await next.release();
  } finally {
    await pool.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("the Project Media single writer commits accepted Representation declarations directly", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-project-media-write-"));
  const directory = join(root, "media", "first");
  const manifest = join(directory, "first.media.json");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "first.png"), "first");
  await writeFile(join(directory, "speech.json"), "{}");
  await writeFile(join(directory, "speech-corrected.json"), "{}");
  await writeFile(manifest, serializeMediaAssetDocument(image("first")));
  const service = createNodeProjectMediaService(root);
  const asset = projectObjectRef("media/first/first.media.json", "hypit.media-asset@1");
  const speech: MediaRepresentationDeclaration = {
    id: "speech.zh",
    type: { module: { name: "@example/timed-transcript" }, name: "TimedTranscript" },
    document: { path: "speech.json", mediaType: "application/json" },
    resources: {},
    binding: { picture: { member: "picture", space: "media-display-normalized" } },
  };
  try {
    const initial = await service.observe();
    const revision = initial.assets[0]!.revision!;
    const attached = await service.commitRepresentation({
      kind: "representation.attach", asset, assetRevision: revision, representation: speech,
    });
    assert.equal(attached.catalogGeneration, 2);
    assert.deepEqual((await readMediaAssetDocumentFile(manifest)).representations, [speech]);

    const corrected = { ...speech, document: { ...speech.document, path: "speech-corrected.json" } };
    await service.commitRepresentation({
      kind: "representation.replace", asset, assetRevision: attached.assetRevision,
      id: speech.id, representation: corrected,
    });
    assert.equal((await readMediaAssetDocumentFile(manifest)).representations[0]?.document.path,
      "speech-corrected.json");

    const replaced = await service.observe();
    await service.commitRepresentation({
      kind: "representation.detach", asset,
      assetRevision: replaced.assets[0]!.revision!, id: speech.id,
    });
    assert.deepEqual((await readMediaAssetDocumentFile(manifest)).representations, []);

    await assert.rejects(service.commitRepresentation({
      kind: "representation.attach", asset, assetRevision: revision, representation: speech,
    }), /changed after it was observed/u);
  } finally {
    await service.close();
    await rm(root, { recursive: true, force: true });
  }
});
