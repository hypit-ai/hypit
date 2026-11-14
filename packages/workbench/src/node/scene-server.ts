import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canRedoSceneEdit,
  canUndoSceneEdit,
  commitSceneEdit,
  completeSceneProjectSave,
  createSceneAuthoringHost,
  isSceneEditSessionDirty,
  createSceneLoweringHost,
  evaluateSceneProgramAt,
  lowerScenePerformance,
  prepareSceneProjectSave,
  redoSceneEdit,
  parseSceneAssetDocument,
  parseSceneLibraryDocument,
  undoSceneEdit,
  type SceneAssetDocument,
  type SceneAuthoringHost,
  type SceneEditSession,
  type SceneLibraryDocument,
  type SceneLoweringHost,
  type SceneObject,
  type SceneProject,
} from "@hypit/scene";
import { readSceneProjectFile, writeSceneProjectFile } from "@hypit/scene/node";
import {
  applySceneViewTransaction,
  assertSceneViewAllowsTransaction,
  createSceneView,
  projectSceneWorkbench,
  reconcileSceneView,
  type SceneObjectObservation,
  type SceneView,
} from "@hypit/scene-view";
import { readSceneViewFile, writeSceneViewFile } from "@hypit/scene-view/node";
import { importLocalMediaAsset, mediaAssetIdFromFile } from "@hypit/media-local";

import type {
  SceneWorkbenchSnapshot,
  SceneWorkbenchPerformancePreview,
  SceneWorkbenchLibrary,
  SceneWorkbenchTransactionRequest,
  SceneWorkbenchViewTransactionRequest,
  SceneWorkbenchObjectParameterRequest,
  SceneWorkbenchEnvironmentParameterRequest,
  SceneWorkbenchBehaviorParameterRequest,
  SceneWorkbenchExportRequest,
  SceneWorkbenchExportState,
} from "../scene-protocol.js";
import type { WorkbenchErrorView } from "../protocol.js";
import { recordSceneOutput } from "../scene-record.js";
import {
  connectWorkbenchEnvironment,
  observeWorkbenchEnvironment,
  type WorkbenchEnvironmentHost,
} from "./environment.js";

const clientDirectory = fileURLToPath(new URL("../client/", import.meta.url));
const clientAssets = new Map([
  ["/assets/3d.js", { path: "3d.js", type: "text/javascript; charset=utf-8" }],
  ["/assets/3d.css", { path: "3d.css", type: "text/css; charset=utf-8" }],
  ["/assets/topbar.js", { path: "topbar.js", type: "text/javascript; charset=utf-8" }],
  ["/assets/topbar.css", { path: "topbar.css", type: "text/css; charset=utf-8" }],
]);
const threeAssets = new Map([
  ["/assets/three.module.js", { path: fileURLToPath(import.meta.resolve("three")), rewrite: false }],
  ["/assets/three.core.js", {
    path: resolve(dirname(fileURLToPath(import.meta.resolve("three"))), "three.core.js"), rewrite: false,
  }],
  ["/assets/OrbitControls.js", {
    path: fileURLToPath(import.meta.resolve("three/addons/controls/OrbitControls.js")), rewrite: true,
  }],
  ["/assets/TransformControls.js", {
    path: fileURLToPath(import.meta.resolve("three/addons/controls/TransformControls.js")), rewrite: true,
  }],
  ["/assets/GLTFLoader.js", {
    path: fileURLToPath(import.meta.resolve("three/addons/loaders/GLTFLoader.js")), rewrite: true, gltf: true,
  }],
  ["/assets/BufferGeometryUtils.js", {
    path: fileURLToPath(import.meta.resolve("three/addons/utils/BufferGeometryUtils.js")), rewrite: true,
  }],
]);

export type SceneWorkbenchServer = {
  readonly origin: string;
  readonly sceneUrl: string;
  readonly projectFile: string;
  readonly viewFile: string;
  close(): Promise<void>;
};

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
  return { format: "hypit.workbench-error@1", error: { name: source.name, message: source.message } };
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
  if (length === 0) throw new Error("Workbench request body is empty.");
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function transactionRequest(value: unknown): SceneWorkbenchTransactionRequest {
  if (value === null || typeof value !== "object") throw new Error("Scene transaction request must be an object.");
  const input = value as Partial<SceneWorkbenchTransactionRequest>;
  if (typeof input.label !== "string" || input.label.trim().length === 0) throw new Error("Scene transaction label is required.");
  if (input.transaction === null || typeof input.transaction !== "object") throw new Error("Scene transaction is required.");
  return input as SceneWorkbenchTransactionRequest;
}

function viewTransactionRequest(value: unknown): SceneWorkbenchViewTransactionRequest {
  if (value === null || typeof value !== "object") throw new Error("Scene View transaction request must be an object.");
  const input = value as Partial<SceneWorkbenchViewTransactionRequest>;
  if (input.transaction === null || typeof input.transaction !== "object") throw new Error("Scene View transaction is required.");
  return input as SceneWorkbenchViewTransactionRequest;
}

function objectParameterRequest(value: unknown): SceneWorkbenchObjectParameterRequest {
  if (value === null || typeof value !== "object") throw new Error("Scene Object parameter request must be an object.");
  const input = value as Partial<SceneWorkbenchObjectParameterRequest>;
  if (!Number.isSafeInteger(input.revision) || (input.revision ?? -1) < 0) {
    throw new Error("Scene Object parameter revision is invalid.");
  }
  if (typeof input.object !== "string" || input.object.length === 0) {
    throw new Error("Scene Object parameter target is required.");
  }
  if (!("operation" in input)) throw new Error("Scene Object parameter operation is required.");
  return input as SceneWorkbenchObjectParameterRequest;
}

function environmentParameterRequest(value: unknown): SceneWorkbenchEnvironmentParameterRequest {
  if (value === null || typeof value !== "object") {
    throw new Error("Scene Environment parameter request must be an object.");
  }
  const input = value as Partial<SceneWorkbenchEnvironmentParameterRequest>;
  if (!Number.isSafeInteger(input.revision) || (input.revision ?? -1) < 0) {
    throw new Error("Scene Environment parameter revision is invalid.");
  }
  if (!("operation" in input)) throw new Error("Scene Environment parameter operation is required.");
  return input as SceneWorkbenchEnvironmentParameterRequest;
}

function behaviorParameterRequest(value: unknown): SceneWorkbenchBehaviorParameterRequest {
  if (value === null || typeof value !== "object") throw new Error("Scene Behavior parameter request must be an object.");
  const input = value as Partial<SceneWorkbenchBehaviorParameterRequest>;
  if (!Number.isSafeInteger(input.revision) || (input.revision ?? -1) < 0) {
    throw new Error("Scene Behavior parameter revision is invalid.");
  }
  for (const field of ["performance", "track", "item"] as const) {
    if (typeof input[field] !== "string" || input[field].length === 0) {
      throw new Error(`Scene Behavior parameter ${field} is required.`);
    }
  }
  if (!("operation" in input)) throw new Error("Scene Behavior parameter operation is required.");
  return input as SceneWorkbenchBehaviorParameterRequest;
}

function exportRequest(value: unknown): SceneWorkbenchExportRequest {
  if (value === null || typeof value !== "object") throw new Error("Scene export request must be an object.");
  const input = value as Partial<SceneWorkbenchExportRequest>;
  if (!Number.isSafeInteger(input.revision) || (input.revision ?? -1) < 0) {
    throw new Error("Scene export revision is invalid.");
  }
  if (typeof input.fileName !== "string" || !/^[^/\\]+\.mp4$/iu.test(input.fileName)) {
    throw new Error("Scene export fileName must be one local .mp4 name.");
  }
  if (typeof input.performance !== "string" || input.performance.length === 0) {
    throw new Error("Scene export Performance is required.");
  }
  if (input.view !== "follow" && (typeof input.view !== "string" || !input.view.startsWith("camera:"))) {
    throw new Error("Scene export view is invalid.");
  }
  if (input.range !== "performance" && (typeof input.range !== "string"
    || (!input.range.startsWith("shot:") && !input.range.startsWith("item:")))) {
    throw new Error("Scene export range is invalid.");
  }
  const resolution = input.resolution;
  if (resolution === undefined || !Number.isSafeInteger(resolution.width) || resolution.width <= 0
    || !Number.isSafeInteger(resolution.height) || resolution.height <= 0
    || resolution.width > 7680 || resolution.height > 7680) {
    throw new Error("Scene export resolution must contain positive dimensions up to 7680 pixels.");
  }
  if (!Number.isFinite(input.frameRate) || (input.frameRate ?? 0) <= 0 || (input.frameRate ?? 0) > 120) {
    throw new Error("Scene export frameRate must lie above 0 and at most 120.");
  }
  return input as SceneWorkbenchExportRequest;
}

type SceneTime = { readonly ticks: string; readonly timeBase: { readonly numerator: number; readonly denominator: number } };

function timeSeconds(value: SceneTime): number {
  return Number(BigInt(value.ticks)) * value.timeBase.numerator / value.timeBase.denominator;
}

function exportTimeRange(project: SceneProject, input: SceneWorkbenchExportRequest): { start: number; end: number } {
  const performance = project.performances.find((entry) => entry.id === input.performance);
  if (performance === undefined) throw new Error(`Unknown Scene Performance: ${input.performance}`);
  const performanceEnd = timeSeconds(performance.duration);
  let start = 0;
  let duration = performanceEnd;
  if (input.range.startsWith("shot:")) {
    const id = input.range.slice("shot:".length);
    const shot = performance.shots.find((entry) => entry.id === id);
    if (shot === undefined) throw new Error(`Unknown Scene Shot: ${id}`);
    start = timeSeconds(shot.start);
    duration = timeSeconds(shot.duration);
  } else if (input.range.startsWith("item:")) {
    const id = input.range.slice("item:".length);
    const item = performance.tracks.flatMap((track) => track.items).find((entry) => entry.id === id);
    if (item === undefined) throw new Error(`Unknown Scene Behavior Item: ${id}`);
    start = timeSeconds(item.start);
    duration = timeSeconds(item.duration);
  }
  const end = Math.min(performanceEnd, start + duration);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new Error("Selected Scene export range is empty.");
  }
  return { start, end };
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then(() => true, () => false);
}

type OpenedSceneLibraries = {
  readonly views: readonly SceneWorkbenchLibrary[];
  readonly models: ReadonlyMap<string, { readonly path: string; readonly mediaType: string }>;
};

type ResolvedSceneLibrary = {
  readonly file: string;
  readonly document: SceneLibraryDocument;
};

function ownedPath(ownerFile: string, path: string, suffix?: string): string | undefined {
  if (path.length === 0 || path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/u.test(path)) return undefined;
  const destination = resolve(dirname(ownerFile), path);
  const inside = relative(dirname(ownerFile), destination);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || resolve(inside) === inside) return undefined;
  return suffix === undefined || destination.endsWith(suffix) ? destination : undefined;
}

function projectReferencePath(
  projectRoot: string,
  ownerFile: string,
  path: string,
  suffix?: string,
): string | undefined {
  if (path.length === 0 || path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/u.test(path)) return undefined;
  if (path.split("/").some((part) => part.length === 0 || part === ".")) return undefined;
  const destination = resolve(dirname(ownerFile), path);
  const inside = relative(projectRoot, destination);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || resolve(inside) === inside) return undefined;
  return suffix === undefined || destination.endsWith(suffix) ? destination : undefined;
}

function assetDocumentPath(value: SceneObject, projectFile: string, projectRoot: string): string | undefined {
  const parameters = value.parameters;
  if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) return undefined;
  const asset = (parameters as Readonly<Record<string, unknown>>).asset;
  if (asset === null || typeof asset !== "object" || Array.isArray(asset)) return undefined;
  const path = (asset as Readonly<Record<string, unknown>>).path;
  return typeof path === "string"
    ? projectReferencePath(projectRoot, projectFile, path, ".scene-asset.json")
    : undefined;
}

function documentModel(document: SceneAssetDocument, documentPath: string): { path: string; mediaType: string } | undefined {
  const model = document.resources.model;
  if (model === undefined || !["model/gltf-binary", "model/gltf+json"].includes(model.mediaType)) return undefined;
  const expectedExtension = model.mediaType === "model/gltf-binary" ? ".glb" : ".gltf";
  const path = ownedPath(documentPath, model.path, expectedExtension);
  return path === undefined ? undefined : { path, mediaType: model.mediaType };
}

function documentPreview(document: SceneAssetDocument, documentPath: string): { path: string; mediaType: string } | undefined {
  const preview = document.preview;
  if (preview === undefined || !["model/gltf-binary", "model/gltf+json"].includes(preview.mediaType)) {
    return documentModel(document, documentPath);
  }
  const expectedExtension = preview.mediaType === "model/gltf-binary" ? ".glb" : ".gltf";
  const path = ownedPath(documentPath, preview.path, expectedExtension);
  return path === undefined ? undefined : { path, mediaType: preview.mediaType };
}

async function assetModel(
  value: SceneObject,
  projectFile: string,
  projectRoot: string,
): Promise<{ path: string; mediaType: string } | undefined> {
  const documentPath = assetDocumentPath(value, projectFile, projectRoot);
  if (documentPath === undefined) return undefined;
  return documentModel(parseSceneAssetDocument(await readFile(documentPath, "utf8")), documentPath);
}

async function openSceneLibraries(
  libraries: readonly ResolvedSceneLibrary[],
  projectFile: string,
  projectRoot: string,
): Promise<OpenedSceneLibraries> {
  const models = new Map<string, { path: string; mediaType: string }>();
  const views = await Promise.all(libraries.map(async ({ document: library, file: libraryFile }) => ({
    id: library.id,
    name: library.name,
    collections: structuredClone(library.collections),
    entries: await Promise.all(library.entries.map(async (entry) => {
      const assetPath = projectReferencePath(projectRoot, libraryFile, entry.asset.path, ".scene-asset.json");
      if (assetPath === undefined) throw new Error(`Scene Library Entry ${entry.id} has an invalid Scene Asset path.`);
      const asset = parseSceneAssetDocument(await readFile(assetPath, "utf8"));
      const preview = documentPreview(asset, assetPath);
      if (preview !== undefined) models.set(`${library.id}\u0000${entry.id}`, preview);
      return {
        ...structuredClone(entry),
        asset: { path: relative(dirname(projectFile), assetPath).split(sep).join("/") },
        using: structuredClone(asset.using),
        parameters: structuredClone(asset.parameters),
        ...(preview === undefined ? {} : { preview: {
          kind: "model" as const,
          resource: `/api/scene/library-model/${encodeURIComponent(library.id)}/${encodeURIComponent(entry.id)}`,
        } }),
      };
    })),
  })));
  return { views, models };
}

function observations(session: SceneEditSession, projectFile: string, projectRoot: string): SceneObjectObservation[] {
  return session.current.objects.flatMap((object) => assetDocumentPath(object, projectFile, projectRoot) === undefined ? [] : [{
    object: object.id,
    preview: {
      kind: "model" as const,
      resource: `/api/scene/object-model/${encodeURIComponent(object.id)}?revision=${session.current.revision}`,
    },
  }]);
}

function performancePreviews(
  project: SceneProject,
  view: SceneView,
  lowering: SceneLoweringHost,
): SceneWorkbenchPerformancePreview[] {
  return project.performances.map((performance) => {
    const durationSeconds = Number(BigInt(performance.duration.ticks))
      * performance.duration.timeBase.numerator / performance.duration.timeBase.denominator;
    const framesPerSecond = view.editRate.numerator / view.editRate.denominator;
    const durationFrames = Math.ceil(durationSeconds * framesPerSecond);
    try {
      const program = lowerScenePerformance(project, performance.id, lowering);
      return {
        performance: performance.id,
        editRate: structuredClone(view.editRate),
        durationFrames,
        frames: Array.from({ length: durationFrames }, (_, frame) => {
          const evaluated = evaluateSceneProgramAt(program, {
            ticks: String(frame),
            timeBase: { numerator: view.editRate.denominator, denominator: view.editRate.numerator },
          });
          return {
            objects: evaluated.objects,
            cameras: evaluated.cameras,
            ...(evaluated.activeCamera === undefined ? {} : { activeCamera: evaluated.activeCamera }),
          };
        }),
      };
    } catch (error) {
      return {
        performance: performance.id,
        editRate: structuredClone(view.editRate),
        durationFrames,
        frames: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

function snapshot(
  session: SceneEditSession,
  view: SceneView,
  projectFile: string,
  projectRoot: string,
  viewFile: string,
  viewDirty: boolean,
  libraries: readonly SceneWorkbenchLibrary[],
  lowering: SceneLoweringHost,
): SceneWorkbenchSnapshot {
  const undo = session.cursor > 0 ? session.history[session.cursor - 1] : undefined;
  const redo = session.cursor < session.history.length ? session.history[session.cursor] : undefined;
  return {
    format: "hypit.workbench-scene@1",
    project: session.current,
    view,
    scene: projectSceneWorkbench(session.current, view, observations(session, projectFile, projectRoot)),
    performancePreviews: performancePreviews(session.current, view, lowering),
    libraries,
    projectFile,
    viewFile,
    dirty: isSceneEditSessionDirty(session) || viewDirty,
    canUndo: canUndoSceneEdit(session),
    canRedo: canRedoSceneEdit(session),
    ...(undo === undefined ? {} : { undoLabel: undo.label }),
    ...(redo === undefined ? {} : { redoLabel: redo.label }),
  };
}

function origin(host: string, port: number): string {
  return `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
}

export async function startSceneWorkbenchServer(options: {
  readonly projectFile: string;
  readonly projectRoot?: string;
  readonly viewFile?: string;
  readonly host?: "127.0.0.1" | "::1";
  readonly port?: number;
  readonly authoring?: SceneAuthoringHost;
  readonly lowering?: SceneLoweringHost;
  readonly environment?: WorkbenchEnvironmentHost;
}): Promise<SceneWorkbenchServer> {
  const projectFile = resolve(options.projectFile);
  const projectRoot = resolve(options.projectRoot ?? dirname(projectFile));
  const projectRelative = relative(projectRoot, projectFile);
  if (projectRelative === ".." || projectRelative.startsWith(`..${sep}`) || resolve(projectRelative) === projectRelative) {
    throw new Error("Scene Project must lie within the project root.");
  }
  const defaultView = projectFile.endsWith(".scene.json")
    ? `${projectFile.slice(0, -".scene.json".length)}.scene-view.json`
    : `${projectFile}.view.json`;
  const viewFile = resolve(options.viewFile ?? defaultView);
  const projectPathFromView = relative(dirname(viewFile), projectFile).split(sep).join("/");
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const authoring = options.authoring ?? createSceneAuthoringHost([]);
  const lowering = options.lowering ?? createSceneLoweringHost([]);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) throw new Error("Workbench port is invalid.");

  let session = await readSceneProjectFile(projectFile);
  const libraryDocuments = await Promise.all(session.current.libraries.map(async (reference) => {
    const file = projectReferencePath(projectRoot, projectFile, reference.path, ".scene-library.json");
    if (file === undefined) throw new Error(`Scene Project Library path is invalid: ${reference.path}`);
    return { file, document: parseSceneLibraryDocument(await readFile(file, "utf8")) };
  }));
  const libraries = await openSceneLibraries(libraryDocuments, projectFile, projectRoot);
  let viewExists = true;
  const openedView = await readSceneViewFile(viewFile).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    viewExists = false;
    return createSceneView({
      id: `${session.current.id}-main`,
      name: `${session.current.name} Scene`,
      project: { path: projectPathFromView },
      objects: session.current.objects.map((entry) => entry.id),
    });
  });
  if (resolve(dirname(viewFile), openedView.project.path) !== projectFile) {
    throw new Error(`Scene View ${viewFile} refers to a different Project.`);
  }
  let view = reconcileSceneView(openedView, session.current);
  let viewDirty = !viewExists || view.revision !== openedView.revision;
  let mutation = Promise.resolve();
  const mutate = async (operation: () => Promise<void> | void): Promise<void> => {
    const next = mutation.then(operation, operation);
    mutation = next.then(() => undefined, () => undefined);
    await next;
  };
  let exportSequence = 0;
  let exportStarting = false;
  let exportTask: Promise<void> | undefined;
  let exportController: AbortController | undefined;
  let exportState: SceneWorkbenchExportState = {
    format: "hypit.workbench-scene-export@1", id: 0, state: "idle",
  };

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://workbench.local");
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(302, { location: "/3d" }); response.end(); return;
      }
      if (request.method === "GET" && url.pathname === "/3d") {
        const html = await readFile(new URL("../client/3d.html", import.meta.url));
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' data:; base-uri 'none'; frame-ancestors 'self'",
          "content-type": "text/html; charset=utf-8",
          "x-content-type-options": "nosniff",
        });
        response.end(html); return;
      }
      if (request.method === "GET" && url.pathname === "/api/workbench/environment") {
        json(response, 200, await observeWorkbenchEnvironment(options.environment)); return;
      }
      if (request.method === "POST" && url.pathname === "/api/workbench/environment") {
        json(response, 200, await connectWorkbenchEnvironment(options.environment)); return;
      }
      const asset = clientAssets.get(url.pathname);
      if (request.method === "GET" && asset !== undefined) {
        response.writeHead(200, { "cache-control": "no-cache", "content-type": asset.type, "x-content-type-options": "nosniff" });
        response.end(await readFile(join(clientDirectory, asset.path))); return;
      }
      const three = threeAssets.get(url.pathname);
      if (request.method === "GET" && three !== undefined) {
        const source = await readFile(three.path, "utf8");
        response.writeHead(200, { "cache-control": "public, max-age=3600", "content-type": "text/javascript; charset=utf-8" });
        const rewritten = three.rewrite ? source.replaceAll("from 'three';", "from '/assets/three.module.js';") : source;
        response.end(three.gltf === true
          ? rewritten.replace("from '../utils/BufferGeometryUtils.js';", "from '/assets/BufferGeometryUtils.js';")
          : rewritten);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/scene") {
        json(response, 200, snapshot(session, view, projectFile, projectRoot, viewFile, viewDirty, libraries.views, lowering)); return;
      }
      if (request.method === "GET" && url.pathname === "/api/scene/export") {
        json(response, 200, exportState); return;
      }
      if (request.method === "POST" && url.pathname === "/api/scene/export") {
        if (exportStarting || exportTask !== undefined) throw new Error("A Scene export is already running.");
        exportStarting = true;
        try {
        const input = exportRequest(await requestJson(request));
        if (input.revision !== session.current.revision) {
          const error = new Error(`Scene export revision ${input.revision} does not match ${session.current.revision}.`);
          error.name = "SceneRevisionConflict";
          throw error;
        }
        const range = exportTimeRange(session.current, input);
        const camera = input.view === "follow" ? undefined : input.view.slice("camera:".length);
        if (camera !== undefined && !session.current.cameras.some((entry) => entry.id === camera)) {
          throw new Error(`Unknown Scene Camera: ${camera}`);
        }
        const id = ++exportSequence;
        const controller = new AbortController();
        exportController = controller;
        exportState = {
          format: "hypit.workbench-scene-export@1", id, state: "running", progress: { phase: "open" },
        };
        const mediaDirectory = join(projectRoot, "media");
        const baseId = mediaAssetIdFromFile(input.fileName);
        let assetId = baseId;
        let suffix = 2;
        while (await exists(join(mediaDirectory, assetId))) {
          assetId = `${baseId}-${suffix}`;
          suffix += 1;
        }
        const assetDirectory = join(mediaDirectory, assetId);
        const mediaPath = join(assetDirectory, `${assetId}.mp4`);
        const assetPath = join(assetDirectory, `${assetId}.media.json`);
        const address = server.address();
        if (address === null || typeof address === "string") throw new Error("Scene Workbench is not listening.");
        const query = new URLSearchParams({
          output: "1",
          performance: input.performance,
          start: String(range.start),
          end: String(range.end),
          ...(camera === undefined ? {} : { camera }),
        });
        const recordingUrl = `${origin(host, address.port)}/3d?${query}`;
        exportTask = recordSceneOutput({
          url: recordingUrl,
          destination: mediaPath,
          viewport: input.resolution,
          fps: input.frameRate,
          channel: "chrome",
          signal: controller.signal,
          progress(progress) {
            if (exportState.id !== id || exportState.state !== "running") return;
            if (progress.phase === "complete") return;
            exportState = {
              format: "hypit.workbench-scene-export@1",
              id,
              state: "running",
              progress: progress.phase === "record"
                ? { phase: "record", duration: progress.duration }
                : { phase: progress.phase },
            };
          },
        }).then(async (recording) => {
          controller.signal.throwIfAborted();
          if (exportState.id !== id) return;
          exportState = {
            format: "hypit.workbench-scene-export@1", id, state: "running", progress: { phase: "publish" },
          };
          await importLocalMediaAsset({
            sourcePath: mediaPath,
            assetPath,
            id: assetId,
            mediaType: "video/mp4",
            filePolicy: "link",
            audioStream: false,
          }, { signal: controller.signal });
          exportState = {
            format: "hypit.workbench-scene-export@1",
            id,
            state: "complete",
            output: {
              asset: relative(projectRoot, assetPath).split(sep).join("/"),
              media: relative(projectRoot, mediaPath).split(sep).join("/"),
              width: recording.width,
              height: recording.height,
              duration: recording.duration,
              frameRate: recording.frameRate,
            },
          };
        }).catch(async (error: unknown) => {
          await rm(assetDirectory, { recursive: true, force: true });
          if (exportState.id !== id) return;
          exportState = controller.signal.aborted
            ? { format: "hypit.workbench-scene-export@1", id, state: "cancelled" }
            : {
                format: "hypit.workbench-scene-export@1",
                id,
                state: "failed",
                error: error instanceof Error ? error.message : String(error),
              };
        }).finally(() => {
          if (exportState.id === id) exportController = undefined;
          exportTask = undefined;
        });
        json(response, 202, exportState); return;
        } finally {
          exportStarting = false;
        }
      }
      if (request.method === "DELETE" && url.pathname === "/api/scene/export") {
        if (exportTask !== undefined && exportController !== undefined) {
          exportController.abort(new Error("Scene export was cancelled."));
          exportState = { format: "hypit.workbench-scene-export@1", id: exportState.id, state: "cancelled" };
        }
        json(response, 200, exportState); return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/scene/library-model/")) {
        const parts = url.pathname.slice("/api/scene/library-model/".length).split("/").map(decodeURIComponent);
        if (parts.length !== 2) throw new Error("Scene Library model request is invalid.");
        const model = libraries.models.get(`${parts[0]}\u0000${parts[1]}`);
        if (model === undefined) throw new Error(`Unknown Scene Library model: ${parts.join("/")}`);
        response.writeHead(200, { "cache-control": "no-store", "content-type": model.mediaType, "x-content-type-options": "nosniff" });
        response.end(await readFile(model.path)); return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/scene/object-model/")) {
        const revision = Number(url.searchParams.get("revision"));
        if (!Number.isSafeInteger(revision) || revision !== session.current.revision) throw new Error("Scene model request is stale.");
        const id = decodeURIComponent(url.pathname.slice("/api/scene/object-model/".length));
        const object = session.current.objects.find((entry) => entry.id === id);
        if (object === undefined) throw new Error(`Unknown Scene Object: ${id}`);
        const model = await assetModel(object, projectFile, projectRoot);
        if (model === undefined) throw new Error(`Scene Object ${id} has no supported project-relative Scene Asset model.`);
        const bytes = await readFile(model.path);
        response.writeHead(200, { "cache-control": "no-store", "content-type": model.mediaType, "x-content-type-options": "nosniff" });
        response.end(bytes); return;
      }
      if (request.method === "POST" && url.pathname === "/api/scene/transaction") {
        const input = transactionRequest(await requestJson(request));
        await mutate(() => {
          assertSceneViewAllowsTransaction(view, session.current, input.transaction);
          session = commitSceneEdit(session, input);
          const reconciled = reconcileSceneView(view, session.current);
          viewDirty ||= reconciled.revision !== view.revision;
          view = reconciled;
        });
        json(response, 200, snapshot(session, view, projectFile, projectRoot, viewFile, viewDirty, libraries.views, lowering)); return;
      }
      if (request.method === "POST" && url.pathname === "/api/scene/view-transaction") {
        const input = viewTransactionRequest(await requestJson(request));
        await mutate(() => { view = applySceneViewTransaction(view, session.current, input.transaction); viewDirty = true; });
        json(response, 200, snapshot(session, view, projectFile, projectRoot, viewFile, viewDirty, libraries.views, lowering)); return;
      }
      if (request.method === "POST" && url.pathname === "/api/scene/object-parameter") {
        const input = objectParameterRequest(await requestJson(request));
        await mutate(() => {
          const planned = authoring.planObjectParameterEdit(session.current, input.object, input.operation);
          const transaction = { ...planned, revision: input.revision };
          assertSceneViewAllowsTransaction(view, session.current, transaction);
          session = commitSceneEdit(session, {
            label: `编辑 ${input.object} 参数`,
            transaction,
          });
        });
        json(response, 200, snapshot(session, view, projectFile, projectRoot, viewFile, viewDirty, libraries.views, lowering)); return;
      }
      if (request.method === "POST" && url.pathname === "/api/scene/environment-parameter") {
        const input = environmentParameterRequest(await requestJson(request));
        await mutate(() => {
          const planned = authoring.planEnvironmentParameterEdit(session.current, input.operation);
          session = commitSceneEdit(session, {
            label: "编辑环境参数",
            transaction: { ...planned, revision: input.revision },
          });
        });
        json(response, 200, snapshot(session, view, projectFile, projectRoot, viewFile, viewDirty, libraries.views, lowering)); return;
      }
      if (request.method === "POST" && url.pathname === "/api/scene/behavior-parameter") {
        const input = behaviorParameterRequest(await requestJson(request));
        await mutate(() => {
          const planned = authoring.planBehaviorParameterEdit(
            session.current, input.performance, input.track, input.item, input.operation,
          );
          const transaction = { ...planned, revision: input.revision };
          assertSceneViewAllowsTransaction(view, session.current, transaction);
          session = commitSceneEdit(session, {
            label: `编辑 ${input.item} 参数`,
            transaction,
          });
        });
        json(response, 200, snapshot(session, view, projectFile, projectRoot, viewFile, viewDirty, libraries.views, lowering)); return;
      }
      if (request.method === "POST" && url.pathname === "/api/scene/undo") {
        await mutate(() => { session = undoSceneEdit(session); view = reconcileSceneView(view, session.current); });
        json(response, 200, snapshot(session, view, projectFile, projectRoot, viewFile, viewDirty, libraries.views, lowering)); return;
      }
      if (request.method === "POST" && url.pathname === "/api/scene/redo") {
        await mutate(() => { session = redoSceneEdit(session); view = reconcileSceneView(view, session.current); });
        json(response, 200, snapshot(session, view, projectFile, projectRoot, viewFile, viewDirty, libraries.views, lowering)); return;
      }
      if (request.method === "POST" && url.pathname === "/api/scene/save") {
        await mutate(async () => {
          const ticket = prepareSceneProjectSave(session);
          await writeSceneProjectFile(projectFile, ticket);
          await writeSceneViewFile(viewFile, view);
          session = completeSceneProjectSave(session, ticket);
          viewDirty = false;
        });
        json(response, 200, snapshot(session, view, projectFile, projectRoot, viewFile, viewDirty, libraries.views, lowering)); return;
      }
      json(response, 404, errorView(new Error(`Unknown Workbench route: ${url.pathname}`)));
    } catch (error) {
      const conflict = error instanceof Error
        && (error.name === "SceneRevisionConflict" || error.name === "SceneViewRevisionConflict");
      json(response, conflict ? 409 : 400, errorView(error));
    }
  });

  await new Promise<void>((fulfill, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => { server.removeListener("error", reject); fulfill(); });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Workbench server did not bind a TCP address.");
  const base = origin(host, address.port);
  return {
    origin: base,
    sceneUrl: `${base}/3d`,
    projectFile,
    viewFile,
    async close() {
      exportController?.abort(new Error("Scene Workbench closed during export."));
      await exportTask?.catch(() => undefined);
      await new Promise<void>((fulfill, reject) => server.close((error) => error === undefined ? fulfill() : reject(error)));
    },
  };
}
