import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import type { Facet } from "@hypit/facet";
import {
  projectFeedbackView,
  readFeedbackAttachment,
  readFeedbackMutation,
  type FeedbackAttachment,
  type FeedbackAttachmentUpload,
  type FeedbackMutation,
} from "@hypit/feedback";
import { createFeedbackStore, FeedbackConflict } from "@hypit/feedback/node";
import {
  type NlePictureLayout,
  type NleAuthoringHost,
} from "@hypit/nle";
import {
  exportPreparedNleProgramme,
  reviewPreparedNleProgramme,
  type LocalNleExportProgress,
  type LocalNleExportRequest,
  type LocalNleExportResult,
  type LocalNleReviewRequest,
  type LocalNleReviewResult,
} from "@hypit/nle-local";
import {
  type NleTimelinePresentationHost,
  type NleTimelinePresentationResource,
  type NleInspectorPresentationHost,
} from "@hypit/nle-view";
import { isResourceId } from "@hypit/protocol";
import {
  createNodeProjectMediaService,
  type NodeProjectMediaService,
} from "@hypit/media-service/node";
import { projectMember } from "@hypit/project/node";
import { openNleService, type NleProgrammeResource } from "@hypit/nle-service/node";

import type {
  NleWorkbenchComponentMediaInputEditRequest,
  NleWorkbenchParameterEditRequest,
  NleWorkbenchMediaPlacementRequest,
  NleWorkbenchSaveRequest,
  NleWorkbenchExportRequest,
  NleWorkbenchExportProgress,
  NleWorkbenchReviewRequest,
  NleWorkbenchSpatialEditRequest,
  NleWorkbenchSpatialCommandRequest,
  NleWorkbenchTransactionRequest,
  NleWorkbenchViewTransactionRequest,
  WorkbenchErrorView,
} from "../protocol.js";
import {
  connectWorkbenchEnvironment,
  observeWorkbenchEnvironment,
  type WorkbenchEnvironmentHost,
} from "./environment.js";

const clientDirectory = fileURLToPath(new URL("../client/", import.meta.url));

const clientAssets = new Map([
  ["/assets/app.js", { path: "app.js", type: "text/javascript; charset=utf-8" }],
  ["/assets/style.css", { path: "style.css", type: "text/css; charset=utf-8" }],
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
]);

export type WorkbenchServer = {
  readonly origin: string;
  readonly nleUrl: string;
  readonly commentsUrl: string;
  readonly projectFile: string;
  readonly viewFile: string;
  readonly feedbackFile: string;
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
  const revision = source as Error & {
    readonly expected?: unknown;
    readonly actual?: unknown;
    readonly owner?: unknown;
  };
  const owner = source.name === "NleRevisionConflict" ? "project" as const
    : source.name === "NleTimelineViewRevisionConflict" ? "view" as const
      : source.name === "FeedbackConflict" ? "feedback" as const
        : source.name === "NleExternalFileConflict"
          && (revision.owner === "project" || revision.owner === "view") ? revision.owner : undefined;
  return {
    format: "hypit.workbench-error@1",
    error: {
      name: source.name,
      message: source.message,
      ...(owner === undefined ? {} : { owner }),
      ...(typeof revision.expected === "number" ? { expectedRevision: revision.expected } : {}),
      ...(typeof revision.actual === "number" ? { actualRevision: revision.actual } : {}),
      ...(owner === "project" || owner === "view" ? { observe: "/api/nle" }
        : owner === "feedback" ? { observe: "/api/nle/feedback" } : {}),
    },
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function programmeErrorPage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const encoded = JSON.stringify(message).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{width:100%;height:100%;margin:0;background:#101114;color:#a8abb2;font:12px system-ui,sans-serif}
body{display:grid;place-items:center;text-align:center}main{max-width:70%;line-height:1.6}strong{display:block;margin-bottom:6px;color:#f0f1f3}
</style></head><body><main><strong>预览暂时不可用</strong><span>${escapeHtml(message)}</span></main><script>
window.parent.postMessage({type:'hypit.html-document.error@1',message:${encoded}},location.origin);
</script></body></html>`;
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

async function serveProgrammeResource(
  request: IncomingMessage,
  response: ServerResponse,
  resource: NleProgrammeResource,
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
  if (request.method === "HEAD" || length === 0) {
    response.end();
    return;
  }
  await pipeline(createReadStream(resource.file, { start, end }), response);
}

async function serveTimelinePresentationResource(
  request: IncomingMessage,
  response: ServerResponse,
  resource: NleTimelinePresentationResource,
): Promise<void> {
  const bytes = await resource.read();
  response.writeHead(200, {
    // Presentation resources are process-local projections. Their stable identity is useful while
    // one Host is alive, but does not identify bytes across a Workbench restart or package edit.
    "cache-control": "no-store",
    "content-length": String(bytes.byteLength),
    "content-type": resource.mediaType,
    "x-content-type-options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : bytes);
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

const feedbackImageTypes: ReadonlyMap<string, string> = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/avif", ".avif"],
] as const);
const feedbackAttachmentLimit = 12 * 1024 * 1024;

function feedbackUploadName(value: string | null): string {
  if (value === null || value.trim().length === 0 || value !== basename(value) || value.includes("\\")) {
    throw new Error("Feedback image needs a plain file name.");
  }
  return value.slice(0, 240);
}

function feedbackMutationRequest(
  value: unknown,
  staged: ReadonlyMap<string, { readonly file: string; readonly attachment: FeedbackAttachment }>,
): { readonly mutation: FeedbackMutation; readonly uploads: readonly FeedbackAttachmentUpload[]; readonly tokens: readonly string[] } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Feedback request must be an object.");
  }
  const record = value as Record<string, unknown>;
  const unexpected = Object.keys(record).find((key) => key !== "mutation" && key !== "uploads");
  if (unexpected !== undefined) throw new Error(`Feedback request has unsupported field ${unexpected}.`);
  const mutation = readFeedbackMutation(record.mutation);
  if (!Array.isArray(record.uploads)) throw new Error("Feedback request uploads must be an array.");
  const seen = new Set<string>();
  const tokens: string[] = [];
  const uploads = record.uploads.map((entry, index): FeedbackAttachmentUpload => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`Feedback upload ${index} must be an object.`);
    }
    const item = entry as Record<string, unknown>;
    if (Object.keys(item).some((key) => key !== "token" && key !== "attachment")) {
      throw new Error(`Feedback upload ${index} has unsupported fields.`);
    }
    if (typeof item.token !== "string" || seen.has(item.token)) {
      throw new Error(`Feedback upload ${index} has an invalid or repeated token.`);
    }
    const pending = staged.get(item.token);
    if (pending === undefined) throw new Error(`Feedback upload ${index} is no longer staged.`);
    const attachment = readFeedbackAttachment(item.attachment, `Feedback upload ${index} attachment`);
    if (JSON.stringify(attachment) !== JSON.stringify(pending.attachment)) {
      throw new Error(`Feedback upload ${index} differs from the staged image.`);
    }
    seen.add(item.token);
    tokens.push(item.token);
    return { attachment, stagedFile: pending.file };
  });
  return { mutation, uploads, tokens };
}

function transactionRequest(value: unknown): NleWorkbenchTransactionRequest {
  if (typeof value !== "object" || value === null) throw new Error("NLE transaction request must be an object.");
  const candidate = value as Partial<NleWorkbenchTransactionRequest>;
  if (typeof candidate.label !== "string" || candidate.label.trim().length === 0) {
    throw new Error("NLE transaction label is required.");
  }
  if (typeof candidate.transaction !== "object" || candidate.transaction === null) {
    throw new Error("NLE transaction is required.");
  }
  return candidate as NleWorkbenchTransactionRequest;
}

function saveRequest(value: unknown): NleWorkbenchSaveRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("NLE save request must be an object.");
  }
  const candidate = value as Partial<NleWorkbenchSaveRequest>;
  if (Object.keys(candidate).some((key) => key !== "projectRevision" && key !== "viewRevision")
    || !Number.isSafeInteger(candidate.projectRevision) || (candidate.projectRevision ?? -1) < 0
    || !Number.isSafeInteger(candidate.viewRevision) || (candidate.viewRevision ?? -1) < 0) {
    throw new Error("NLE save request revisions are invalid.");
  }
  return candidate as NleWorkbenchSaveRequest;
}

function exportRequest(value: unknown): NleWorkbenchExportRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("NLE export request must be an object.");
  }
  const candidate = value as Partial<NleWorkbenchExportRequest>;
  if (!Number.isSafeInteger(candidate.revision) || (candidate.revision ?? -1) < 0) {
    throw new Error("NLE export revision must be a non-negative safe integer.");
  }
  if (typeof candidate.fileName !== "string" || candidate.fileName.length === 0
    || candidate.fileName.length > 192 || !candidate.fileName.toLowerCase().endsWith(".mp4")
    || candidate.fileName.includes("/") || candidate.fileName.includes("\\")
    || candidate.fileName === ".mp4") {
    throw new Error("NLE export file name must be one local .mp4 file name.");
  }
  if (candidate.quality !== "draft" && candidate.quality !== "standard" && candidate.quality !== "high") {
    throw new Error("NLE export quality must be draft, standard or high.");
  }
  if (candidate.pictureTarget !== "html" && candidate.pictureTarget !== "gpu-composition") {
    throw new Error("NLE export Picture target must be html or gpu-composition.");
  }
  const rate = candidate.frameRate;
  if (rate === undefined || !Number.isSafeInteger(rate.numerator) || rate.numerator <= 0
    || !Number.isSafeInteger(rate.denominator) || rate.denominator <= 0) {
    throw new Error("NLE export frame rate must contain positive safe integers.");
  }
  const resolution = candidate.resolution;
  if (resolution === undefined || !Number.isSafeInteger(resolution.width) || resolution.width <= 0
    || !Number.isSafeInteger(resolution.height) || resolution.height <= 0) {
    throw new Error("NLE export resolution must contain positive safe integers.");
  }
  return candidate as NleWorkbenchExportRequest;
}

function reviewRequest(value: unknown): NleWorkbenchReviewRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("NLE review request must be an object.");
  }
  const candidate = value as Partial<NleWorkbenchReviewRequest>;
  if (!Number.isSafeInteger(candidate.revision) || (candidate.revision ?? -1) < 0) {
    throw new Error("NLE review revision must be a non-negative safe integer.");
  }
  if (typeof candidate.directoryName !== "string" || candidate.directoryName.length === 0
    || candidate.directoryName.length > 192 || candidate.directoryName.includes("/")
    || candidate.directoryName.includes("\\") || candidate.directoryName === "."
    || candidate.directoryName === "..") {
    throw new Error("NLE review directoryName must be one local directory name.");
  }
  const range = candidate.range;
  if (range === undefined || !Number.isSafeInteger(range.startFrame) || range.startFrame < 0
    || !Number.isSafeInteger(range.endFrameExclusive)
    || range.endFrameExclusive <= range.startFrame) {
    throw new Error("NLE review range must satisfy 0 <= startFrame < endFrameExclusive.");
  }
  if (!Array.isArray(candidate.frames) || candidate.frames.length === 0
    || !candidate.frames.every((frame, index) => Number.isSafeInteger(frame)
      && frame >= range.startFrame && frame < range.endFrameExclusive
      && (index === 0 || frame > candidate.frames![index - 1]!))) {
    throw new Error("NLE review frames must be strictly increasing integers inside range.");
  }
  if (candidate.quality !== "draft" && candidate.quality !== "standard" && candidate.quality !== "high") {
    throw new Error("NLE review quality must be draft, standard or high.");
  }
  if (candidate.pictureTarget !== "html" && candidate.pictureTarget !== "gpu-composition") {
    throw new Error("NLE review Picture target must be html or gpu-composition.");
  }
  const rate = candidate.frameRate;
  if (rate === undefined || !Number.isSafeInteger(rate.numerator) || rate.numerator <= 0
    || !Number.isSafeInteger(rate.denominator) || rate.denominator <= 0) {
    throw new Error("NLE review frame rate must contain positive safe integers.");
  }
  const resolution = candidate.resolution;
  if (resolution === undefined || !Number.isSafeInteger(resolution.width) || resolution.width <= 0
    || !Number.isSafeInteger(resolution.height) || resolution.height <= 0) {
    throw new Error("NLE review resolution must contain positive safe integers.");
  }
  return candidate as NleWorkbenchReviewRequest;
}

function workbenchExportProgress(progress: LocalNleExportProgress): NleWorkbenchExportProgress | undefined {
  if (progress.phase === "complete") return undefined;
  if (progress.phase === "picture") {
    return {
      phase: "picture",
      state: progress.state,
      ...(progress.detail?.phase === "complete" ? { frames: progress.detail.frames } : {}),
    };
  }
  return structuredClone(progress);
}

function viewTransactionRequest(value: unknown): NleWorkbenchViewTransactionRequest {
  if (typeof value !== "object" || value === null) throw new Error("NLE View transaction request must be an object.");
  const candidate = value as Partial<NleWorkbenchViewTransactionRequest>;
  if (typeof candidate.transaction !== "object" || candidate.transaction === null) {
    throw new Error("NLE View transaction is required.");
  }
  return candidate as NleWorkbenchViewTransactionRequest;
}

function parameterEditRequest(value: unknown): NleWorkbenchParameterEditRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("NLE parameter edit request must be an object.");
  }
  const candidate = value as Partial<NleWorkbenchParameterEditRequest>;
  if (!Number.isSafeInteger(candidate.revision) || typeof candidate.item !== "string" || candidate.item.length === 0
    || typeof candidate.section !== "string" || candidate.section.length === 0
    || typeof candidate.field !== "string" || candidate.field.length === 0
    || !["string", "number", "boolean"].includes(typeof candidate.value)
    || typeof candidate.value === "number" && !Number.isFinite(candidate.value)) {
    throw new Error("NLE parameter edit request is invalid.");
  }
  return candidate as NleWorkbenchParameterEditRequest;
}

function componentMediaInputEditRequest(value: unknown): NleWorkbenchComponentMediaInputEditRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("NLE Component Media input edit request must be an object.");
  }
  const candidate = value as Partial<NleWorkbenchComponentMediaInputEditRequest>;
  if (!Number.isSafeInteger(candidate.revision)
    || typeof candidate.item !== "string" || candidate.item.length === 0
    || typeof candidate.input !== "string" || candidate.input.length === 0
    || !(candidate.media === null || typeof candidate.media === "string" && candidate.media.length > 0)) {
    throw new Error("NLE Component Media input edit request is invalid.");
  }
  return candidate as NleWorkbenchComponentMediaInputEditRequest;
}

function spatialEditRequest(value: unknown): NleWorkbenchSpatialEditRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("NLE spatial edit request must be an object.");
  }
  const candidate = value as Partial<NleWorkbenchSpatialEditRequest>;
  const layout = candidate.layout as Partial<NlePictureLayout> | undefined;
  if (!Number.isSafeInteger(candidate.revision) || typeof candidate.item !== "string" || candidate.item.length === 0
    || layout === undefined || typeof layout !== "object" || Array.isArray(layout)
    || ![layout.x, layout.y, layout.width, layout.height].every((coordinate) =>
      typeof coordinate === "number" && Number.isFinite(coordinate))
    || ![layout.contentX, layout.contentY].every((coordinate) => coordinate === undefined
      || typeof coordinate === "number" && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)
    || !["fill", "contain", "cover"].includes(String(layout.fit))) {
    throw new Error("NLE spatial edit request is invalid.");
  }
  return candidate as NleWorkbenchSpatialEditRequest;
}

function spatialCommandRequest(value: unknown): NleWorkbenchSpatialCommandRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("NLE spatial command request must be an object.");
  }
  const candidate = value as Partial<NleWorkbenchSpatialCommandRequest>;
  if (!Number.isSafeInteger(candidate.revision)
    || typeof candidate.item !== "string" || candidate.item.length === 0
    || typeof candidate.edit !== "object" || candidate.edit === null || Array.isArray(candidate.edit)) {
    throw new Error("NLE spatial command request is invalid.");
  }
  const kind = (candidate.edit as { readonly kind?: unknown }).kind;
  if (!["layout.replace", "frame.translate", "frame.resize", "fit.set", "focus.set",
    "layout.share", "layout.link", "layout.unlink"].includes(String(kind))) {
    throw new Error("NLE spatial command kind is invalid.");
  }
  return candidate as NleWorkbenchSpatialCommandRequest;
}

function mediaPlacementRequest(value: unknown): NleWorkbenchMediaPlacementRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("NLE Media placement request must be an object.");
  }
  const candidate = value as Partial<NleWorkbenchMediaPlacementRequest>;
  if (!Number.isSafeInteger(candidate.revision)
    || typeof candidate.media !== "string" || candidate.media.length === 0
    || typeof candidate.track !== "string" || candidate.track.length === 0
    || typeof candidate.at !== "object" || candidate.at === null
    || candidate.duration !== undefined && (typeof candidate.duration !== "object" || candidate.duration === null)) {
    throw new Error("NLE Media placement request is invalid.");
  }
  return candidate as NleWorkbenchMediaPlacementRequest;
}

function loopbackOrigin(host: string, port: number): string {
  return `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
}

/**
 * Opens one NLE document and serves its independent browser work surface.
 * The selected file is process-local state; no port or URL enters the Project.
 */
export async function startWorkbenchServer(options: {
  readonly projectRoot: string;
  readonly projectFile: string;
  readonly viewFile?: string;
  readonly host?: "127.0.0.1" | "::1";
  readonly port?: number;
  readonly presentations?: NleTimelinePresentationHost;
  readonly inspectors?: NleInspectorPresentationHost;
  readonly authoring?: NleAuthoringHost;
  readonly facets?: readonly Facet[];
  readonly distributionPackageRoot?: string;
  readonly environment?: WorkbenchEnvironmentHost;
  /** Project Host-owned service. Omit only when this surface owns its isolated session. */
  readonly media?: NodeProjectMediaService;
  /** Embedding/test seam; normal Workbench Hosts use the local MP4 exporter. */
  readonly exportProject?: (request: LocalNleExportRequest) => Promise<LocalNleExportResult>;
  /** Embedding/test seam; normal Workbench Hosts use the local focused-review executor. */
  readonly reviewProject?: (request: LocalNleReviewRequest) => Promise<LocalNleReviewResult>;
}): Promise<WorkbenchServer> {
  const projectRoot = resolve(options.projectRoot);
  const mediaService = options.media ?? createNodeProjectMediaService(projectRoot);
  const ownsMediaService = options.media === undefined;
  const runExport = options.exportProject;
  const runReview = options.reviewProject;
  const nle = await openNleService({
    projectRoot,
    projectFile: options.projectFile,
    ...(options.viewFile === undefined ? {} : { viewFile: options.viewFile }),
    media: mediaService,
    ...(options.presentations === undefined ? {} : { presentations: options.presentations }),
    ...(options.inspectors === undefined ? {} : { inspectors: options.inspectors }),
    ...(options.authoring === undefined ? {} : { authoring: options.authoring }),
    facets: options.facets ?? [],
    autosave: { delayMs: 650 },
    export: async (execution) => await (runExport === undefined
      ? exportPreparedNleProgramme(await execution.prepareProgramme(), {
          outputFile: execution.outputFile,
          quality: execution.quality,
          pictureTarget: execution.pictureTarget,
          frameRate: execution.frameRate,
          resolution: execution.resolution,
          signal: execution.signal,
          onProgress(progress) {
            const projected = workbenchExportProgress(progress);
            if (projected !== undefined) execution.onProgress(projected);
          },
        })
      : runExport({
          projectRoot: execution.projectRoot,
          projectFile: execution.projectFile,
          project: execution.project,
          outputFile: execution.outputFile,
          packageRoot: execution.projectRoot,
          ...(options.distributionPackageRoot === undefined
            ? {} : { distributionPackageRoot: options.distributionPackageRoot }),
          quality: execution.quality,
          pictureTarget: execution.pictureTarget,
          frameRate: execution.frameRate,
          resolution: execution.resolution,
          signal: execution.signal,
          onProgress(progress) {
            const projected = workbenchExportProgress(progress);
            if (projected !== undefined) execution.onProgress(projected);
          },
        })),
    review: async (execution) => await (runReview === undefined
      ? reviewPreparedNleProgramme(await execution.prepareProgramme(), {
          toDirectory: execution.toDirectory,
          range: execution.range,
          frames: execution.frames,
          quality: execution.quality,
          pictureTarget: execution.pictureTarget,
          frameRate: execution.frameRate,
          resolution: execution.resolution,
          signal: execution.signal,
          onProgress(progress) {
            const projected = workbenchExportProgress(progress);
            if (projected !== undefined) execution.onProgress(projected);
          },
        })
      : runReview({
          projectRoot: execution.projectRoot,
          projectFile: execution.projectFile,
          project: execution.project,
          toDirectory: execution.toDirectory,
          packageRoot: execution.projectRoot,
          ...(options.distributionPackageRoot === undefined
            ? {} : { distributionPackageRoot: options.distributionPackageRoot }),
          range: execution.range,
          frames: execution.frames,
          quality: execution.quality,
          pictureTarget: execution.pictureTarget,
          frameRate: execution.frameRate,
          resolution: execution.resolution,
          signal: execution.signal,
          onProgress(progress) {
            const projected = workbenchExportProgress(progress);
            if (projected !== undefined) execution.onProgress(projected);
          },
        })),
    resources: {
      media: (id, generation) =>
        `/api/nle/media-resource/${encodeURIComponent(id)}?generation=${generation}`,
      presentation: (id, revision) =>
        `/api/nle/presentation-resource/${encodeURIComponent(id)}?revision=${revision}`,
      programme: (id, generation) =>
        `/api/nle/programme-resource/${encodeURIComponent(id)}?generation=${generation}`,
      itemPreview: (item, generation, kind) =>
        `/api/nle/item-preview/${encodeURIComponent(item)}?generation=${generation}&kind=${kind}`,
    },
  });
  const projectFile = nle.projectFile;
  const viewFile = nle.viewFile;
  const feedbackContext = relative(projectRoot, projectFile).split(sep).join("/");
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Workbench port must be an integer from 0 through 65535.");
  }
  const feedback = createFeedbackStore(projectRoot);
  const feedbackUploadDirectory = await mkdtemp(join(tmpdir(), "hypit-feedback-upload-"));
  const stagedFeedbackUploads = new Map<string, {
    readonly file: string;
    readonly attachment: FeedbackAttachment;
  }>();
  const eventResponses = new Set<ServerResponse>();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://workbench.local");
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(302, { location: "/nle" });
        response.end();
        return;
      }
      if (request.method === "GET" && ["/nle", "/comments"].includes(url.pathname)) {
        const html = await readFile(new URL("../client/index.html", import.meta.url));
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'",
          "content-type": "text/html; charset=utf-8",
          "x-content-type-options": "nosniff",
        });
        response.end(html);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/workbench/environment") {
        json(response, 200, await observeWorkbenchEnvironment(options.environment));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workbench/environment") {
        json(response, 200, await connectWorkbenchEnvironment(options.environment));
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
      const threeAsset = threeAssets.get(url.pathname);
      if (request.method === "GET" && threeAsset !== undefined) {
        const source = await readFile(threeAsset.path, "utf8");
        response.writeHead(200, {
          "cache-control": "public, max-age=3600",
          "content-type": "text/javascript; charset=utf-8",
          "x-content-type-options": "nosniff",
        });
        response.end(threeAsset.rewrite ? source.replace("from 'three';", "from '/assets/three.module.js';") : source);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/nle") {
        json(response, 200, (await nle.observe({ kind: "snapshot" })).value);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/nle/timeline") {
        json(response, 200, (await nle.observe({ kind: "timeline" })).value);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/nle/canvas") {
        json(response, 200, (await nle.observe({ kind: "canvas" })).value);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/nle/spatial-authoring") {
        json(response, 200, (await nle.observe({ kind: "spatial-authoring" })).value);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/nle/events") {
        response.writeHead(200, {
          "cache-control": "no-cache, no-store",
          connection: "keep-alive",
          "content-type": "text/event-stream; charset=utf-8",
          "x-accel-buffering": "no",
          "x-content-type-options": "nosniff",
        });
        eventResponses.add(response);
        let blocked = false;
        let pending: ReturnType<typeof nle.applicationState> | undefined;
        const send = (state: ReturnType<typeof nle.applicationState>) => {
          if (blocked) {
            pending = state;
            return;
          }
          blocked = !response.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
          if (blocked) response.once("drain", () => {
            blocked = false;
            const next = pending;
            pending = undefined;
            if (next !== undefined) send(next);
          });
        };
        const unsubscribe = nle.subscribe((state) => {
          send(state);
        });
        response.once("close", () => {
          eventResponses.delete(response);
          unsubscribe();
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/nle/file-status") {
        json(response, 200, (await nle.observe({ kind: "file-status" })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/reload") {
        json(response, 200, (await nle.command({ kind: "document.reload" })).value);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/nle/feedback") {
        json(response, 200, projectFeedbackView(await feedback.read(), feedbackContext));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/nle/feedback/attachment") {
        const id = url.searchParams.get("id");
        if (id === null) throw new Error("Feedback attachment id is required.");
        const document = await feedback.read();
        const attachment = document.comments
          .filter((comment) => comment.context === feedbackContext)
          .flatMap((comment) => comment.attachments)
          .find((candidate) => candidate.id === id);
        if (attachment === undefined) throw new Error(`Feedback attachment ${id} does not exist in this context.`);
        if (!feedbackImageTypes.has(attachment.mediaType)) {
          throw new Error(`Feedback attachment ${id} is not a supported image.`);
        }
        const file = projectMember(projectRoot, resolve(dirname(feedback.path), attachment.path), "Feedback attachment");
        const bytes = await readFile(file);
        response.writeHead(200, {
          "cache-control": "no-cache",
          "content-length": String(bytes.byteLength),
          "content-type": attachment.mediaType,
          "x-content-type-options": "nosniff",
        });
        response.end(bytes);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/feedback/upload") {
        if (stagedFeedbackUploads.size >= 32) {
          throw new Error("Too many Feedback images are waiting to be submitted.");
        }
        const name = feedbackUploadName(url.searchParams.get("name"));
        const mediaType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
        if (mediaType === undefined) throw new Error("Feedback image content type is required.");
        const extension = feedbackImageTypes.get(mediaType);
        if (extension === undefined) throw new Error("Comments accept PNG, JPEG, WebP, GIF or AVIF images.");
        const declaredLength = Number(request.headers["content-length"]);
        if (Number.isFinite(declaredLength) && declaredLength > feedbackAttachmentLimit) {
          throw new Error("A Feedback image may not exceed 12 MiB.");
        }
        const token = randomUUID();
        const id = `a-${randomUUID()}`;
        const file = join(feedbackUploadDirectory, token);
        let length = 0;
        const limit = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            length += chunk.byteLength;
            callback(length > feedbackAttachmentLimit
              ? new Error("A Feedback image may not exceed 12 MiB.")
              : undefined, chunk);
          },
        });
        try {
          await pipeline(request, limit, createWriteStream(file, { flags: "wx" }));
          if (length === 0) throw new Error("Feedback image is empty.");
        } catch (error) {
          await rm(file, { force: true });
          throw error;
        }
        const attachment: FeedbackAttachment = {
          id,
          path: `attachments/${id}${extension}`,
          mediaType,
          name,
        };
        stagedFeedbackUploads.set(token, { file, attachment });
        json(response, 200, { format: "hypit.feedback-upload@1", token, attachment });
        return;
      }
      if (request.method === "DELETE" && url.pathname === "/api/nle/feedback/upload") {
        const token = url.searchParams.get("token");
        if (token === null) throw new Error("Feedback upload token is required.");
        const staged = stagedFeedbackUploads.get(token);
        stagedFeedbackUploads.delete(token);
        if (staged !== undefined) await rm(staged.file, { force: true });
        response.writeHead(204, { "cache-control": "no-store" });
        response.end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/feedback") {
        const input = feedbackMutationRequest(await requestJson(request), stagedFeedbackUploads);
        const comment = input.mutation.type === "delete" ? input.mutation.before : input.mutation.comment;
        if (comment.context !== feedbackContext) {
          throw new Error(`Feedback comment belongs to ${comment.context}, not ${feedbackContext}.`);
        }
        try {
          const document = await feedback.mutate(input.mutation, input.uploads);
          json(response, 200, projectFeedbackView(document, feedbackContext));
        } finally {
          await Promise.all(input.tokens.map(async (token) => {
            const staged = stagedFeedbackUploads.get(token);
            stagedFeedbackUploads.delete(token);
            if (staged !== undefined) await rm(staged.file, { force: true });
          }));
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/nle/export") {
        json(response, 200, (await nle.observe({ kind: "export-state" })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/export") {
        const input = exportRequest(await requestJson(request));
        json(response, 202, (await nle.action({ kind: "export.start", input })).value);
        return;
      }
      if (request.method === "DELETE" && url.pathname === "/api/nle/export") {
        json(response, 200, (await nle.action({ kind: "export.cancel" })).value);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/nle/review") {
        json(response, 200, (await nle.observe({ kind: "review-state" })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/review") {
        const input = reviewRequest(await requestJson(request));
        json(response, 202, (await nle.action({ kind: "review.start", input })).value);
        return;
      }
      if (request.method === "DELETE" && url.pathname === "/api/nle/review") {
        json(response, 200, (await nle.action({ kind: "review.cancel" })).value);
        return;
      }
      if ((request.method === "GET" || request.method === "HEAD")
        && url.pathname.startsWith("/api/nle/media-resource/")) {
        const requestedGeneration = Number(url.searchParams.get("generation"));
        if (!Number.isSafeInteger(requestedGeneration) || requestedGeneration < 1
          || nle.mediaGeneration === undefined || requestedGeneration > nle.mediaGeneration) {
          throw new Error("NLE Media Library projection generation is invalid.");
        }
        const id = decodeURIComponent(url.pathname.slice("/api/nle/media-resource/".length));
        const resource = nle.mediaResource(id);
        if (resource === undefined) throw new Error(`NLE Media ${id} is unavailable.`);
        await serveProgrammeResource(request, response, resource);
        return;
      }
      if ((request.method === "GET" || request.method === "HEAD")
        && url.pathname.startsWith("/api/nle/presentation-resource/")) {
        const requestedRevision = Number(url.searchParams.get("revision"));
        if (!Number.isSafeInteger(requestedRevision) || requestedRevision !== nle.project.revision) {
          throw new Error("NLE Timeline presentation projection is stale.");
        }
        const id = decodeURIComponent(url.pathname.slice("/api/nle/presentation-resource/".length));
        const resource = nle.presentationResource(id);
        if (resource === undefined) throw new Error(`NLE Timeline presentation resource ${id} is unavailable.`);
        await serveTimelinePresentationResource(request, response, resource);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/nle/programme") {
        const requestedGeneration = Number(url.searchParams.get("generation"));
        if (!Number.isSafeInteger(requestedGeneration) || requestedGeneration !== nle.programmeGeneration) {
          throw new Error("NLE Programme preview generation is stale.");
        }
        try {
          const rendered = await nle.programmeDocument(requestedGeneration);
          response.writeHead(200, {
            "cache-control": "no-store",
            "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'",
            "content-type": "text/html; charset=utf-8",
            "x-content-type-options": "nosniff",
            "x-hypit-frame-count": String(rendered.frameCount),
          });
          response.end(rendered.html);
        } catch (error) {
          response.writeHead(422, {
            "cache-control": "no-store",
            "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
            "content-type": "text/html; charset=utf-8",
            "x-content-type-options": "nosniff",
          });
          response.end(programmeErrorPage(error));
        }
        return;
      }
      if ((request.method === "GET" || request.method === "HEAD")
        && url.pathname.startsWith("/api/nle/programme-resource/")) {
        const requestedGeneration = Number(url.searchParams.get("generation"));
        if (!Number.isSafeInteger(requestedGeneration) || requestedGeneration < 0
          || requestedGeneration > nle.programmeGeneration) {
          throw new Error(`NLE Programme resource generation ${url.searchParams.get("generation") ?? "<missing>"} is invalid.`);
        }
        const id = decodeURIComponent(url.pathname.slice("/api/nle/programme-resource/".length));
        if (!isResourceId(id)) throw new Error("NLE Programme resource id is invalid.");
        const resource = nle.programmeResource(id);
        if (resource === undefined) throw new Error(`NLE Programme resource ${id} is unavailable.`);
        await serveProgrammeResource(request, response, resource);
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/nle/item-inspector/")) {
        const requestedRevision = Number(url.searchParams.get("revision"));
        if (!Number.isSafeInteger(requestedRevision) || requestedRevision !== nle.project.revision) {
          throw new Error(`NLE Item inspector revision ${url.searchParams.get("revision") ?? "<missing>"} is stale.`);
        }
        const item = decodeURIComponent(url.pathname.slice("/api/nle/item-inspector/".length));
        json(response, 200, (await nle.observe({ kind: "inspector", item })).value);
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/nle/component-media-inputs/")) {
        const requestedRevision = Number(url.searchParams.get("revision"));
        if (!Number.isSafeInteger(requestedRevision) || requestedRevision !== nle.project.revision) {
          throw new Error(`NLE Component Media input revision ${url.searchParams.get("revision") ?? "<missing>"} is stale.`);
        }
        const item = decodeURIComponent(url.pathname.slice("/api/nle/component-media-inputs/".length));
        json(response, 200, (await nle.observe({ kind: "component-media-inputs", item })).value);
        return;
      }
      if ((request.method === "GET" || request.method === "HEAD")
        && url.pathname.startsWith("/api/nle/item-preview/")) {
        const item = decodeURIComponent(url.pathname.slice("/api/nle/item-preview/".length));
        const requestedGeneration = Number(url.searchParams.get("generation"));
        if (!Number.isSafeInteger(requestedGeneration) || requestedGeneration !== nle.previewGeneration(item)) {
          throw new Error(`NLE Item ${item} preview generation ${url.searchParams.get("generation") ?? "<missing>"} is stale.`);
        }
        const kind = url.searchParams.get("kind");
        if (kind !== "image" && kind !== "storyboard" && kind !== "waveform") {
          throw new Error(`NLE Item preview kind ${kind ?? "<missing>"} is invalid.`);
        }
        const preview = await nle.itemPreview(item, kind, requestedGeneration);
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-type": preview.mediaType,
          "content-length": preview.bytes.byteLength,
          "x-content-type-options": "nosniff",
          ...(preview.storyboard === undefined ? {} : {
            "x-hypit-storyboard-count": String(preview.storyboard.count),
            "x-hypit-storyboard-columns": String(preview.storyboard.columns),
            "x-hypit-storyboard-rows": String(preview.storyboard.rows),
            "x-hypit-storyboard-tile-width": String(preview.storyboard.tileWidth),
            "x-hypit-storyboard-tile-height": String(preview.storyboard.tileHeight),
            "x-hypit-storyboard-sample-fps": String(preview.storyboard.sampleFps),
          }),
        });
        response.end(request.method === "HEAD" ? undefined : preview.bytes);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/transaction") {
        const input = transactionRequest(await requestJson(request));
        json(response, 200, (await nle.command({ kind: "project.transaction", input })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/place-media") {
        const input = mediaPlacementRequest(await requestJson(request));
        json(response, 200, (await nle.command({ kind: "media.place", input })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/media-library/refresh") {
        json(response, 200, (await nle.command({ kind: "media.refresh" })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/item-parameter") {
        const input = parameterEditRequest(await requestJson(request));
        json(response, 200, (await nle.command({ kind: "parameter.edit", input })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/component-media-input") {
        const input = componentMediaInputEditRequest(await requestJson(request));
        json(response, 200, (await nle.command({ kind: "component-media-input.edit", input })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/spatial-edit") {
        const input = spatialEditRequest(await requestJson(request));
        json(response, 200, (await nle.command({
          kind: "spatial.edit",
          input: { revision: input.revision, item: input.item, edit: { kind: "layout.replace", layout: input.layout } },
        })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/spatial-command") {
        const input = spatialCommandRequest(await requestJson(request));
        json(response, 200, (await nle.command({ kind: "spatial.edit", input })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/view-transaction") {
        const input = viewTransactionRequest(await requestJson(request));
        json(response, 200, (await nle.command({ kind: "view.transaction", input })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/undo") {
        json(response, 200, (await nle.command({ kind: "history.undo" })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/redo") {
        json(response, 200, (await nle.command({ kind: "history.redo" })).value);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/nle/save") {
        const input = saveRequest(await requestJson(request));
        json(response, 200, (await nle.command({ kind: "document.save", input })).value);
        return;
      }
      json(response, 404, errorView(new Error(`Unknown Workbench route: ${url.pathname}`)));
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      const conflict = error instanceof Error
        && (error.name === "NleRevisionConflict" || error.name === "NleTimelineViewRevisionConflict"
          || error.name === "NleExternalFileConflict" || error instanceof FeedbackConflict);
      json(response, conflict ? 409 : 400, errorView(error));
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
    origin,
    nleUrl: `${origin}/nle`,
    commentsUrl: `${origin}/comments`,
    projectFile,
    viewFile,
    feedbackFile: feedback.path,
    async close() {
      for (const response of eventResponses) response.end();
      await new Promise<void>((fulfill, reject) => server.close((error) => error === undefined ? fulfill() : reject(error)));
      await nle.close();
      if (ownsMediaService) await mediaService.close();
      await rm(feedbackUploadDirectory, { recursive: true, force: true });
    },
  };
}
