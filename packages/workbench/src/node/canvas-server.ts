import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, parse, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import {
  applyGenerationWorkspaceTransaction,
  GenerationWorkspaceRevisionConflict,
  observeGenerationWorkspaceOutputs,
  planAcceptedGenerationWorkspaceBuild,
  projectGenerationCanvas,
  type GenerationCanvasPresentationHost,
  type GenerationWorkspaceObservationHost,
  type GenerationWorkspace,
  type GenerationWorkspaceTransaction,
} from "@hypit/generation-canvas";
import {
  applyGenerationGraphTransaction,
  GenerationGraphRevisionConflict,
  inspectGenerationGraphProject,
  type GenerationGraphCommand,
  type GenerationGraphInspectionHost,
  type GenerationNodeAuthoringHost,
  type GenerationGraphProject,
  type GenerationGraphTransaction,
  type PreparedGenerationGraphBuild,
} from "@hypit/generation-graph";
import type { ProductHistory } from "@hypit/product";
import type { ProductAddress } from "@hypit/product";
import { isBlobRef } from "@hypit/protocol";
import {
  adoptOutputInGenerationWorkspace,
  readGenerationWorkspaceFile,
  writeGenerationWorkspaceFile,
} from "@hypit/generation-canvas/node";
import {
  readGenerationGraphProjectFile,
  writeGenerationGraphProjectFile,
} from "@hypit/generation-graph/node";
import { createMediaAssetGenerationGraphNode } from "@hypit/media-asset-generation";
import type { MediaAssetDocument } from "@hypit/media-asset";
import { importLocalMediaAsset, mediaAssetIdFromFile } from "@hypit/media-local";

import type {
  GenerationCanvasWorkbenchSnapshot,
  GenerationCanvasWorkbenchBuildRequest,
  GenerationCanvasWorkbenchBuildResponse,
  GenerationCanvasWorkbenchEnvironment,
  GenerationCanvasWorkbenchImportResponse,
  GenerationCanvasWorkbenchMaterializeRequest,
  GenerationCanvasWorkbenchMaterializeResponse,
  GenerationCanvasWorkbenchPlaceMediaRequest,
  GenerationCanvasWorkbenchPlaceMediaResponse,
  GenerationCanvasWorkbenchEditRequest,
  GenerationCanvasWorkbenchGraphTransactionRequest,
  GenerationCanvasWorkbenchTransactionRequest,
} from "../canvas-protocol.js";
import type { WorkbenchErrorView } from "../protocol.js";
import { ProjectMediaLibrary, type ProjectMediaLibraryResource } from "./media-library.js";
import { portableRelative, projectMember } from "./project-path.js";

const clientDirectory = fileURLToPath(new URL("../client/", import.meta.url));
const clientAssets = new Map([
  ["/assets/canvas.js", { path: "canvas.js", type: "text/javascript; charset=utf-8" }],
  ["/assets/canvas-snapping.js", { path: "canvas-snapping.js", type: "text/javascript; charset=utf-8" }],
  ["/assets/canvas-authoring.js", { path: "canvas-authoring.js", type: "text/javascript; charset=utf-8" }],
  ["/assets/canvas.css", { path: "canvas.css", type: "text/css; charset=utf-8" }],
  ["/assets/topbar.js", { path: "topbar.js", type: "text/javascript; charset=utf-8" }],
  ["/assets/topbar.css", { path: "topbar.css", type: "text/css; charset=utf-8" }],
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export type GenerationCanvasWorkbenchServer = {
  readonly kind: "generation-canvas";
  readonly origin: string;
  readonly canvasUrl: string;
  readonly workspaceFile: string;
  readonly graphFile: string;
  close(): Promise<void>;
};

/** Application-owned execution boundary; the browser and Canvas files never select a Runtime. */
export type GenerationCanvasWorkbenchExecutionHost = {
  status(): Promise<{ readonly available: boolean; readonly issue?: string }>;
  prepare(input: {
    readonly graph: GenerationGraphProject;
    readonly workspace: GenerationWorkspace;
    readonly node: string;
  }): Promise<PreparedGenerationGraphBuild>;
  submit(input: {
    readonly graphFile: string;
    readonly prepared: PreparedGenerationGraphBuild;
  }): Promise<{ readonly id: string }>;
};

/** Application-owned Runtime and credential actions shared by browser UI and agents. */
export type GenerationCanvasWorkbenchEnvironmentHost = {
  observe(): Promise<GenerationCanvasWorkbenchEnvironment>;
  connect(): Promise<GenerationCanvasWorkbenchEnvironment>;
};

export type GenerationCanvasWorkbenchResultsHost = {
  readonly products: ProductHistory;
  readonly observations: GenerationWorkspaceObservationHost;
};

/** Application-owned Product-to-asset boundary. Canvas only coordinates the authored adoption. */
export type GenerationCanvasWorkbenchMaterializationHost = {
  materialize(
    request: { readonly product: ProductAddress; readonly assetPath: string; readonly id: string },
    products: ProductHistory,
  ): Promise<{ readonly assetPath: string; readonly mediaPath: string }>;
};

function loopbackOrigin(host: string, port: number): string {
  return `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function errorView(error: unknown): WorkbenchErrorView {
  const source = error instanceof Error ? error : new Error(String(error));
  return {
    format: "hypit.workbench-error@1",
    error: { name: source.name, message: source.message },
  };
}

async function requestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 1_048_576) throw new Error("Workbench request body exceeds 1 MiB.");
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim().length === 0) throw new Error("Workbench request body is empty.");
  return JSON.parse(text) as unknown;
}

function transactionRequest(value: unknown): GenerationCanvasWorkbenchTransactionRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Generation Canvas transaction request must be an object.");
  }
  const candidate = value as Partial<GenerationCanvasWorkbenchTransactionRequest>;
  if (typeof candidate.transaction !== "object" || candidate.transaction === null) {
    throw new Error("Generation Canvas transaction is required.");
  }
  return candidate as GenerationCanvasWorkbenchTransactionRequest;
}

function graphTransactionRequest(value: unknown): GenerationCanvasWorkbenchGraphTransactionRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Generation Graph transaction request must be an object.");
  }
  const candidate = value as Partial<GenerationCanvasWorkbenchGraphTransactionRequest>;
  if (typeof candidate.transaction !== "object" || candidate.transaction === null) {
    throw new Error("Generation Graph transaction is required.");
  }
  return candidate as GenerationCanvasWorkbenchGraphTransactionRequest;
}

function editRequest(value: unknown): GenerationCanvasWorkbenchEditRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Generation Canvas edit request must be an object.");
  }
  const candidate = value as Partial<GenerationCanvasWorkbenchEditRequest>;
  if (typeof candidate.graph !== "object" || candidate.graph === null
    || typeof candidate.workspace !== "object" || candidate.workspace === null) {
    throw new Error("Generation Canvas edit requires Graph and Workspace transactions.");
  }
  return candidate as GenerationCanvasWorkbenchEditRequest;
}

function buildRequest(value: unknown): GenerationCanvasWorkbenchBuildRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Generation Canvas Build request must be an object.");
  }
  const candidate = value as Partial<GenerationCanvasWorkbenchBuildRequest>;
  assert(Number.isSafeInteger(candidate.graphRevision) && (candidate.graphRevision ?? -1) >= 0,
    "Generation Canvas Build graphRevision must be a non-negative integer.");
  assert(Number.isSafeInteger(candidate.workspaceRevision) && (candidate.workspaceRevision ?? -1) >= 0,
    "Generation Canvas Build workspaceRevision must be a non-negative integer.");
  assert(typeof candidate.node === "string" && candidate.node.trim().length > 0,
    "Generation Canvas Build node is required.");
  return candidate as GenerationCanvasWorkbenchBuildRequest;
}

function materializeRequest(value: unknown): GenerationCanvasWorkbenchMaterializeRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Generation Canvas Product materialization request must be an object.");
  }
  const candidate = value as Partial<GenerationCanvasWorkbenchMaterializeRequest>;
  assert(Number.isSafeInteger(candidate.graphRevision) && (candidate.graphRevision ?? -1) >= 0,
    "Generation Canvas Product materialization graphRevision must be a non-negative integer.");
  assert(Number.isSafeInteger(candidate.workspaceRevision) && (candidate.workspaceRevision ?? -1) >= 0,
    "Generation Canvas Product materialization workspaceRevision must be a non-negative integer.");
  assert(typeof candidate.sourceNode === "string" && candidate.sourceNode.trim().length > 0,
    "Generation Canvas Product materialization sourceNode is required.");
  assert(typeof candidate.product?.build === "string" && candidate.product.build.trim().length > 0
    && typeof candidate.product.output === "string" && candidate.product.output.trim().length > 0,
  "Generation Canvas Product materialization address is required.");
  assert(Number.isFinite(candidate.placement?.x) && Number.isFinite(candidate.placement?.y),
    "Generation Canvas Product materialization placement must contain finite coordinates.");
  return candidate as GenerationCanvasWorkbenchMaterializeRequest;
}

function placeMediaRequest(value: unknown): GenerationCanvasWorkbenchPlaceMediaRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Generation Canvas Media placement request must be an object.");
  }
  const candidate = value as Partial<GenerationCanvasWorkbenchPlaceMediaRequest>;
  assert(Number.isSafeInteger(candidate.graphRevision) && (candidate.graphRevision ?? -1) >= 0,
    "Generation Canvas Media placement graphRevision must be a non-negative integer.");
  assert(Number.isSafeInteger(candidate.workspaceRevision) && (candidate.workspaceRevision ?? -1) >= 0,
    "Generation Canvas Media placement workspaceRevision must be a non-negative integer.");
  assert(typeof candidate.media === "string" && candidate.media.trim().length > 0,
    "Generation Canvas Media placement requires a project Media Asset.");
  assert(Number.isFinite(candidate.placement?.x) && Number.isFinite(candidate.placement?.y),
    "Generation Canvas Media placement must contain finite coordinates.");
  return candidate as GenerationCanvasWorkbenchPlaceMediaRequest;
}

type HttpByteRange = { readonly start: number; readonly end: number };

function httpByteRange(value: string | undefined, size: number): HttpByteRange | "invalid" | undefined {
  if (value === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (match === null || (match[1] === "" && match[2] === "")) return "invalid";
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] === "" ? size - 1 : Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)
    || start < 0 || requestedEnd < start || start >= size) return "invalid";
  return { start, end: Math.min(size - 1, requestedEnd) };
}

async function serveResultMedia(
  request: IncomingMessage,
  response: ServerResponse,
  products: ProductHistory,
  publication: string,
  name: string,
): Promise<void> {
  const address = { publication, name };
  const product = await products.readProduct(address);
  if (product === undefined || product.representation !== "file"
    || !/^(?:image|video|audio)\//u.test(product.mediaType)) {
    throw new Error(`Canvas result media ${publication}/${name} is unavailable.`);
  }
  const range = httpByteRange(request.headers.range, product.size);
  if (range === "invalid") {
    response.writeHead(416, { "accept-ranges": "bytes", "content-range": `bytes */${product.size}` });
    response.end();
    return;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? product.size - 1;
  response.writeHead(range === undefined ? 200 : 206, {
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "content-length": String(Math.max(0, end - start + 1)),
    "content-type": product.mediaType,
    "x-content-type-options": "nosniff",
    ...(range === undefined ? {} : { "content-range": `bytes ${start}-${end}/${product.size}` }),
  });
  if (request.method === "HEAD") { response.end(); return; }
  const resolved = await products.resolveProduct(address);
  if (resolved === undefined || !isBlobRef(resolved.value)) {
    throw new Error(`Canvas result media ${publication}/${name} cannot be opened.`);
  }
  const opened = await resolved.openResource(resolved.value, range === undefined
    ? undefined : { start, endExclusive: end + 1 });
  if (opened === undefined) throw new Error(`Canvas result media ${publication}/${name} bytes are unavailable.`);
  await pipeline(Readable.from(opened), response);
}

async function serveProjectMedia(
  request: IncomingMessage,
  response: ServerResponse,
  resource: ProjectMediaLibraryResource,
): Promise<void> {
  const range = httpByteRange(request.headers.range, resource.size);
  if (range === "invalid") {
    response.writeHead(416, {
      "accept-ranges": "bytes",
      "content-range": `bytes */${resource.size}`,
      "x-content-type-options": "nosniff",
    });
    response.end();
    return;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? resource.size - 1;
  const length = Math.max(0, end - start + 1);
  response.writeHead(range === undefined ? 200 : 206, {
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "content-length": String(length),
    "content-type": resource.mediaType,
    "x-content-type-options": "nosniff",
    ...(range === undefined ? {} : { "content-range": `bytes ${start}-${end}/${resource.size}` }),
  });
  if (request.method === "HEAD" || length === 0) { response.end(); return; }
  await pipeline(createReadStream(resource.file, { start, end }), response);
}

function affectedNodes(project: GenerationGraphProject, commands: readonly GenerationGraphCommand[]): readonly string[] {
  const present = new Set(project.nodes.map((node) => node.id));
  const roots = new Set(commands.flatMap((command) => (command.kind === "node.add" || command.kind === "node.replace")
    && present.has(command.node.id) ? [command.node.id] : []));
  const affected = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of project.nodes) {
      if (affected.has(node.id)) continue;
      if (Object.values(node.inputs).some((input) => "node" in input && affected.has(input.node))) {
        affected.add(node.id);
        changed = true;
      }
    }
  }
  return [...affected];
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then(() => true, () => false);
}

function importFileName(value: string | null): string {
  assert(value !== null && value.length > 0, "Imported media must have a file name.");
  assert(value === basename(value) && !value.includes("\\"), "Imported media file name is invalid.");
  return value;
}

function importCoordinate(value: string | null, name: string): number {
  const coordinate = Number(value);
  assert(value !== null && Number.isFinite(coordinate), `Imported media ${name} must be a finite number.`);
  return Math.round(coordinate);
}

function mediaRole(mediaType: string): "image" | "video" | "audio" {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("audio/")) return "audio";
  throw new Error(`Imported media type ${mediaType} cannot become a Canvas asset node.`);
}

function mediaAssetRole(document: MediaAssetDocument): "image" | "video" | "audio" {
  const picture = document.media.interpretation.picture;
  return picture === undefined ? "audio" : picture.kind === "constant" ? "image" : "video";
}

async function snapshot(
  graph: GenerationGraphProject,
  workspace: GenerationWorkspace,
  workspaceFile: string,
  graphFile: string,
  mediaLibrary: ProjectMediaLibrary,
  presentations?: GenerationCanvasPresentationHost,
  graphHost?: GenerationGraphInspectionHost & Partial<GenerationNodeAuthoringHost>,
  results?: GenerationCanvasWorkbenchResultsHost,
  execution?: GenerationCanvasWorkbenchExecutionHost,
  environment?: GenerationCanvasWorkbenchEnvironmentHost,
  materialization?: GenerationCanvasWorkbenchMaterializationHost,
): Promise<GenerationCanvasWorkbenchSnapshot> {
  const authorings = graphHost?.resolveAuthoring === undefined || graphHost.listAuthoring === undefined
    ? undefined
    : graphHost as GenerationGraphInspectionHost & GenerationNodeAuthoringHost;
  const observations = results === undefined
    ? []
    : await observeGenerationWorkspaceOutputs(workspace, results.observations);
  const environmentView = await environment?.observe();
  const generation = execution === undefined
    ? { available: false, issue: "Generation Runtime is unavailable in this Workbench." }
    : await execution.status();
  return {
    format: "hypit.workbench-generation-canvas@1",
    graph,
    workspace,
    scene: projectGenerationCanvas(graph, workspace, observations, presentations, authorings),
    nodes: graphHost === undefined
      ? graph.nodes.map((node) => ({ node: node.id, readiness: "invalid" as const,
          message: "Generation Graph authoring packages are unavailable." }))
      : await inspectGenerationGraphProject(graph, graphHost),
    catalog: (presentations?.list() ?? []).map((presentation) => {
      const shape = authorings?.resolveAuthoring({ id: "catalog", using: presentation.using, inputs: {} });
      return shape === undefined ? presentation : {
        ...presentation,
        editor: { ...shape, labels: structuredClone(presentation.authoring ?? {}) },
      };
    }),
    mediaLibrary: await mediaLibrary.view(),
    generation,
    ...(environmentView === undefined ? {} : { environment: environmentView }),
    materialization: results === undefined || materialization === undefined
      ? { available: false, issue: "Product materialization is unavailable in this Workbench." }
      : { available: true },
    workspaceFile,
    graphFile,
  };
}

/** Serve one ordinary Generation Canvas file without introducing a browser-owned project model. */
export async function startGenerationCanvasWorkbenchServer(options: {
  readonly projectRoot: string;
  readonly workspaceFile: string;
  readonly host?: "127.0.0.1" | "::1";
  readonly port?: number;
  readonly presentations?: GenerationCanvasPresentationHost;
  readonly graphHost?: GenerationGraphInspectionHost & Partial<GenerationNodeAuthoringHost>;
  readonly results?: GenerationCanvasWorkbenchResultsHost;
  readonly execution?: GenerationCanvasWorkbenchExecutionHost;
  readonly environment?: GenerationCanvasWorkbenchEnvironmentHost;
  readonly materialization?: GenerationCanvasWorkbenchMaterializationHost;
  /** Injectable only so the HTTP boundary can be tested without invoking a media toolchain. */
  readonly importMediaAsset?: typeof importLocalMediaAsset;
}): Promise<GenerationCanvasWorkbenchServer> {
  const projectRoot = resolve(options.projectRoot);
  const workspaceFile = projectMember(projectRoot, options.workspaceFile, "Generation Workspace");
  let workspace = await readGenerationWorkspaceFile(workspaceFile);
  const graphFile = projectMember(
    projectRoot, resolve(dirname(workspaceFile), workspace.graph.path), "Generation Graph",
  );
  let graph = await readGenerationGraphProjectFile(graphFile);
  const mediaLibrary = new ProjectMediaLibrary(projectRoot, graphFile, "/api/canvas/media-resource");
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const importMediaAsset = options.importMediaAsset ?? importLocalMediaAsset;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Workbench port must be an integer from 0 through 65535.");
  }
  let mutation = Promise.resolve();
  const mutate = async (operation: () => Promise<void> | void): Promise<void> => {
    const next = mutation.then(operation, operation);
    mutation = next.then(() => undefined, () => undefined);
    await next;
  };

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://workbench.local");
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(302, { location: "/canvas" });
        response.end();
        return;
      }
      if (request.method === "GET" && ["/canvas", "/nle", "/3d", "/comments"].includes(url.pathname)) {
        const html = await readFile(new URL("../client/canvas.html", import.meta.url));
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'",
          "content-type": "text/html; charset=utf-8",
          "x-content-type-options": "nosniff",
        });
        response.end(html);
        return;
      }
      const asset = clientAssets.get(url.pathname);
      if (request.method === "GET" && asset !== undefined) {
        response.writeHead(200, {
          "cache-control": "no-cache",
          "content-type": asset.type,
          "x-content-type-options": "nosniff",
        });
        response.end(await readFile(join(clientDirectory, asset.path)));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/canvas") {
        json(response, 200, await snapshot(graph, workspace, workspaceFile, graphFile, mediaLibrary,
          options.presentations, options.graphHost, options.results, options.execution, options.environment,
          options.materialization));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/canvas/environment/connect") {
        assert(options.environment !== undefined, "Workbench environment actions are unavailable.");
        await options.environment.connect();
        json(response, 200, await snapshot(graph, workspace, workspaceFile, graphFile, mediaLibrary,
          options.presentations, options.graphHost, options.results, options.execution, options.environment,
          options.materialization));
        return;
      }
      if ((request.method === "GET" || request.method === "HEAD")
        && url.pathname.startsWith("/api/canvas/media-resource/")) {
        const requestedGeneration = Number(url.searchParams.get("generation"));
        if (!Number.isSafeInteger(requestedGeneration) || requestedGeneration !== mediaLibrary.generation) {
          throw new Error("Canvas Media Library projection is stale.");
        }
        const id = decodeURIComponent(url.pathname.slice("/api/canvas/media-resource/".length));
        const resource = mediaLibrary.resource(id);
        if (resource === undefined) throw new Error(`Canvas Media ${id} is unavailable.`);
        await serveProjectMedia(request, response, resource);
        return;
      }
      if ((request.method === "GET" || request.method === "HEAD")
        && url.pathname === "/api/canvas/result-media") {
        assert(options.results !== undefined, "Generation Product history is unavailable.");
        const publication = url.searchParams.get("publication");
        const name = url.searchParams.get("name");
        assert(publication !== null && name !== null, "Canvas result media address is incomplete.");
        await serveResultMedia(request, response, options.results.products, publication, name);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/canvas/builds") {
        assert(options.execution !== undefined, "Generation Runtime is unavailable in this Workbench.");
        const executionStatus = await options.execution.status();
        assert(executionStatus.available, executionStatus.issue ?? "Generation Runtime is unavailable in this Workbench.");
        const input = buildRequest(await requestJson(request));
        let capturedGraph!: GenerationGraphProject;
        let capturedWorkspace!: GenerationWorkspace;
        await mutate(() => {
          if (graph.revision !== input.graphRevision) {
            throw new GenerationGraphRevisionConflict(input.graphRevision, graph.revision);
          }
          if (workspace.revision !== input.workspaceRevision) {
            throw new GenerationWorkspaceRevisionConflict(input.workspaceRevision, workspace.revision);
          }
          capturedGraph = structuredClone(graph);
          capturedWorkspace = structuredClone(workspace);
        });
        const prepared = await options.execution.prepare({
          graph: capturedGraph,
          workspace: capturedWorkspace,
          node: input.node,
        });
        const submitted = await options.execution.submit({ graphFile, prepared });
        const generated = prepared.generated.map((item) => item.node);
        let unattached: string[] = [];
        await mutate(async () => {
          const present = new Set(workspace.nodes.map((node) => node.node));
          const outputs = generated.filter((node) => present.has(node));
          unattached = generated.filter((node) => !present.has(node));
          if (outputs.length === 0) return;
          workspace = applyGenerationWorkspaceTransaction(workspace,
            planAcceptedGenerationWorkspaceBuild(workspace, { build: submitted.id, outputs }));
          await writeGenerationWorkspaceFile(workspaceFile, workspace);
        });
        const value: GenerationCanvasWorkbenchBuildResponse = {
          snapshot: await snapshot(graph, workspace, workspaceFile, graphFile, mediaLibrary,
            options.presentations, options.graphHost, options.results, options.execution, options.environment,
            options.materialization),
          build: submitted.id,
          generated,
          unattached,
        };
        json(response, 200, value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/canvas/materialize-product") {
        assert(options.results !== undefined, "Generation Product history is unavailable.");
        assert(options.materialization !== undefined, "Product materialization is unavailable in this Workbench.");
        assert(options.graphHost !== undefined,
          "Generation Graph authoring packages are unavailable in this Workbench.");
        const input = materializeRequest(await requestJson(request));
        let materialized!: GenerationCanvasWorkbenchMaterializeResponse["materialized"];
        await mutate(async () => {
          if (graph.revision !== input.graphRevision) {
            throw new GenerationGraphRevisionConflict(input.graphRevision, graph.revision);
          }
          if (workspace.revision !== input.workspaceRevision) {
            throw new GenerationWorkspaceRevisionConflict(input.workspaceRevision, workspace.revision);
          }
          const source = workspace.nodes.find((item) => item.node === input.sourceNode);
          assert(source !== undefined, `Generation Canvas source node ${input.sourceNode} is unavailable.`);
          assert(workspace.outputs.some((output) => output.node === input.sourceNode
            && output.build === input.product.build && output.output === input.product.output),
          `Product ${input.product.build}/${input.product.output} is not attached to ${input.sourceNode}.`);
          const product = await options.results!.products.readProduct({
            publication: input.product.build,
            name: input.product.output,
          });
          assert(product !== undefined, `Product ${input.product.build}/${input.product.output} does not exist.`);
          assert(product.representation === "file", "Only one-file Products can become Canvas Media Assets.");
          const role = mediaRole(product.mediaType);
          const graphDirectory = dirname(graphFile);
          const mediaDirectory = join(projectRoot, "media");
          const baseId = mediaAssetIdFromFile(`${input.sourceNode}-asset`);
          let id = baseId;
          let suffix = 2;
          while (graph.nodes.some((node) => node.id === id) || await exists(join(mediaDirectory, id))) {
            id = `${baseId}-${suffix}`;
            suffix += 1;
          }
          const assetDirectory = join(mediaDirectory, id);
          const assetPath = join(assetDirectory, `${id}.media.json`);
          const asset = portableRelative(graphDirectory, assetPath);
          const graphNode = createMediaAssetGenerationGraphNode({ id, role, asset: { path: asset } });
          const candidateGraph = applyGenerationGraphTransaction(graph, {
            revision: graph.revision,
            commands: [{ kind: "node.add", node: graphNode }],
          });
          const reports = await inspectGenerationGraphProject(candidateGraph, options.graphHost!, [id]);
          const invalid = reports.filter((report) => report.readiness === "invalid");
          assert(invalid.length === 0, invalid.map((report) => report.readiness === "invalid"
            ? `${report.node}: ${report.message}` : "").join("\n"));
          let keepAsset = false;
          try {
            const adopted = await adoptOutputInGenerationWorkspace({
              workspacePath: workspaceFile,
              workspaceRevision: workspace.revision,
              graphRevision: graph.revision,
              output: input.product,
              node: id,
              name: source.name,
              placement: { x: Math.round(input.placement.x), y: Math.round(input.placement.y) },
              materialize: async ({ product: address }) => {
                const result = await options.materialization!.materialize({ product: address, assetPath, id },
                  options.results!.products);
                assert(resolve(result.assetPath) === resolve(assetPath),
                  "Product materializer wrote a different Media Asset document.");
                return graphNode;
              },
            });
            graph = adopted.graph;
            workspace = adopted.workspace;
            keepAsset = true;
          } finally {
            if (!keepAsset) await rm(assetDirectory, { recursive: true, force: true });
          }
          materialized = { node: id, asset, role, product: structuredClone(input.product) };
        });
        await mediaLibrary.refresh();
        const value: GenerationCanvasWorkbenchMaterializeResponse = {
          snapshot: await snapshot(graph, workspace, workspaceFile, graphFile, mediaLibrary,
            options.presentations, options.graphHost, options.results, options.execution, options.environment, options.materialization),
          materialized,
        };
        json(response, 200, value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/canvas/media-library/refresh") {
        await mediaLibrary.refresh();
        json(response, 200, await snapshot(graph, workspace, workspaceFile, graphFile, mediaLibrary,
          options.presentations, options.graphHost, options.results, options.execution, options.environment, options.materialization));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/canvas/media-assets/place") {
        assert(options.graphHost !== undefined,
          "Generation Graph authoring packages are unavailable in this Workbench.");
        const input = placeMediaRequest(await requestJson(request));
        if (mediaLibrary.generation === undefined) await mediaLibrary.refresh();
        const media = mediaLibrary.materialization(input.media);
        assert(media !== undefined, `Project Media Asset ${input.media} is unavailable.`);
        const role = mediaAssetRole(media.document);
        let placed!: GenerationCanvasWorkbenchPlaceMediaResponse["placed"];
        await mutate(async () => {
          if (graph.revision !== input.graphRevision) {
            throw new GenerationGraphRevisionConflict(input.graphRevision, graph.revision);
          }
          if (workspace.revision !== input.workspaceRevision) {
            throw new GenerationWorkspaceRevisionConflict(input.workspaceRevision, workspace.revision);
          }
          const assetFile = resolve(dirname(graphFile), media.asset);
          const existing = graph.nodes.find((node) => {
            const asset = node.inputs.asset;
            return asset !== undefined && "value" in asset && typeof asset.value === "object"
              && asset.value !== null && "path" in asset.value && typeof asset.value.path === "string"
              && resolve(dirname(graphFile), asset.value.path) === assetFile;
          });
          if (existing !== undefined) {
            if (!workspace.nodes.some((node) => node.node === existing.id)) {
              const candidateWorkspace = applyGenerationWorkspaceTransaction(workspace, {
                revision: workspace.revision,
                commands: [{ kind: "node.add", node: {
                  node: existing.id,
                  name: media.document.id,
                  x: Math.round(input.placement.x),
                  y: Math.round(input.placement.y),
                } }],
              });
              await writeGenerationWorkspaceFile(workspaceFile, candidateWorkspace);
              workspace = candidateWorkspace;
            }
            placed = { node: existing.id, asset: media.asset, role, existing: true };
            return;
          }
          const baseId = mediaAssetIdFromFile(media.document.id);
          let id = baseId;
          let suffix = 2;
          while (graph.nodes.some((node) => node.id === id)) {
            id = `${baseId}-${suffix}`;
            suffix += 1;
          }
          const graphNode = createMediaAssetGenerationGraphNode({ id, role, asset: { path: media.asset } });
          const candidateGraph = applyGenerationGraphTransaction(graph, {
            revision: graph.revision,
            commands: [{ kind: "node.add", node: graphNode }],
          });
          const reports = await inspectGenerationGraphProject(candidateGraph, options.graphHost!, [id]);
          const invalid = reports.filter((report) => report.readiness === "invalid");
          assert(invalid.length === 0, invalid.map((report) => report.readiness === "invalid"
            ? `${report.node}: ${report.message}` : "").join("\n"));
          const candidateWorkspace = applyGenerationWorkspaceTransaction(workspace, {
            revision: workspace.revision,
            commands: [{ kind: "node.add", node: {
              node: id,
              name: media.document.id,
              x: Math.round(input.placement.x),
              y: Math.round(input.placement.y),
            } }],
          });
          await writeGenerationGraphProjectFile(graphFile, candidateGraph);
          await writeGenerationWorkspaceFile(workspaceFile, candidateWorkspace);
          graph = candidateGraph;
          workspace = candidateWorkspace;
          placed = { node: id, asset: media.asset, role, existing: false };
        });
        const value: GenerationCanvasWorkbenchPlaceMediaResponse = {
          snapshot: await snapshot(graph, workspace, workspaceFile, graphFile, mediaLibrary,
            options.presentations, options.graphHost, options.results, options.execution, options.environment, options.materialization),
          placed,
        };
        json(response, 200, value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/canvas/import") {
        assert(options.graphHost !== undefined,
          "Generation Graph authoring packages are unavailable in this Workbench.");
        const fileName = importFileName(url.searchParams.get("name"));
        const x = importCoordinate(url.searchParams.get("x"), "x");
        const y = importCoordinate(url.searchParams.get("y"), "y");
        const graphDirectory = dirname(graphFile);
        const mediaDirectory = join(projectRoot, "media");
        const stagingDirectory = await mkdtemp(join(graphDirectory, ".hypit-canvas-upload-"));
        const stagedFile = join(stagingDirectory, `upload${extname(fileName).toLowerCase()}`);
        let assetDirectory: string | undefined;
        try {
          await pipeline(request, createWriteStream(stagedFile, { flags: "wx" }));
          const baseId = mediaAssetIdFromFile(fileName);
          let id = baseId;
          let suffix = 2;
          while (graph.nodes.some((node) => node.id === id)
            || await exists(join(mediaDirectory, id))) {
            id = `${baseId}-${suffix}`;
            suffix += 1;
          }
          assetDirectory = join(mediaDirectory, id);
          const assetPath = join(assetDirectory, `${id}.media.json`);
          const imported = await importMediaAsset({
            sourcePath: stagedFile,
            assetPath,
            id,
            filePolicy: "copy",
            mediaFile: `${id}${extname(fileName).toLowerCase()}`,
          });
          const role = mediaRole(imported.document.media.file.mediaType);
          const asset = portableRelative(graphDirectory, imported.assetPath);
          const graphNode = createMediaAssetGenerationGraphNode({ id, role, asset: { path: asset } });
          await mutate(async () => {
            const graphTransaction: GenerationGraphTransaction = {
              revision: graph.revision,
              commands: [{ kind: "node.add", node: graphNode }],
            };
            const candidateGraph = applyGenerationGraphTransaction(graph, graphTransaction);
            const reports = await inspectGenerationGraphProject(candidateGraph, options.graphHost!, [id]);
            const invalid = reports.filter((report) => report.readiness === "invalid");
            assert(invalid.length === 0, invalid.map((report) => report.readiness === "invalid"
              ? `${report.node}: ${report.message}` : "").join("\n"));
            const candidateWorkspace = applyGenerationWorkspaceTransaction(workspace, {
              revision: workspace.revision,
              commands: [{ kind: "node.add", node: { node: id, name: parse(fileName).name, x, y } }],
            });
            await writeGenerationGraphProjectFile(graphFile, candidateGraph);
            await writeGenerationWorkspaceFile(workspaceFile, candidateWorkspace);
            graph = candidateGraph;
            workspace = candidateWorkspace;
          });
          assetDirectory = undefined;
          await mediaLibrary.refresh();
          const responseValue: GenerationCanvasWorkbenchImportResponse = {
            snapshot: await snapshot(graph, workspace, workspaceFile, graphFile, mediaLibrary,
              options.presentations, options.graphHost, options.results, options.execution, options.environment, options.materialization),
            imported: { node: id, asset, role },
          };
          json(response, 200, responseValue);
        } finally {
          await rm(stagingDirectory, { recursive: true, force: true });
          if (assetDirectory !== undefined) {
            await rm(assetDirectory, { recursive: true, force: true });
          }
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/canvas/transaction") {
        const input = transactionRequest(await requestJson(request));
        await mutate(async () => {
          workspace = applyGenerationWorkspaceTransaction(workspace, input.transaction as GenerationWorkspaceTransaction);
          await writeGenerationWorkspaceFile(workspaceFile, workspace);
        });
        json(response, 200, await snapshot(graph, workspace, workspaceFile, graphFile, mediaLibrary,
          options.presentations, options.graphHost, options.results, options.execution, options.environment, options.materialization));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/canvas/graph-transaction") {
        const input = graphTransactionRequest(await requestJson(request));
        assert(options.graphHost !== undefined,
          "Generation Graph authoring packages are unavailable in this Workbench.");
        await mutate(async () => {
          const transaction = input.transaction as GenerationGraphTransaction;
          const candidate = applyGenerationGraphTransaction(graph, transaction);
          const affected = affectedNodes(candidate, transaction.commands);
          const reports = await inspectGenerationGraphProject(candidate, options.graphHost!, affected);
          const invalid = reports.filter((report) => report.readiness === "invalid");
          assert(invalid.length === 0, invalid.map((report) => report.readiness === "invalid"
            ? `${report.node}: ${report.message}` : "").join("\n"));
          graph = candidate;
          await writeGenerationGraphProjectFile(graphFile, graph);
        });
        json(response, 200, await snapshot(graph, workspace, workspaceFile, graphFile, mediaLibrary,
          options.presentations, options.graphHost, options.results, options.execution, options.environment, options.materialization));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/canvas/edit") {
        const input = editRequest(await requestJson(request));
        assert(options.graphHost !== undefined,
          "Generation Graph authoring packages are unavailable in this Workbench.");
        await mutate(async () => {
          const candidateGraph = applyGenerationGraphTransaction(graph, input.graph);
          const affected = affectedNodes(candidateGraph, input.graph.commands);
          const reports = await inspectGenerationGraphProject(candidateGraph, options.graphHost!, affected);
          const invalid = reports.filter((report) => report.readiness === "invalid");
          assert(invalid.length === 0, invalid.map((report) => report.readiness === "invalid"
            ? `${report.node}: ${report.message}` : "").join("\n"));
          const candidateWorkspace = applyGenerationWorkspaceTransaction(workspace, input.workspace);
          graph = candidateGraph;
          workspace = candidateWorkspace;
          await writeGenerationGraphProjectFile(graphFile, graph);
          await writeGenerationWorkspaceFile(workspaceFile, workspace);
        });
        json(response, 200, await snapshot(graph, workspace, workspaceFile, graphFile, mediaLibrary,
          options.presentations, options.graphHost, options.results, options.execution, options.environment, options.materialization));
        return;
      }
      json(response, 404, errorView(new Error(`Unknown Workbench route: ${url.pathname}`)));
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      json(response, error instanceof GenerationWorkspaceRevisionConflict
        || error instanceof GenerationGraphRevisionConflict ? 409 : 400, errorView(error));
    }
  });

  await new Promise<void>((fulfill, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      fulfill();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Workbench server did not bind a TCP address.");
  }
  const origin = loopbackOrigin(host, address.port);
  return {
    kind: "generation-canvas",
    origin,
    canvasUrl: `${origin}/canvas`,
    workspaceFile,
    graphFile,
    async close() {
      await new Promise<void>((fulfill, reject) => server.close((error) => error === undefined ? fulfill() : reject(error)));
    },
  };
}
