import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  serializeMediaAssetDocument,
  type MediaAssetDocument,
  type MediaRepresentationDeclaration,
} from "@hypit/media-asset";

import { startNodeProjectMediaHttpServer } from "../../src/node/index.js";
import type { ProjectMediaCatalogView } from "../../src/index.js";

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

async function project(): Promise<{ readonly root: string; readonly media: string }> {
  const root = await mkdtemp(join(tmpdir(), "hypit-project-media-http-"));
  const media = join(root, "media", "first");
  await mkdir(media, { recursive: true });
  await writeFile(join(media, "first.png"), "first");
  await writeFile(join(media, "first.media.json"), serializeMediaAssetDocument(image("first")));
  return { root, media };
}

test("the Project Media HTTP server projects Catalog, resources and revisioned commands", async () => {
  const opened = await project();
  await writeFile(join(opened.media, "speech.json"), "{}");
  const host = await startNodeProjectMediaHttpServer({ projectRoot: opened.root });
  try {
    const catalog = await (await fetch(host.mediaUrl)).json() as ProjectMediaCatalogView;
    const asset = catalog.assets[0]!;
    assert.equal(asset.ref.path, "media/first/first.media.json");
    assert.notEqual(asset.revision, undefined);
    assert.notEqual(asset.resourceRevision, undefined);

    const resource = new URL(`${host.mediaUrl}/resource`);
    resource.searchParams.set("asset", asset.ref.path);
    resource.searchParams.set("revision", asset.resourceRevision!);
    assert.equal(await (await fetch(resource)).text(), "first");
    await writeFile(join(opened.media, "first.png"), "first expanded");
    assert.equal((await fetch(resource)).status, 409);
    const resourceChanged = await (await fetch(host.mediaUrl)).json() as ProjectMediaCatalogView;
    assert.notEqual(resourceChanged.assets[0]!.resourceRevision, asset.resourceRevision);

    const representation: MediaRepresentationDeclaration = {
      id: "speech.zh",
      type: { module: { name: "@example/timed-transcript" }, name: "TimedTranscript" },
      document: { path: "speech.json", mediaType: "application/json" },
      resources: {},
      binding: { picture: { member: "picture", space: "media-display-normalized" } },
    };
    const command = {
      kind: "representation.attach",
      asset: asset.ref,
      assetRevision: asset.revision!,
      representation,
    } as const;
    const committed = await fetch(`${host.mediaUrl}/representation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    assert.equal(committed.status, 200);
    const receipt = await committed.json() as { readonly assetRevision: string };
    assert.notEqual(receipt.assetRevision, asset.revision);

    const stale = await fetch(`${host.mediaUrl}/representation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json() as { readonly error: { readonly name: string } }).error.name,
      "ProjectMediaRevisionConflict");
  } finally {
    await host.close();
    await rm(opened.root, { recursive: true, force: true });
  }
});

test("the Project Media HTTP event stream publishes complete changed Catalog generations", async () => {
  const opened = await project();
  const host = await startNodeProjectMediaHttpServer({ projectRoot: opened.root });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Project Media event test timed out.")), 2_000);
  try {
    const response = await fetch(host.eventsUrl, { signal: controller.signal });
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";
    const catalogEvents = (): string[] => received.split("\n\n")
      .filter((event) => event.startsWith("event: catalog\n"));
    while (catalogEvents().length < 1) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      received += decoder.decode(chunk.value, { stream: true });
    }
    const first = catalogEvents()[0]!;
    assert.match(first, /id: 1/u);

    await writeFile(join(opened.media, "first.png"), "first expanded");
    const refreshed = await fetch(`${host.mediaUrl}/refresh`, { method: "POST" });
    assert.equal(refreshed.status, 200);
    while (catalogEvents().length < 2) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      received += decoder.decode(chunk.value, { stream: true });
    }
    assert.match(catalogEvents()[1]!, /id: 2/u);
    controller.abort();
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await host.close();
    await rm(opened.root, { recursive: true, force: true });
  }
});
