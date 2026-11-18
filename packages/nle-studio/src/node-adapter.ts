import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { serveApplicationEventStream, type NodeApplicationProductAdapter } from "@hypit/application/node";
import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import { assertExactTemporalValue } from "@hypit/temporal/algebra";
import { NleStudioProductSession, nleStudioProduct } from "./host.js";
import type {
  NleStudioActionRequest,
  NleStudioCommandRequest,
  NleStudioObservationRequest,
  NleStudioOperation,
  NleStudioOperationReceipt,
} from "./protocol.js";

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 1024 * 1024) throw new Error("NLE Studio request exceeds one megabyte.");
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("NLE Studio request body must be JSON.");
  }
}

function observationRequest(value: unknown): NleStudioObservationRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("NLE Studio observation request must be an object.");
  }
  const request = record(value, "NLE Studio observation request");
  if (request.kind === "action") {
    const action = value as { readonly handle?: unknown };
    if (Object.keys(value).length !== 2 || !identity(action.handle)) {
      throw new Error("NLE Studio Action observation requires one handle.");
    }
    return { kind: "action", handle: action.handle };
  }
  const keys = Object.keys(value);
  if (request.kind === "timeline-media") {
    const fields = ["kind", "composition", "expectedProjectRevision", "expectedViewRevision", "expectedMediaGeneration",
      "tracks", "fromFrame", "toFrame"];
    if (keys.some(key => !fields.includes(key)) || !identity(request.composition) || !Array.isArray(request.tracks)
      || !request.tracks.every(identity) || request.tracks.length > 64
      || ![request.expectedProjectRevision, request.expectedViewRevision, request.expectedMediaGeneration, request.fromFrame, request.toFrame]
        .every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
      || Number(request.toFrame) <= Number(request.fromFrame)) {
      throw new Error("NLE Studio Timeline Media observation requires revisions, Tracks and a positive visible range.");
    }
    return request as NleStudioObservationRequest;
  }
  if (request.kind === "inspector" || request.kind === "component-inputs") {
    if (keys.some((key) => key !== "kind" && key !== "item") || typeof request.item !== "string"
      || request.item.length === 0) {
      throw new Error(`NLE Studio ${request.kind} observation requires one Item id.`);
    }
    return { kind: request.kind, item: request.item };
  }
  if (request.kind === "transition-inspector") {
    if (keys.length !== 2 || !identity(request.transition)) {
      throw new Error("NLE Studio Transition Inspector requires one Transition id.");
    }
    return { kind: request.kind, transition: request.transition };
  }
  const kinds = new Set(["open", "project", "status", "timeline", "canvas", "media", "catalog", "preview", "delivery", "clipboard"]);
  if (keys.length !== 1 || typeof request.kind !== "string" || !kinds.has(request.kind)) {
    throw new Error("NLE Studio observation kind is invalid.");
  }
  return { kind: request.kind as Exclude<NleStudioObservationRequest["kind"],
    "inspector" | "component-inputs" | "action" | "timeline-media" | "transition-inspector"> };
}

function record(value: unknown, subject: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function identity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validPictureLayout(value: unknown): boolean {
  const layout = record(value, "NLE Studio Picture layout");
  const dimensions = ["x", "y", "width", "height"];
  const alignment = ["contentX", "contentY"];
  return Object.keys(layout).every(key => key === "fit" || dimensions.includes(key) || alignment.includes(key))
    && dimensions.every(key => Number.isFinite(layout[key]))
    && alignment.every(key => layout[key] === undefined || Number.isFinite(layout[key]))
    && (layout.fit === "fill" || layout.fit === "contain" || layout.fit === "cover");
}

function operationRequest(value: unknown): NleStudioOperation {
  const request = record(value, "NLE Studio Operation");
  const integer = (entry: unknown, minimum: number) => typeof entry === "number" && Number.isSafeInteger(entry) && entry >= minimum;
  if (!integer(request.expectedProjectRevision, 0) || !integer(request.expectedViewRevision, 0)
    || !identity(request.composition)) {
    throw new Error("NLE Studio Operation requires revisions and a Composition.");
  }
  const currentFields = (...fields: readonly string[]) => Object.keys(request).every(key =>
    ["kind", "expectedProjectRevision", "expectedViewRevision", "composition", ...fields].includes(key));
  const items = Array.isArray(request.items) && request.items.every(identity) ? request.items : undefined;
  const tracks = Array.isArray(request.tracks) && request.tracks.every(identity) ? request.tracks : undefined;
  const track = request.track === undefined || identity(request.track);
  const placement = track && integer(request.atFrame, 0);
  const insertion = request.insertTracks === undefined
    || (identity(request.track) && Array.isArray(request.insertTracks) && request.insertTracks.length > 0 && request.insertTracks.every(identity));
  const duration = request.durationFrames === undefined || integer(request.durationFrames, 1);
  const offering = identity(request.package) && identity(request.offering);
  const before = request.before === undefined || identity(request.before);
  const process = identity(request.item) && identity(request.process) && (request.medium === "picture" || request.medium === "audio");
  const timedFields = ["atFrame", "durationFrames", "track"];
  let valid: boolean;
  switch (request.kind) {
    case "timeline.drop": {
      const target = record(request.target, "NLE Studio Timeline drop target");
      const location = target.kind === "track"
        ? identity(target.track) && Object.keys(target).length === 2
        : target.kind === "gap" && (target.before === undefined || identity(target.before))
          && Object.keys(target).every(key => key === "kind" || key === "before");
      valid = currentFields("anchor", "items", "deltaFrames", "target")
        && identity(request.anchor) && items?.includes(request.anchor) === true
        && Number.isSafeInteger(request.deltaFrames) && location;
      break;
    }
    case "timeline.trim":
      valid = currentFields("item", "edge", "atFrame") && identity(request.item) && integer(request.atFrame, 0)
        && (request.edge === "start" || request.edge === "end");
      break;
    case "timeline.slip":
      valid = currentFields("item", "deltaFrames") && identity(request.item) && Number.isSafeInteger(request.deltaFrames);
      break;
    case "timeline.retime": {
      const rate = record(request.rate, "NLE Studio source rate");
      valid = currentFields("item", "rate") && identity(request.item) && Object.keys(rate).length === 2
        && Number.isSafeInteger(rate.numerator) && rate.numerator !== 0 && integer(rate.denominator, 1);
      break;
    }
    case "timeline.roll":
      valid = currentFields("left", "right", "atFrame") && identity(request.left) && identity(request.right)
        && request.left !== request.right && integer(request.atFrame, 0);
      break;
    case "timeline.ripple-trim":
      valid = currentFields("item", "tracks", "atFrame") && identity(request.item)
        && tracks !== undefined && tracks.length > 0 && integer(request.atFrame, 0);
      break;
    case "timeline.split":
      valid = currentFields("items", "atFrame") && items !== undefined && items.length > 0 && integer(request.atFrame, 0);
      break;
    case "timeline.remove":
    case "clipboard.copy":
    case "clipboard.cut":
      valid = currentFields("items") && items !== undefined && items.length > 0;
      break;
    case "timeline.ripple-remove":
      valid = currentFields("items", "tracks") && items !== undefined && items.length > 0
        && tracks !== undefined && tracks.length > 0;
      break;
    case "timeline.close-gap":
      valid = currentFields("tracks", "atFrame") && tracks !== undefined && tracks.length > 0 && integer(request.atFrame, 0);
      break;
    case "clipboard.paste":
      valid = currentFields("atFrame") && integer(request.atFrame, 0);
      break;
    case "clipboard.apply-groups":
      valid = currentFields();
      break;
    case "media.materialize":
      valid = currentFields("media", "includeAudio", "layout", "insertTracks", ...timedFields) && placement && duration && insertion
        && identity(request.media) && (request.includeAudio === undefined || typeof request.includeAudio === "boolean")
        && (request.layout === undefined || validPictureLayout(request.layout));
      break;
    case "media.freeze":
      valid = currentFields("item", "sampleFrame", "insertTracks", ...timedFields) && placement && insertion
        && identity(request.item) && integer(request.sampleFrame, 0) && integer(request.durationFrames, 1);
      break;
    case "component.materialize": {
      const media = request.media === undefined ? {} : record(request.media, "Component Media seeds");
      const values = request.values === undefined ? {} : record(request.values, "Component value selections");
      const valueSelections = Object.values(values).every(value => {
        const selection = record(value, "Component value selection");
        return Object.keys(selection).length === 2 && (
          (selection.kind === "share" && identity(selection.name)) || (selection.kind === "link" && identity(selection.ref))
        );
      });
      valid = currentFields("package", "offering", "media", "values", "insertTracks", ...timedFields)
        && placement && duration && offering && insertion && Object.values(media).every(identity) && valueSelections;
      break;
    }
    case "adjust.materialize":
      valid = currentFields("package", "offering", ...timedFields) && placement && duration && offering;
      break;
    case "process.materialize":
      valid = currentFields("package", "offering", "item", "before") && offering && identity(request.item) && before;
      break;
    case "process.enable":
      valid = currentFields("item", "medium", "process", "enabled") && process && typeof request.enabled === "boolean";
      break;
    case "process.move":
      valid = currentFields("item", "medium", "process", "before") && process && before;
      break;
    case "process.remove":
      valid = currentFields("item", "medium", "process") && process;
      break;
    case "process.timing":
      valid = process && (request.edge === "mapping"
        ? currentFields("item", "medium", "process", "edge")
        : (request.edge === "start" || request.edge === "end")
          && currentFields("item", "medium", "process", "edge", "durationFrames") && duration);
      break;
    case "transition.materialize":
      valid = duration && offering && (
        currentFields("package", "offering", "items", "durationFrames") && items?.length === 2 && items[0] !== items[1]
        || currentFields("package", "offering", "track", "atFrame", "durationFrames") && identity(request.track) && placement
      );
      break;
    case "transition.replace":
      valid = currentFields("package", "offering", "transition", "durationFrames") && offering && duration && identity(request.transition);
      break;
    case "transition.resize":
      valid = currentFields("transition", "durationFrames") && identity(request.transition) && integer(request.durationFrames, 1);
      break;
    case "transition.remove":
      valid = currentFields("transition") && identity(request.transition);
      break;
    case "composition.materialize":
      valid = currentFields("source", "atFrame", "track", "insertTracks") && placement && insertion && identity(request.source);
      break;
    case "composition.compound":
      valid = currentFields("items", "name") && items !== undefined && items.length > 0
        && typeof request.name === "string" && request.name.trim().length > 0;
      break;
    case "composition.make-unique":
    case "composition.explode":
      valid = currentFields("item") && identity(request.item);
      break;
    case "composition.select":
      valid = currentFields("target") && identity(request.target);
      break;
    case "composition.enter":
      valid = currentFields("item", "atFrame") && identity(request.item) && integer(request.atFrame, 0);
      break;
    case "composition.return":
      valid = currentFields();
      break;
    case "audio.detach":
      valid = currentFields("item", "track") && track && identity(request.item);
      break;
    case "component-media.bind":
      valid = currentFields("item", "slot", "media") && identity(request.item) && identity(request.slot) && identity(request.media);
      break;
    case "component-media.unbind":
      valid = currentFields("item", "slot") && identity(request.item) && identity(request.slot);
      break;
    default:
      throw new Error("NLE Studio Operation kind is invalid.");
  }
  if (!valid) throw new Error(`NLE Studio ${request.kind} fields are invalid.`);
  return request as NleStudioOperation;
}

function actionRequest(value: unknown): NleStudioActionRequest {
  const request = record(value, "NLE Studio Action request");
  const fields = (entry: Readonly<Record<string, unknown>>, ...keys: readonly string[]) =>
    Object.keys(entry).every(key => keys.includes(key));
  const integer = (entry: unknown, minimum = 0) =>
    typeof entry === "number" && Number.isSafeInteger(entry) && entry >= minimum;
  const renderer = (entry: unknown) => entry === undefined || entry === "chromium" || entry === "electron";
  const exact = (entry: unknown) => {
    const temporal = record(entry, "NLE Studio Media time");
    const base = record(temporal.timeBase, "NLE Studio Media time base");
    if (!fields(temporal, "ticks", "timeBase") || !fields(base, "numerator", "denominator")
      || typeof temporal.ticks !== "string" || typeof base.numerator !== "number" || typeof base.denominator !== "number") {
      throw new Error("NLE Studio Media time fields are invalid.");
    }
    assertExactTemporalValue({
      ticks: temporal.ticks, timeBase: { numerator: base.numerator, denominator: base.denominator },
    }, "NLE Studio Media time");
  };
  if (typeof request.kind === "string" && request.kind.startsWith("media.")) {
    const common = ["kind", "media", "expectedMediaGeneration"];
    if (!identity(request.media) || !integer(request.expectedMediaGeneration)) {
      throw new Error("NLE Studio Media view requires a Media identity and Catalog generation.");
    }
    if (request.kind === "media.thumbnail") {
      if (!fields(request, ...common, "at", "height") || (request.height !== undefined && !integer(request.height, 1))) {
        throw new Error("NLE Studio thumbnail Action fields are invalid.");
      }
      if (request.at !== undefined) exact(request.at);
    } else {
      const range = record(request.range, "NLE Studio Media view range");
      if (!fields(range, "start", "end")) throw new Error("NLE Studio Media view range fields are invalid.");
      exact(range.start);
      exact(range.end);
      if (request.kind === "media.storyboard") {
        if (!fields(request, ...common, "range", "frames", "height") || !integer(request.frames, 1)
          || (request.height !== undefined && !integer(request.height, 1))) {
          throw new Error("NLE Studio storyboard Action fields are invalid.");
        }
      } else if (request.kind === "media.waveform") {
        if (!fields(request, ...common, "range", "width", "height")
          || (request.width !== undefined && !integer(request.width, 1))
          || (request.height !== undefined && !integer(request.height, 1))) {
          throw new Error("NLE Studio waveform Action fields are invalid.");
        }
      } else if (request.kind !== "media.audio-preview" || !fields(request, ...common, "range")) {
        throw new Error("NLE Studio Media Action fields are invalid.");
      }
    }
    return request as NleStudioActionRequest;
  }
  if (!integer(request.expectedProjectRevision)) throw new Error("NLE Studio Action requires a Project revision.");
  if (request.kind === "frame-preview" || request.kind === "playback-preview" || request.kind === "programme-waveform") {
    const common = ["kind", "expectedProjectRevision", "expectedViewRevision", "composition", "atFrame"];
    const range = request.kind === "frame-preview" ? fields(request, ...common)
      : integer(request.durationFrames, 1) && (request.kind === "playback-preview"
        ? fields(request, ...common, "durationFrames")
        : fields(request, ...common, "durationFrames", "width", "height")
          && (request.width === undefined || integer(request.width, 16) && Number(request.width) <= 2048)
          && (request.height === undefined || integer(request.height, 16) && Number(request.height) <= 512));
    if (!range || !integer(request.expectedViewRevision) || !identity(request.composition) || !integer(request.atFrame)) {
      throw new Error(`NLE Studio ${request.kind} fields are invalid.`);
    }
    return request as NleStudioActionRequest;
  }
  if (request.kind !== "delivery") throw new Error("NLE Studio Action kind is invalid.");
  const profile = record(request.profile, "NLE Studio delivery profile");
  const picture = record(profile.picture, "NLE Studio delivery Picture profile");
  const rate = record(picture.frameRate, "NLE Studio delivery frame rate");
  const audio = profile.audio === undefined ? undefined : record(profile.audio, "NLE Studio delivery Audio profile");
  if (!fields(request, "kind", "expectedProjectRevision", "destination", "profile", "renderer")
    || !identity(request.destination) || !renderer(request.renderer)
    || !fields(profile, "picture", "audio") || !fields(picture, "width", "height", "frameRate", "background", "quality", "renderer")
    || !integer(picture.width, 2) || !integer(picture.height, 2) || !renderer(picture.renderer)
    || typeof picture.background !== "string" || !/^#[a-f0-9]{6}$/iu.test(picture.background)
    || !["draft", "standard", "high"].includes(String(picture.quality))
    || !fields(rate, "numerator", "denominator") || !integer(rate.numerator, 1) || !integer(rate.denominator, 1)
    || (audio !== undefined && (!fields(audio, "sampleRate", "channels") || !integer(audio.sampleRate, 1)
      || (audio.channels !== 1 && audio.channels !== 2)))) {
    throw new Error("NLE Studio delivery Action fields are invalid.");
  }
  return request as NleStudioActionRequest;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

const browserDirectory = fileURLToPath(new URL("./browser/", import.meta.url));
const staticFiles: Readonly<Record<string, { readonly file: string; readonly type: string }>> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
};

async function sendStatic(response: ServerResponse, pathname: string): Promise<boolean> {
  const selected = staticFiles[pathname] ?? (pathname.startsWith("/assets/")
    ? { file: pathname.slice(1), type: pathname.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8" }
    : undefined);
  if (selected === undefined || selected.file.includes("..")) return false;
  const path = resolve(browserDirectory, selected.file);
  const info = await stat(path);
  response.writeHead(200, {
    "content-type": selected.type,
    "content-length": info.size,
    "cache-control": "no-store",
  });
  createReadStream(path).pipe(response);
  return true;
}

type ByteRange = { readonly start: number; readonly end: number };

function byteRange(value: string | undefined, size: number): ByteRange | undefined {
  if (value === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (match === null || size === 0) throw new Error("NLE Studio resource Range is invalid.");
  const startText = match[1]!;
  const endText = match[2]!;
  let start: number;
  let end: number;
  if (startText.length === 0) {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error("NLE Studio resource Range is invalid.");
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText.length === 0 ? size - 1 : Number(endText);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || end < start || start >= size) {
    throw new Error("NLE Studio resource Range is outside the current file.");
  }
  return { start, end: Math.min(end, size - 1) };
}

async function sendResource(
  studio: NleStudioProductSession,
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
): Promise<void> {
  const resource = studio.resource(token);
  const information = await stat(resource.address);
  if (!information.isFile()) throw new Error("NLE Studio resource is not a file.");
  let range: ByteRange | undefined;
  try {
    range = byteRange(typeof request.headers.range === "string" ? request.headers.range : undefined,
      information.size);
  } catch {
    response.writeHead(416, {
      "content-range": `bytes */${information.size}`,
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    });
    response.end();
    return;
  }
  const status = range === undefined ? 200 : 206;
  const length = range === undefined ? information.size : range.end - range.start + 1;
  response.writeHead(status, {
    "content-type": resource.mediaType,
    "content-length": length,
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    ...(range === undefined ? {} : { "content-range": `bytes ${range.start}-${range.end}/${information.size}` }),
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(resource.address, range === undefined ? undefined : {
    start: range.start,
    end: range.end,
  });
  stream.on("error", (error) => response.destroy(error));
  stream.pipe(response);
}

async function sendPresentation(
  studio: NleStudioProductSession,
  response: ServerResponse,
  resource: string,
): Promise<void> {
  const value = await studio.presentationResource(resource);
  response.writeHead(200, {
    "content-type": value.mediaType,
    "content-length": value.bytes.byteLength,
    "cache-control": "no-store",
  });
  response.end(value.bytes);
}

async function receiveMediaFile(
  studio: NleStudioProductSession,
  request: IncomingMessage,
  name: string,
): Promise<NleStudioOperationReceipt> {
  if (name.length === 0) throw new Error("NLE Studio Media import requires a filename.");
  const directory = await mkdtemp(join(tmpdir(), "hypit-media-upload-"));
  const source = join(directory, "source");
  try {
    await pipeline(request, createWriteStream(source, { flags: "wx" }));
    const information = await stat(source);
    if (information.size === 0) throw new Error(`NLE Studio Media import ${name} is empty.`);
    return await studio.importMediaFile({ sourcePath: source, sourceName: name });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export const nleStudioNodeProductAdapter: NodeApplicationProductAdapter = {
  product: nleStudioProduct,
  async handle({ request, response, session, pathname, url, signal }) {
    if (!(session instanceof NleStudioProductSession)) {
      throw new Error("NLE Studio adapter received another Product Session kind.");
    }
    const studio = session;
    try {
      if (request.method === "GET" && pathname === "/api/events") {
        serveApplicationEventStream(response, AbortSignal.any([signal, studio.closed]), studio.subscribe.bind(studio));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/observe") {
        sendJson(response, 200, await studio.observe(observationRequest(await jsonBody(request))));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/command") {
        const body = await jsonBody(request) as NleStudioCommandRequest;
        sendJson(response, 200, await studio.command(body.command as NleEditingSurfaceCommand));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/operate") {
        sendJson(response, 200, await studio.operate(operationRequest(await jsonBody(request))));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/media/import") {
        sendJson(response, 200, await receiveMediaFile(studio, request, url.searchParams.get("name") ?? ""));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/actions") {
        sendJson(response, 202, await studio.startAction(actionRequest(await jsonBody(request))));
        return true;
      }
      if ((request.method === "GET" || request.method === "DELETE")
        && pathname.startsWith("/api/actions/")) {
        const handle = decodeURIComponent(pathname.slice("/api/actions/".length));
        if (handle.length === 0 || handle.includes("/")) throw new Error("NLE Studio Action handle is invalid.");
        sendJson(response, 200, request.method === "DELETE"
          ? studio.cancelAction(handle)
          : studio.observeAction(handle));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/save") {
        sendJson(response, 200, await studio.save());
        return true;
      }
      if (request.method === "POST" && pathname === "/api/reload") {
        sendJson(response, 200, await studio.reload());
        return true;
      }
      if ((request.method === "GET" || request.method === "HEAD") && pathname.startsWith("/api/resources/")) {
        const token = decodeURIComponent(pathname.slice("/api/resources/".length));
        if (token.length === 0 || token.includes("/")) throw new Error("NLE Studio resource token is invalid.");
        await sendResource(studio, request, response, token);
        return true;
      }
      if (request.method === "GET" && pathname.startsWith("/api/presentations/")) {
        const resource = decodeURIComponent(pathname.slice("/api/presentations/".length));
        if (resource.length === 0) throw new Error("NLE Studio presentation resource is invalid.");
        await sendPresentation(studio, response, resource);
        return true;
      }
      return request.method === "GET" && await sendStatic(response, pathname);
    } catch (error) {
      const conflict = error instanceof Error && error.name.includes("RevisionConflict");
      sendJson(response, conflict ? 409 : 400, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  },
};
