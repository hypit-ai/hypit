import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  createGenerationWorkspace,
  parseGenerationWorkspace,
  serializeGenerationWorkspace,
} from "@hypit/generation-canvas";
import {
  applyGenerationGraphTransaction,
  createGenerationGraphLoweringHost,
  createGenerationGraphProject,
  serializeGenerationGraphProject,
  type PreparedGenerationGraphBuild,
} from "@hypit/generation-graph";
import type { ProductHistory } from "@hypit/product";
import { readGenerationGraphProjectFile } from "@hypit/generation-graph/node";
import { mediaAssetGenerationNodes, mediaAssetResourceGenerationNodes } from "@hypit/media-asset-generation";
import type { NodeMediaAssetImportResult } from "@hypit/media-asset/node";
import type { LocalMediaAssetImportRequest } from "@hypit/media-local";

import { startGenerationCanvasWorkbenchServer } from "../../src/node/canvas-server.js";

test("the canvas server edits one Generation Workspace without changing its Graph", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-workspace-server-"));
  const graphFile = join(directory, "story.graph.json");
  const workspaceFile = join(directory, "story.workspace.json");
  const graph = createGenerationGraphProject({ id: "story", name: "Story" });
  await writeFile(graphFile, serializeGenerationGraphProject(graph), "utf8");
  const empty = createGenerationWorkspace({ id: "story-main", name: "Story board", graph: { path: "story.graph.json" } });
  await writeFile(workspaceFile, serializeGenerationWorkspace({
    ...empty,
    nodes: [{ node: "missing", name: "Missing node", x: 120, y: 80 }],
  }), "utf8");

  let connected = false;
  const environment = {
    async observe() {
      return connected ? {
        status: "ready" as const,
        environment: { selected: true, label: "hypit.environment.json" },
        credentials: [{ endpoint: "hypihub.default", slot: "apiKey", label: "HypiHub credential",
          configured: true, writable: true, acquisition: "oauth2-pkce" as const }],
      } : {
        status: "action-required" as const,
        environment: { selected: false, candidate: "hypit.environment.json" },
        credentials: [],
        issue: "Connect generation service.",
      };
    },
    async connect() { connected = true; return await this.observe(); },
  };
  const server = await startGenerationCanvasWorkbenchServer({ projectRoot: directory, workspaceFile, environment });
  try {
    const address = server.origin;
    const opened = await (await fetch(`${address}/api/canvas`)).json() as {
      workspace: { name: string; revision: number };
      scene: { items: readonly { available: boolean }[] };
      environment: { status: string };
    };
    assert.equal(opened.scene.items[0]?.available, false);
    assert.equal(opened.environment.status, "action-required");

    const environmentResponse = await fetch(`${address}/api/canvas/environment/connect`, { method: "POST" });
    assert.equal(environmentResponse.status, 200);
    const connectedSnapshot = await environmentResponse.json() as { environment: { status: string } };
    assert.equal(connectedSnapshot.environment.status, "ready");

    const response = await fetch(`${address}/api/canvas/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction: {
        revision: opened.workspace.revision,
        commands: [{ kind: "node.move", node: "missing", x: 320, y: 160 }],
      } }),
    });
    assert.equal(response.status, 200);
    const moved = await response.json() as {
      workspace: { revision: number; nodes: readonly unknown[] };
    };
    assert.equal(moved.workspace.revision, 1);
    assert.deepEqual(moved.workspace.nodes[0], { node: "missing", name: "Missing node", x: 320, y: 160 });
    assert.deepEqual(parseGenerationWorkspace(await readFile(workspaceFile, "utf8")).nodes[0], {
      node: "missing", name: "Missing node", x: 320, y: 160,
    });
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the canvas server commits only package-valid Graph edits while allowing incomplete nodes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-graph-server-"));
  const graphFile = join(directory, "story.graph.json");
  const workspaceFile = join(directory, "story.workspace.json");
  const module = { name: "@example/image" } as const;
  const using = { module, name: "generate" } as const;
  const output = { module, name: "Image" } as const;
  const graph = applyGenerationGraphTransaction(
    createGenerationGraphProject({ id: "story", name: "Story" }),
    { revision: 0, commands: [{ kind: "node.add", node: { id: "hero", using, inputs: {} } }] },
  );
  await writeFile(graphFile, serializeGenerationGraphProject(graph), "utf8");
  const workspace = createGenerationWorkspace({ id: "story-main", name: "Story", graph: { path: "story.graph.json" } });
  await writeFile(workspaceFile, serializeGenerationWorkspace({
    ...workspace,
    nodes: [{ node: "hero", name: "Hero", x: 0, y: 0 }],
  }), "utf8");
  const graphHost = createGenerationGraphLoweringHost([{
    specifier: "@example/image",
    implementation: { nodes: [{
      kind: "operation",
      using,
      output,
      resolve({ node }) {
        const names = Object.keys(node.inputs);
        if (names.some((name) => name !== "prompt")) throw new Error("unknown image input");
        return node.inputs.prompt === undefined
          ? { kind: "incomplete", consumedInputs: names, missing: ["prompt"] }
          : { kind: "incomplete", consumedInputs: names, missing: ["compiled fixture"] };
      },
    }] },
  }]);
  const server = await startGenerationCanvasWorkbenchServer({ projectRoot: directory, workspaceFile, graphHost });
  try {
    const opened = await (await fetch(`${server.origin}/api/canvas`)).json() as {
      graph: { revision: number };
      workspace: { revision: number };
      nodes: readonly { readiness: string; missing?: readonly string[] }[];
    };
    assert.equal(opened.nodes[0]?.readiness, "incomplete");
    assert.deepEqual(opened.nodes[0]?.missing, ["prompt"]);

    const accepted = await fetch(`${server.origin}/api/canvas/graph-transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction: {
        revision: opened.graph.revision,
        commands: [{ kind: "node.replace", node: { id: "hero", using, inputs: { prompt: { value: "Sky" } } } }],
      } }),
    });
    assert.equal(accepted.status, 200);
    const changed = await accepted.json() as { graph: { revision: number } };

    const rejected = await fetch(`${server.origin}/api/canvas/graph-transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction: {
        revision: changed.graph.revision,
        commands: [{ kind: "node.replace", node: { id: "hero", using, inputs: { surprise: { value: true } } } }],
      } }),
    });
    assert.equal(rejected.status, 400);
    const saved = await readGenerationGraphProjectFile(graphFile);
    assert.deepEqual(saved.nodes[0]?.inputs, { prompt: { value: "Sky" } });

    const created = await fetch(`${server.origin}/api/canvas/edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graph: {
          revision: changed.graph.revision,
          commands: [{ kind: "node.add", node: { id: "variation", using, inputs: {} } }],
        },
        workspace: {
          revision: opened.workspace.revision,
          commands: [{ kind: "node.add", node: { node: "variation", name: "Variation", x: 320, y: 80 } }],
        },
      }),
    });
    assert.equal(created.status, 200);
    const createdSnapshot = await created.json() as {
      graph: { revision: number; nodes: readonly { id: string }[] };
      workspace: { revision: number; nodes: readonly { node: string }[] };
    };
    assert.ok(createdSnapshot.graph.nodes.some((node) => node.id === "variation"));
    assert.ok(createdSnapshot.workspace.nodes.some((node) => node.node === "variation"));

    const removed = await fetch(`${server.origin}/api/canvas/edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graph: {
          revision: createdSnapshot.graph.revision,
          commands: [
            { kind: "node.replace", node: { id: "variation", using, inputs: {} } },
            { kind: "node.remove", id: "variation" },
          ],
        },
        workspace: {
          revision: createdSnapshot.workspace.revision,
          commands: [{ kind: "node.remove", node: "variation" }],
        },
      }),
    });
    assert.equal(removed.status, 200, removed.ok ? undefined : await removed.clone().text());
    const removedSnapshot = await removed.json() as {
      graph: { nodes: readonly { id: string }[] };
      workspace: { nodes: readonly { node: string }[] };
    };
    assert.ok(!removedSnapshot.graph.nodes.some((node) => node.id === "variation"));
    assert.ok(!removedSnapshot.workspace.nodes.some((node) => node.node === "variation"));
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the canvas server imports uploaded media as uniquely named asset nodes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-import-"));
  const graphFile = join(directory, "story.graph.json");
  const workspaceFile = join(directory, "story.workspace.json");
  await writeFile(graphFile, serializeGenerationGraphProject(
    createGenerationGraphProject({ id: "story", name: "Story" })), "utf8");
  await writeFile(workspaceFile, serializeGenerationWorkspace(createGenerationWorkspace({
    id: "story-main", name: "Story", graph: { path: "story.graph.json" },
  })), "utf8");
  const graphHost = createGenerationGraphLoweringHost([{
    specifier: "@hypit/media-asset-generation",
    implementation: { nodes: Object.values(mediaAssetResourceGenerationNodes) },
  }]);
  const uploaded: string[] = [];
  const importMediaAsset = async (request: LocalMediaAssetImportRequest) => {
    uploaded.push(await readFile(request.sourcePath, "utf8"));
    await mkdir(dirname(request.assetPath), { recursive: true });
    await writeFile(request.assetPath, "fixture asset", "utf8");
    return {
      assetPath: request.assetPath,
      mediaPath: join(dirname(request.assetPath), request.mediaFile ?? "media.png"),
      document: { media: { file: { mediaType: "image/png" } } },
    } as unknown as NodeMediaAssetImportResult;
  };
  const server = await startGenerationCanvasWorkbenchServer({
    projectRoot: directory, workspaceFile, graphHost, importMediaAsset,
  });
  try {
    for (const content of ["first image", "second image"]) {
      const response = await fetch(`${server.origin}/api/canvas/import?name=kitten.png&x=140&y=220`, {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: content,
      });
      assert.equal(response.status, 200, await response.text());
    }
    assert.deepEqual(uploaded, ["first image", "second image"]);
    const graph = await readGenerationGraphProjectFile(graphFile);
    assert.deepEqual(graph.nodes.map((node) => node.id), ["kitten", "kitten-2"]);
    assert.deepEqual(graph.nodes.map((node) => node.using), [
      mediaAssetGenerationNodes.image,
      mediaAssetGenerationNodes.image,
    ]);
    assert.deepEqual(graph.nodes.map((node) => node.inputs.asset), [
      { value: { path: "media/kitten/kitten.media.json" } },
      { value: { path: "media/kitten-2/kitten-2.media.json" } },
    ]);
    const workspace = parseGenerationWorkspace(await readFile(workspaceFile, "utf8"));
    assert.deepEqual(workspace.nodes.map((node) => ({ node: node.node, name: node.name, x: node.x, y: node.y })), [
      { node: "kitten", name: "kitten", x: 140, y: 220 },
      { node: "kitten-2", name: "kitten", x: 140, y: 220 },
    ]);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the canvas projects project Media Assets and places one existing asset into the Graph", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-media-library-"));
  const canvasDirectory = join(directory, "canvases");
  const mediaDirectory = join(directory, "media", "poster");
  const graphFile = join(canvasDirectory, "story.graph.json");
  const workspaceFile = join(canvasDirectory, "story.workspace.json");
  await mkdir(canvasDirectory, { recursive: true });
  await mkdir(mediaDirectory, { recursive: true });
  await writeFile(graphFile, serializeGenerationGraphProject(
    createGenerationGraphProject({ id: "story", name: "Story" })), "utf8");
  await writeFile(workspaceFile, serializeGenerationWorkspace(createGenerationWorkspace({
    id: "story-main", name: "Story", graph: { path: "story.graph.json" },
  })), "utf8");
  await writeFile(join(mediaDirectory, "poster.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"></svg>', "utf8");
  await writeFile(join(mediaDirectory, "poster.media.json"), `${JSON.stringify({
    format: "hypit.media-asset@1",
    id: "poster",
    media: {
      file: { path: "poster.svg", mediaType: "image/svg+xml" },
      interpretation: {
        id: "poster-media",
        picture: {
          kind: "constant",
          streamIndex: 0,
          interpretation: {
            codedWidth: 64,
            codedHeight: 36,
            sampleAspectRatio: { numerator: 1, denominator: 1 },
            rotationDegrees: 0,
            picture: {
              colorPrimaries: "bt709",
              colorTransfer: "srgb",
              colorMatrix: "rgb",
              colorRange: "full",
              bitDepth: 8,
              alphaMode: "straight",
            },
          },
        },
      },
    },
    representations: [],
  }, undefined, 2)}\n`, "utf8");
  const graphHost = createGenerationGraphLoweringHost([{
    specifier: "@hypit/media-asset-generation",
    implementation: { nodes: Object.values(mediaAssetResourceGenerationNodes) },
  }]);
  const server = await startGenerationCanvasWorkbenchServer({
    projectRoot: directory, workspaceFile, graphHost,
  });
  try {
    const opened = await (await fetch(`${server.origin}/api/canvas`)).json() as {
      graph: { revision: number };
      workspace: { revision: number };
      mediaLibrary: { assets: readonly {
        id: string; name: string; asset: string; kind: string; resource: string;
      }[] };
    };
    assert.deepEqual(opened.mediaLibrary.assets, [{
      id: "media/poster/poster.media.json",
      name: "poster",
      asset: "../media/poster/poster.media.json",
      kind: "image",
      mediaType: "image/svg+xml",
      size: 69,
      width: 64,
      height: 36,
      hasAudio: false,
      resource: "/api/canvas/media-resource/media%2Fposter%2Fposter.media.json?generation=1",
    }]);
    const resource = await fetch(`${server.origin}${opened.mediaLibrary.assets[0]!.resource}`, {
      headers: { range: "bytes=0-4" },
    });
    assert.equal(resource.status, 206);
    assert.equal(await resource.text(), "<svg ");
    const response = await fetch(`${server.origin}/api/canvas/media-assets/place`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graphRevision: opened.graph.revision,
        workspaceRevision: opened.workspace.revision,
        media: opened.mediaLibrary.assets[0]!.id,
        placement: { x: 180, y: 240 },
      }),
    });
    assert.equal(response.status, 200, response.ok ? undefined : await response.clone().text());
    const placed = await response.json() as {
      placed: { node: string; asset: string; role: string; existing: boolean };
      snapshot: {
        graph: { revision: number; nodes: readonly { id: string; inputs: Record<string, unknown> }[] };
        workspace: { revision: number; nodes: readonly { node: string; x: number; y: number }[] };
      };
    };
    assert.deepEqual(placed.placed, {
      node: "poster",
      asset: "../media/poster/poster.media.json",
      role: "image",
      existing: false,
    });
    assert.deepEqual(placed.snapshot.graph.nodes[0], {
      id: "poster",
      using: mediaAssetGenerationNodes.image,
      inputs: { asset: { value: { path: "../media/poster/poster.media.json" } } },
    });
    assert.deepEqual(placed.snapshot.workspace.nodes[0], {
      node: "poster", name: "poster", x: 180, y: 240,
    });
    const repeated = await fetch(`${server.origin}/api/canvas/media-assets/place`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graphRevision: placed.snapshot.graph.revision,
        workspaceRevision: placed.snapshot.workspace.revision,
        media: opened.mediaLibrary.assets[0]!.id,
        placement: { x: 500, y: 500 },
      }),
    });
    assert.equal(repeated.status, 200, repeated.ok ? undefined : await repeated.clone().text());
    const reused = await repeated.json() as {
      placed: { node: string; existing: boolean };
      snapshot: { graph: { nodes: readonly unknown[] }; workspace: { nodes: readonly unknown[] } };
    };
    assert.deepEqual(reused.placed, { node: "poster", asset: "../media/poster/poster.media.json",
      role: "image", existing: true });
    assert.equal(reused.snapshot.graph.nodes.length, 1);
    assert.equal(reused.snapshot.workspace.nodes.length, 1);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the canvas server submits one target and attaches every accepted generated output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-build-"));
  const graphFile = join(directory, "story.graph.json");
  const workspaceFile = join(directory, "story.workspace.json");
  const module = { name: "@example/image" } as const;
  const using = { module, name: "generate" } as const;
  const graph = applyGenerationGraphTransaction(
    createGenerationGraphProject({ id: "story", name: "Story" }),
    { revision: 0, commands: [{ kind: "node.add", node: { id: "hero", using, inputs: {} } }] },
  );
  await writeFile(graphFile, serializeGenerationGraphProject(graph), "utf8");
  const workspace = createGenerationWorkspace({ id: "story-main", name: "Story", graph: { path: "story.graph.json" } });
  await writeFile(workspaceFile, serializeGenerationWorkspace({
    ...workspace,
    nodes: [{ node: "hero", name: "Hero", x: 0, y: 0 }],
  }), "utf8");
  const products: ProductHistory = {
    async readProduct() { return undefined; },
    async resolveProduct() { return undefined; },
  };
  const prepared = { generated: [{ node: "hero", record: "record-hero" }] } as unknown as PreparedGenerationGraphBuild;
  let preparedNode: string | undefined;
  const server = await startGenerationCanvasWorkbenchServer({
    projectRoot: directory,
    workspaceFile,
    results: {
      products,
      observations: {
        async inspectActive(build) { return { id: build, activity: "running" }; },
        async readResult() { return undefined; },
      },
    },
    execution: {
      async status() { return { available: true }; },
      async prepare(input) { preparedNode = input.node; return prepared; },
      async submit(input) { assert.equal(input.prepared, prepared); return { id: "Build-A" }; },
    },
  });
  try {
    const response = await fetch(`${server.origin}/api/canvas/builds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graphRevision: graph.revision, workspaceRevision: workspace.revision, node: "hero" }),
    });
    const value = await response.json() as {
      build: string;
      generated: readonly string[];
      unattached: readonly string[];
      snapshot: { scene: { items: readonly {
        selected?: { build: string; output: string };
        selectedObservation?: { state: string };
        outputs: readonly { state: string }[];
      }[] } };
    };
    assert.equal(response.status, 200, JSON.stringify(value));
    assert.equal(preparedNode, "hero");
    assert.equal(value.build, "Build-A");
    assert.deepEqual(value.generated, ["hero"]);
    assert.deepEqual(value.unattached, []);
    assert.equal(value.snapshot.scene.items[0]?.outputs[0]?.state, "running");
    assert.deepEqual(value.snapshot.scene.items[0]?.selected, { build: "Build-A", output: "hero" });
    assert.equal(value.snapshot.scene.items[0]?.selectedObservation?.state, "running");
    const saved = parseGenerationWorkspace(await readFile(workspaceFile, "utf8"));
    assert.deepEqual(saved.outputs, [{ node: "hero", build: "Build-A", output: "hero" }]);
    assert.deepEqual(saved.nodes[0]?.selected, { build: "Build-A", output: "hero" });

    const stale = await fetch(`${server.origin}/api/canvas/builds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graphRevision: graph.revision, workspaceRevision: workspace.revision, node: "hero" }),
    });
    assert.equal(stale.status, 409);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the canvas server streams attached media Products without exposing storage paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-media-"));
  const graphFile = join(directory, "story.graph.json");
  const workspaceFile = join(directory, "story.workspace.json");
  await writeFile(graphFile, serializeGenerationGraphProject(
    createGenerationGraphProject({ id: "story", name: "Story" })), "utf8");
  await writeFile(workspaceFile, serializeGenerationWorkspace(createGenerationWorkspace({
    id: "story-main", name: "Story", graph: { path: "story.graph.json" },
  })), "utf8");
  const blob = { kind: "blob" as const, resource: "res_image" as const, size: 4, mediaType: "image/png" };
  const products: ProductHistory = {
    async readProduct(address) {
      return { address, type: { module: { name: "@example/image" }, name: "Image" },
        publisher: "hypit.product@1", representation: "file", mediaType: "image/png", size: 4 };
    },
    async resolveProduct(address) {
      return { address, type: { module: { name: "@example/image" }, name: "Image" },
        publisher: "hypit.product@1", value: blob,
        async openResource(_blob, range) {
          const bytes = new Uint8Array([1, 2, 3, 4]);
          return (async function* () { yield bytes.slice(range?.start ?? 0, range?.endExclusive ?? bytes.length); })();
        } };
    },
  };
  const server = await startGenerationCanvasWorkbenchServer({
    projectRoot: directory,
    workspaceFile,
    results: { products, observations: { async readResult() { return undefined; } } },
  });
  try {
    const response = await fetch(`${server.origin}/api/canvas/result-media?publication=Build-A&name=hero`, {
      headers: { range: "bytes=1-2" },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([2, 3]));
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the canvas server materializes one attached Product as an independent Media Asset node", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-materialize-"));
  const graphFile = join(directory, "canvas", "story.graph.json");
  const workspaceFile = join(directory, "canvas", "story.workspace.json");
  const using = { module: { name: "@example/image" }, name: "generate" } as const;
  const graph = applyGenerationGraphTransaction(
    createGenerationGraphProject({ id: "story", name: "Story" }),
    { revision: 0, commands: [{ kind: "node.add", node: { id: "hero", using, inputs: {} } }] },
  );
  await mkdir(join(directory, "canvas"));
  await writeFile(graphFile, serializeGenerationGraphProject(graph), "utf8");
  const empty = createGenerationWorkspace({ id: "story-main", name: "Story", graph: { path: "story.graph.json" } });
  const workspace = {
    ...empty,
    nodes: [{ node: "hero", name: "Hero", x: 20, y: 40,
      selected: { build: "Build-A", output: "hero" } }],
    outputs: [{ node: "hero", build: "Build-A", output: "hero" }],
  };
  await writeFile(workspaceFile, serializeGenerationWorkspace(workspace), "utf8");
  const graphHost = createGenerationGraphLoweringHost([{
    specifier: "@hypit/media-asset-generation",
    implementation: { nodes: Object.values(mediaAssetResourceGenerationNodes) },
  }]);
  const product = {
    address: { publication: "Build-A", name: "hero" },
    type: { module: { name: "@example/image" }, name: "Image" },
    publisher: "hypit.product@1" as const,
    representation: "file" as const,
    mediaType: "image/png",
    size: 4,
  };
  const products: ProductHistory = {
    async readProduct(address) {
      return address.publication === "Build-A" && address.name === "hero" ? product : undefined;
    },
    async resolveProduct() { return undefined; },
  };
  const materialized: string[] = [];
  const server = await startGenerationCanvasWorkbenchServer({
    projectRoot: directory,
    workspaceFile,
    graphHost,
    results: { products, observations: { async readResult() { return undefined; } } },
    materialization: {
      async materialize(request, openedProducts) {
        assert.equal(openedProducts, products);
        assert.deepEqual(request.product, { publication: "Build-A", name: "hero" });
        await mkdir(dirname(request.assetPath), { recursive: true });
        await writeFile(request.assetPath, "fixture media asset", "utf8");
        const mediaPath = join(dirname(request.assetPath), "hero.png");
        await writeFile(mediaPath, "image", "utf8");
        materialized.push(request.assetPath);
        return { assetPath: request.assetPath, mediaPath };
      },
    },
  });
  try {
    const response = await fetch(`${server.origin}/api/canvas/materialize-product`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graphRevision: graph.revision,
        workspaceRevision: workspace.revision,
        sourceNode: "hero",
        product: { build: "Build-A", output: "hero" },
        placement: { x: 340, y: 40 },
      }),
    });
    const value = await response.json() as {
      snapshot: { graph: { revision: number }; workspace: { revision: number } };
      materialized: { node: string; asset: string; role: string; product: { build: string; output: string } };
    };
    assert.equal(response.status, 200, JSON.stringify(value));
    assert.deepEqual(value.materialized, {
      node: "hero-asset",
      asset: "../media/hero-asset/hero-asset.media.json",
      role: "image",
      product: { build: "Build-A", output: "hero" },
    });
    assert.equal(materialized.length, 1);
    assert.equal(materialized[0], join(directory, "media", "hero-asset", "hero-asset.media.json"));
    const repeatedResponse = await fetch(`${server.origin}/api/canvas/materialize-product`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graphRevision: value.snapshot.graph.revision,
        workspaceRevision: value.snapshot.workspace.revision,
        sourceNode: "hero",
        product: { build: "Build-A", output: "hero" },
        placement: { x: 640, y: 40 },
      }),
    });
    const repeated = await repeatedResponse.json() as {
      materialized: { node: string; asset: string; role: string; product: { build: string; output: string } };
    };
    assert.equal(repeatedResponse.status, 200, JSON.stringify(repeated));
    assert.deepEqual(repeated.materialized, {
      node: "hero-asset-2",
      asset: "../media/hero-asset-2/hero-asset-2.media.json",
      role: "image",
      product: { build: "Build-A", output: "hero" },
    });
    assert.equal(materialized.length, 2);
    assert.equal(materialized[1], join(directory, "media", "hero-asset-2", "hero-asset-2.media.json"));
    const savedGraph = await readGenerationGraphProjectFile(graphFile);
    assert.deepEqual(savedGraph.nodes[1], {
      id: "hero-asset",
      using: mediaAssetGenerationNodes.image,
      inputs: { asset: { value: { path: "../media/hero-asset/hero-asset.media.json" } } },
    });
    assert.deepEqual(savedGraph.nodes[2], {
      id: "hero-asset-2",
      using: mediaAssetGenerationNodes.image,
      inputs: { asset: { value: { path: "../media/hero-asset-2/hero-asset-2.media.json" } } },
    });
    const savedWorkspace = parseGenerationWorkspace(await readFile(workspaceFile, "utf8"));
    assert.deepEqual(savedWorkspace.nodes, [
      { node: "hero", name: "Hero", x: 20, y: 40, selected: { build: "Build-A", output: "hero" } },
      { node: "hero-asset", name: "Hero", x: 340, y: 40 },
      { node: "hero-asset-2", name: "Hero", x: 640, y: 40 },
    ]);
    assert.deepEqual(savedWorkspace.outputs, [{ node: "hero", build: "Build-A", output: "hero" }]);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
