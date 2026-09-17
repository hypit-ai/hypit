import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { artifactPath, inside, serveMedia } from "./artifacts.js";
import { isLoopback } from "./config.js";
import type { ServerConfig } from "./config.js";
import { createCodegraffRunner } from "./runner.js";
import type { AgentRunner } from "./runner.js";
import { ProjectRuns, RequestError } from "./runs.js";
import { event, ProjectMetadataError, ProjectStore } from "./store.js";
import { isHypitFormatId } from "./formats.js";
import { SOCIAL_DESTINATIONS } from "./types.js";
import type { Project, ProjectInput, ReviewState, SocialDestination } from "./types.js";

const projectIdPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const projectRoute = new RegExp(`^/api/projects/(${projectIdPattern})(?:/(runs|cancel|artifacts)(?:/(${projectIdPattern}))?)?$`, "i");
const maxBodyBytes = 32_768;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function equalsSecret(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function mediaSignature(token: string, projectId: string, artifactId: string): string {
  return createHmac("sha256", token).update(`surreel-artifact:${projectId}:${artifactId}`).digest("base64url");
}

function publicProject(project: Project, config: ServerConfig): Project {
  if (!config.sessionToken) return project;
  return { ...project, artifacts: project.artifacts.map((artifact) => ({
    ...artifact,
    url: `/api/projects/${project.id}/artifacts/${artifact.id}?access=${mediaSignature(config.sessionToken!, project.id, artifact.id)}`,
  })) };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new RequestError(415, "Send the request as application/json.");
  }
  const length = Number(request.headers["content-length"] ?? 0);
  if (length > maxBodyBytes) throw new RequestError(413, "The request is too large.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > maxBodyBytes) throw new RequestError(413, "The request is too large.");
    chunks.push(buffer);
  }
  try {
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch { throw new RequestError(400, "The request must contain a valid JSON object."); }
}

function stringField(value: unknown, name: string, maximum: number, minimum = 1): string {
  if (typeof value !== "string" || value.trim().length < minimum || value.trim().length > maximum) {
    throw new RequestError(400, `${name} must contain ${minimum}–${maximum} characters.`);
  }
  return value.trim();
}

async function patchProject(store: ProjectStore, id: string, body: Record<string, unknown>): Promise<Project> {
  const current = await store.get(id);
  if (!current) throw new RequestError(404, "Project not found.");
  const review = body.review === undefined ? undefined : readReviewField(body.review);
  const destinations = body.destinations === undefined ? undefined : readDestinationField(body.destinations);
  if (review === undefined && destinations === undefined) {
    throw new RequestError(400, "Send a review decision or a social destination.");
  }
  const hasVideo = current.status === "completed" && current.artifacts.some((item) => item.mimeType.startsWith("video/"));
  if ((review === "approved" || review === "rejected" || review === "inbox") && !hasVideo) {
    throw new RequestError(409, "Only a finished video can enter review.");
  }
  if (review === "sent") {
    if (current.review !== "approved" && current.review !== "sent") {
      throw new RequestError(409, "Keep the video first, then send it.");
    }
    if ((destinations ?? current.destinations ?? []).length === 0) {
      throw new RequestError(400, "Choose at least one social destination.");
    }
  }
  return store.update(id, (project) => {
    const nextReview = review ?? project.review;
    const nextDestinations = destinations ?? project.destinations;
    return event({
      ...project,
      ...(nextReview === undefined ? {} : { review: nextReview }),
      ...(nextDestinations === undefined ? {} : { destinations: nextDestinations }),
    }, "review", reviewMessage(nextReview, nextDestinations));
  });
}

function readReviewField(value: unknown): ReviewState {
  if (value !== "inbox" && value !== "approved" && value !== "rejected" && value !== "sent") {
    throw new RequestError(400, "Review must be inbox, approved, rejected, or sent.");
  }
  return value;
}

function readDestinationField(value: unknown): SocialDestination[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > SOCIAL_DESTINATIONS.length) {
    throw new RequestError(400, "Choose one or more social destinations.");
  }
  return value.map((item) => {
    if (!SOCIAL_DESTINATIONS.includes(item as SocialDestination)) {
      throw new RequestError(400, "Choose TikTok, Instagram, YouTube, or X.");
    }
    return item as SocialDestination;
  });
}

function reviewMessage(review: ReviewState | undefined, destinations: SocialDestination[] | undefined): string {
  if (review === "approved") return "Kept for socials.";
  if (review === "rejected") return "Skipped. It will not go to socials.";
  if (review === "sent") return `Ready to post on ${(destinations ?? []).join(", ")}.`;
  if (review === "inbox") return "Returned to the review stack.";
  return "Review updated.";
}

function projectInput(body: Record<string, unknown>): ProjectInput {
  const prompt = stringField(body.prompt, "Prompt", 12000, 3);
  const title = body.title === undefined || body.title === "" ? prompt.split(/[\n.!?]/)[0]!.slice(0, 80) || "Untitled video"
    : stringField(body.title, "Title", 120);
  if (body.aspectRatio !== "9:16" && body.aspectRatio !== "16:9" && body.aspectRatio !== "1:1") {
    throw new RequestError(400, "Choose a 9:16, 16:9, or 1:1 aspect ratio.");
  }
  if (typeof body.duration !== "number" || !Number.isInteger(body.duration) || body.duration < 5 || body.duration > 300) {
    throw new RequestError(400, "Duration must be a whole number of seconds between 5 and 300.");
  }
  const style = stringField(body.style, "Style", 100);
  let format: string | undefined;
  if (body.format !== undefined && body.format !== "") {
    format = stringField(body.format, "Format", 80);
    if (!isHypitFormatId(format)) throw new RequestError(400, "Choose a Hypit production format.");
  }
  let referenceUrl: string | undefined;
  if (body.referenceUrl !== undefined && body.referenceUrl !== "") {
    referenceUrl = stringField(body.referenceUrl, "Reference URL", 2048);
    try {
      const url = new URL(referenceUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { throw new RequestError(400, "Use a complete public http(s) reference URL without login details."); }
  }
  return { title, prompt, aspectRatio: body.aspectRatio, duration: body.duration, style,
    ...(format === undefined ? {} : { format }),
    ...(referenceUrl === undefined ? {} : { referenceUrl }) };
}

const staticMime: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
};

async function serveWeb(request: IncomingMessage, response: ServerResponse, directory: string, pathname: string): Promise<boolean> {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  let path = resolve(directory, `.${decodeURIComponent(pathname)}`);
  const root = await realpath(directory);
  if (!inside(resolve(directory), path) && path !== resolve(directory)) return false;
  if (pathname.endsWith("/")) path = join(path, "index.html");
  try {
    if (!inside(root, await realpath(path)) || !(await stat(path)).isFile()) return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (extname(pathname)) return false;
    path = join(root, "index.html");
    if (!inside(root, await realpath(path))) return false;
  }
  const content = await readFile(path);
  response.writeHead(200, { "content-type": staticMime[extname(path)] ?? "application/octet-stream", "content-length": content.length,
    "cache-control": "no-cache" });
  response.end(request.method === "HEAD" ? undefined : content);
  return true;
}

export async function createSurreelServer(options: { config: ServerConfig; runner?: AgentRunner; store?: ProjectStore }) {
  const { config } = options;
  const store = options.store ?? new ProjectStore(config.projectsDir);
  await store.initialize();
  const runner = options.runner ?? createCodegraffRunner(config);
  const runs = new ProjectRuns(store, runner, config);
  const server = createServer((request, response) => {
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    void (async () => {
      const hostHeader = request.headers.host ?? "";
      let host: string;
      try { host = new URL(`http://${hostHeader}`).hostname; } catch { throw new RequestError(400, "Invalid request host."); }
      if (!config.sessionToken && !isLoopback(host)) throw new RequestError(403, "This local service accepts loopback hosts only.");
      const url = new URL(request.url ?? "/", `http://${hostHeader}`);
      const origin = request.headers.origin;
      const sameOrigin = origin === `http://${hostHeader}` || (Boolean(config.sessionToken) && origin === `https://${hostHeader}`);
      if (origin !== undefined) {
        if (!sameOrigin && !config.allowedOrigins.includes(origin)) throw new RequestError(403, "This frontend origin is not allowed.");
        response.setHeader("access-control-allow-origin", origin);
        response.setHeader("vary", "Origin");
        response.setHeader("access-control-allow-methods", "GET, HEAD, POST, PATCH, OPTIONS");
        response.setHeader("access-control-allow-headers", "Content-Type, Authorization, Range");
        response.setHeader("access-control-expose-headers", "Content-Range, Content-Length, Accept-Ranges");
      }
      if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
      const match = projectRoute.exec(url.pathname);
      if (url.pathname.startsWith("/api/") && config.sessionToken) {
        const authorized = equalsSecret(request.headers.authorization ?? "", `Bearer ${config.sessionToken}`);
        const signedMedia = (request.method === "GET" || request.method === "HEAD") && match?.[2] === "artifacts" && match[3]
          && equalsSecret(url.searchParams.get("access") ?? "", mediaSignature(config.sessionToken, match[1]!, match[3]));
        if (!authorized && !signedMedia && !sameOrigin) throw new RequestError(401, "Connect with the server's session token.");
      }
      if (url.pathname === "/api/health" && request.method === "GET") {
        json(response, 200, { status: "ok", agentAvailable: await runner.available(), agent: "Codegraff", sdkVersion: "0.4.2",
          authentication: "managed-by-codegraff", trustLocalAgent: config.trustLocalAgent });
      } else if (url.pathname === "/api/projects" && request.method === "GET") {
        json(response, 200, { projects: (await store.list()).map((project) => publicProject(project, config)) });
      } else if (url.pathname === "/api/projects" && request.method === "POST") {
        json(response, 201, { project: publicProject(await store.create(projectInput(await readJson(request))), config) });
      } else if (match) {
        const id = match[1]!;
        const operation = match[2];
        if (!operation && request.method === "GET") {
          const project = await store.get(id);
          if (!project) throw new RequestError(404, "Project not found.");
          json(response, 200, { project: publicProject(project, config) });
        } else if (!operation && request.method === "PATCH") {
          json(response, 200, { project: publicProject(await patchProject(store, id, await readJson(request)), config) });
        } else if (operation === "runs" && request.method === "POST") {
          const body = await readJson(request);
          const prompt = body.prompt === undefined ? undefined : stringField(body.prompt, "Revision prompt", 12000, 3);
          json(response, 202, { project: publicProject(await runs.start(id, prompt), config) });
        } else if (operation === "cancel" && request.method === "POST") {
          json(response, 200, { project: publicProject(await runs.cancel(id), config) });
        } else if (operation === "artifacts" && match[3] && (request.method === "GET" || request.method === "HEAD")) {
          const project = await store.get(id);
          const artifact = project?.artifacts.find((item) => item.id === match[3]);
          if (!artifact) throw new RequestError(404, "Artifact not found.");
          const path = await artifactPath(config.projectsDir, id, artifact);
          await serveMedia(request, response, path, artifact);
        } else { throw new RequestError(405, "This action is not supported."); }
      } else if (config.webDir && !url.pathname.startsWith("/api/") && await serveWeb(request, response, config.webDir, url.pathname)) {
        // Flutter's built web assets and history routes are served on the API's origin.
      } else { throw new RequestError(404, "Not found."); }
    })().catch((error: unknown) => {
      if (response.headersSent) { response.destroy(); return; }
      const status = error instanceof RequestError ? error.status : error instanceof ProjectMetadataError ? 500 : 500;
      const message = error instanceof RequestError ? error.message
        : error instanceof ProjectMetadataError ? "This project's saved data could not be read. Check the server logs."
          : "The server could not complete the request. Check the server logs.";
      if (!(error instanceof RequestError)) console.error("Surreel request failed:", error instanceof Error ? error.message : String(error));
      json(response, status, { error: message });
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return {
    server, store, runs,
    async close(): Promise<void> {
      const closed = new Promise<void>((resolve, reject) => {
        if (!server.listening) { resolve(); return; }
        server.close((error) => error ? reject(error) : resolve());
        server.closeIdleConnections();
      });
      await runs.close();
      await closed;
    },
  };
}
