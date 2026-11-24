import { createReadStream, createWriteStream, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { serveApplicationEventStream, type NodeApplicationProductAdapter } from "@hypit/application/node";
import { isPicturePreviewRate, isWaveformPreviewResolution, type MediaResource } from "@hypit/media";
import { readProjectMediaAssetEdit, readProjectMediaLibraryEdit } from "@hypit/media-asset/service";
import { NleDocumentConflict } from "@hypit/nle/node";
import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import { assertExactTemporalValue } from "@hypit/temporal/algebra";
import { NleStudioProductSession, nleStudioProduct } from "./host.js";
import type {
  NleStudioActionRequest,
  NleStudioErrorResponse,
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
  if (request.kind === "timeline-drop") {
    const drop = operationRequest(request.drop);
    if (keys.length !== 2 || drop.kind !== "timeline.drop") throw new Error("NLE Studio Timeline drop observation is invalid.");
    return { kind: "timeline-drop", drop };
  }
  if (request.kind === "media-drop") {
    const drop = operationRequest(request.drop);
    if (keys.length !== 2 || drop.kind !== "media.drop") throw new Error("NLE Studio Media drop observation is invalid.");
    return { kind: "media-drop", drop };
  }
  if (request.kind === "timeline-cuts") {
    const input = record(request.cut, "NLE Studio Timeline cuts");
    const operation = operationRequest({ ...input, kind: "timeline.split" });
    if (keys.length !== 2 || "kind" in input || operation.kind !== "timeline.split") {
      throw new Error("NLE Studio Timeline cuts observation is invalid.");
    }
    const { composition, expectedProjectRevision, items, atFrame } = operation;
    return { kind: "timeline-cuts", cut: { composition, expectedProjectRevision, items, atFrame } };
  }
  if (request.kind === "composition-actions") {
    const input = record(request.selection, "NLE Studio Composition selection");
    const operation = operationRequest({ ...input, kind: "composition.compound", name: "复合片段" });
    if (keys.length !== 2 || "kind" in input || "name" in input || operation.kind !== "composition.compound") {
      throw new Error("NLE Studio Composition actions observation is invalid.");
    }
    const { composition, expectedProjectRevision, items } = operation;
    return { kind: "composition-actions", selection: { composition, expectedProjectRevision, items } };
  }
  if (request.kind === "inspector" || request.kind === "component-inputs" || request.kind === "matte-sources") {
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
  const kinds = new Set(["open", "project", "status", "timeline", "canvas", "media", "media-library", "catalog", "preview", "delivery", "clipboard"]);
  if (keys.length !== 1 || typeof request.kind !== "string" || !kinds.has(request.kind)) {
    throw new Error("NLE Studio observation kind is invalid.");
  }
  return { kind: request.kind as Exclude<NleStudioObservationRequest["kind"],
    "inspector" | "component-inputs" | "matte-sources" | "action" | "timeline-drop" | "media-drop" | "timeline-cuts" | "composition-actions" | "transition-inspector"> };
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

const commandFields = {
  "project.transact": ["commands"],
  "project.undo": [],
  "project.redo": [],
  "inspector.edit": ["item", "section", "field", "value"],
  "inspector.invoke": ["item", "section", "collection", "row", "action"],
  "transition-inspector.edit": ["transition", "section", "field", "value"],
  "spatial.edit": ["item", "edit"],
  "component-value.edit": ["item", "edit"],
} satisfies Record<NleEditingSurfaceCommand["kind"], readonly string[]>;

function commandRequest(value: unknown): NleEditingSurfaceCommand {
  const envelope = record(value, "NLE Studio Command envelope");
  if (Object.keys(envelope).length !== 1) throw new Error("NLE Studio Command requires one command.");
  const request = record(envelope.command, "NLE Studio Command");
  const kind = request.kind;
  const revision = request.expectedProjectRevision;
  if (typeof kind !== "string" || !Object.hasOwn(commandFields, kind)
    || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("NLE Studio Command requires a current kind and a Project revision.");
  }
  const fields = commandFields[kind as keyof typeof commandFields];
  if (Object.keys(request).length !== fields.length + 2 || !fields.every(field => Object.hasOwn(request, field))) {
    throw new Error(`NLE Studio Command ${kind} fields are invalid.`);
  }
  return request as NleEditingSurfaceCommand;
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
  if (!integer(request.expectedProjectRevision, 0)
    || !identity(request.composition)) {
    throw new Error("NLE Studio Operation requires revisions and a Composition.");
  }
  const currentFields = (...fields: readonly string[]) => Object.keys(request).every(key =>
    ["kind", "expectedProjectRevision", "composition", ...fields].includes(key));
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
      const alignment = request.alignment === undefined ? undefined : record(request.alignment, "NLE Studio Timeline edge alignment");
      valid = currentFields("anchor", "items", "deltaFrames", "target", "alignment")
        && identity(request.anchor) && items?.includes(request.anchor) === true
        && Number.isSafeInteger(request.deltaFrames) && location
        && (alignment === undefined || target.kind === "track" && Object.keys(alignment).length === 3
          && identity(alignment.item) && identity(alignment.neighbor) && (alignment.edge === "start" || alignment.edge === "end"));
      break;
    }
    case "track-lock.set":
      valid = currentFields("track", "locked") && identity(request.track) && typeof request.locked === "boolean";
      break;
    case "timeline.track-reorder":
      valid = currentFields("track", "before") && identity(request.track) && before;
      break;
    case "timeline.item-reorder":
      valid = currentFields("item", "direction") && identity(request.item)
        && (request.direction === "up" || request.direction === "down");
      break;
    case "timeline.trim":
      valid = currentFields("items", "edge", "atFrame") && items !== undefined && items.length > 0 && integer(request.atFrame, 0)
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
    case "media.drop": {
      const target = record(request.target, "NLE Studio Media drop target");
      const destination = identity(target.track) && Object.keys(target).length === 1
        || target.gap === true && (target.before === undefined || identity(target.before))
          && Object.keys(target).every(key => key === "gap" || key === "before");
      valid = currentFields("media", "atFrame", "target") && identity(request.media) && integer(request.atFrame, 0) && destination;
      break;
    }
    case "media.place-on-new-tracks":
      valid = currentFields("media", "atFrame") && integer(request.atFrame, 0)
        && Array.isArray(request.media) && request.media.length > 0 && request.media.every(identity);
      break;
    case "media.materialize":
      valid = currentFields("media", "includeAudio", "layout", "insertTracks", ...timedFields) && placement && duration && insertion
        && identity(request.media) && (request.includeAudio === undefined || typeof request.includeAudio === "boolean")
        && (request.layout === undefined || validPictureLayout(request.layout));
      break;
    case "media.freeze":
      valid = currentFields("item", "atFrame", "durationFrames") && identity(request.item)
        && integer(request.atFrame, 0) && duration;
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
    case "matte.bind":
      valid = currentFields("content", "source") && identity(request.content) && identity(request.source);
      break;
    case "matte.remove":
      valid = currentFields("matte") && identity(request.matte);
      break;
    case "composition.materialize":
      valid = currentFields("source", "atFrame", "track", "insertTracks") && placement && insertion && identity(request.source);
      break;
    case "composition.compound":
      valid = currentFields("items", "name") && items !== undefined && items.length > 0
        && typeof request.name === "string" && request.name.trim().length > 0;
      break;
    case "composition.duplicate":
      valid = currentFields("source") && identity(request.source);
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
      if (!fields(request, ...common, "at", "height", "coverWidth") || (request.height !== undefined && !integer(request.height, 1))
        || (request.coverWidth !== undefined && !integer(request.coverWidth, 1))) {
        throw new Error("NLE Studio thumbnail Action fields are invalid.");
      }
      if (request.at !== undefined) exact(request.at);
    } else if (request.kind === "media.source-preview") {
      if (request.preset === "filmstrip" && fields(request, ...common, "positions", "preset", "samplesPerSecond")
        && (request.samplesPerSecond === undefined || isPicturePreviewRate(request.samplesPerSecond))
        && Array.isArray(request.positions) && request.positions.length >= 1 && request.positions.length <= 64) {
        request.positions.forEach(exact);
      } else if (request.preset !== "waveform" || !fields(request, ...common, "preset", "blocks", "samplesPerPeak")
        || !isWaveformPreviewResolution(request.samplesPerPeak) || !Array.isArray(request.blocks)
        || request.blocks.length < 1 || request.blocks.length > 64 || !request.blocks.every(block => integer(block))) {
        throw new Error("Project Media source preview fields do not match a filmstrip or waveform request.");
      }
    } else {
      if (request.kind !== "media.storyboard" || request.range !== undefined) {
        const range = record(request.range, "NLE Studio Media view range");
        if (!fields(range, "start", "end")) throw new Error("NLE Studio Media view range fields are invalid.");
        exact(range.start);
        exact(range.end);
      }
      if (request.kind === "media.storyboard") {
        if (!fields(request, ...common, "range", "frames", "height", "coverWidth") || !integer(request.frames, 1)
          || (request.height !== undefined && !integer(request.height, 1))
          || (request.coverWidth !== undefined && !integer(request.coverWidth, 1))) {
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
  if (request.kind === "audio.source-preview") {
    const target = record(request.target, "NLE Studio Audio preview target");
    if (!fields(request, "kind", "target", "version", "blocks", "samplesPerPeak")
      || !fields(target, "kind", "composition") || target.kind !== "composition" || !identity(target.composition)
      || typeof request.version !== "string" || !/^[a-f0-9]{64}$/u.test(request.version)
      || !isWaveformPreviewResolution(request.samplesPerPeak) || !Array.isArray(request.blocks)
      || request.blocks.length < 1 || request.blocks.length > 64 || !request.blocks.every(block => integer(block))) {
      throw new Error("Audio source preview requires a Composition, version, PCM resolution and one to 64 block indices.");
    }
    return request as NleStudioActionRequest;
  }
  if (request.kind === "picture.source-preview") {
    const target = record(request.target, "NLE Studio Picture preview target");
    if (!fields(request, "kind", "target", "version", "positions", "samplesPerSecond")
      || (request.samplesPerSecond !== undefined && !isPicturePreviewRate(request.samplesPerSecond)) || !identity(target.composition)
      || (target.kind === "composition" ? !fields(target, "kind", "composition")
        : target.kind !== "component" || !fields(target, "kind", "composition", "item") || !identity(target.item))
      || typeof request.version !== "string" || !/^[a-f0-9]{64}$/u.test(request.version)
      || !Array.isArray(request.positions) || request.positions.length < 1 || request.positions.length > 24) {
      throw new Error("Picture source preview requires a target, version and one to 24 positions.");
    }
    request.positions.forEach(exact);
    return request as NleStudioActionRequest;
  }
  if (!integer(request.expectedProjectRevision)) throw new Error("NLE Studio Action requires a Project revision.");
  if (request.kind === "frame-preview" || request.kind === "playback-preview" || request.kind === "programme-waveform") {
    const common = ["kind", "expectedProjectRevision", "composition", "atFrame"];
    const range = request.kind === "frame-preview" ? fields(request, ...common)
      : integer(request.durationFrames, 1) && (request.kind === "playback-preview"
        ? fields(request, ...common, "durationFrames")
        : fields(request, ...common, "durationFrames", "width", "height")
          && (request.width === undefined || integer(request.width, 16) && Number(request.width) <= 2048)
          && (request.height === undefined || integer(request.height, 16) && Number(request.height) <= 512));
    if (!range || !identity(request.composition) || !integer(request.atFrame)) {
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
const browserContentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
};

// Open the browser build with the adapter so later builds on disk cannot change a running Host's client.
const browserBuild = (() => {
  const files = new Map<string, { readonly bytes: Buffer; readonly type: string }>();
  try {
    files.set("/", {
      bytes: readFileSync(join(browserDirectory, "index.html")),
      type: "text/html; charset=utf-8",
    });
    const assets = join(browserDirectory, "assets");
    for (const entry of readdirSync(assets, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const extension = extname(entry.name);
      if (!Object.hasOwn(browserContentTypes, extension)) continue;
      const type = browserContentTypes[extension as keyof typeof browserContentTypes];
      files.set(`/assets/${entry.name}`, { bytes: readFileSync(join(assets, entry.name)), type });
    }
    return { files };
  } catch (error) {
    return { error: new Error("The NLE Studio browser build is unavailable. Build NLE Studio and restart the Host.", { cause: error }) };
  }
})();

function sendStatic(response: ServerResponse, pathname: string): boolean {
  if (pathname !== "/" && !pathname.startsWith("/assets/")) return false;
  if (browserBuild.error !== undefined) throw browserBuild.error;
  const selected = browserBuild.files.get(pathname);
  if (selected === undefined) return false;
  response.writeHead(200, {
    "content-type": selected.type,
    "content-length": selected.bytes.byteLength,
    "cache-control": "no-store",
  });
  response.end(selected.bytes);
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
  resource: MediaResource,
  request: IncomingMessage,
  response: ServerResponse,
  cors = false,
): Promise<void> {
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
    ...(cors ? { "access-control-allow-origin": "*" } : {}),
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
  response.once("close", () => stream.destroy());
  stream.on("error", (error) => response.destroy(error));
  stream.pipe(response);
}

async function sendProgramme(
  studio: NleStudioProductSession, request: IncomingMessage, response: ServerResponse, url: URL, pathname: string,
): Promise<boolean> {
  const programme = studio.programme;
  const match = /^\/api\/programme\/([0-9a-f-]{36})\/(.+)$/u.exec(pathname);
  if (programme === undefined || match === null) return false;
  const generation = match[1]!;
  const route = match[2]!;
  if (request.method === "POST" && route === "activate") {
    programme.activate(generation);
    response.writeHead(204).end();
    return true;
  }
  if (request.method === "GET" && route === "index.html") {
    const assets = new URL("./assets/", url).href;
    const sources = new URL("./source/", url).href;
    const frames = new URL("./frame/", url).href;
    let html: string;
    try { html = await programme.document(generation); }
    catch (error) {
      const message = JSON.stringify(error instanceof Error ? error.message : String(error)).replaceAll("<", "\\u003c");
      html = `<!doctype html><script>addEventListener('message',event=>{
        if(event.source===parent&&event.origin===location.origin&&event.data?.kind==='programme-seek'
          &&event.data.generation===${JSON.stringify(generation)})parent.postMessage({
            kind:'programme-error',generation:event.data.generation,sequence:event.data.sequence,message:${message}
          },location.origin);
      });</script>`;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": `sandbox allow-scripts; default-src 'none'; frame-ancestors 'self'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src ${assets} data: blob:; font-src ${assets} data:; media-src ${assets}; connect-src ${assets} ${sources} ${frames}`,
    }).end(html);
    return true;
  }
  const artifact = /^assets\/([a-zA-Z0-9._:-]+)$/u.exec(route)?.[1];
  if (artifact !== undefined && (request.method === "GET" || request.method === "HEAD")) {
    await sendResource(await programme.resource(generation, artifact), request, response, true);
    return true;
  }
  const audio = /^audio\/([0-9]+)\.wav$/u.exec(route);
  if (request.method === "GET" && audio !== null) {
    const frame = Number(audio[1]);
    if (!Number.isSafeInteger(frame)) throw new Error("Invalid Programme audio frame.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    response.once("close", abort);
    try {
      const bytes = await programme.audioBuffer(generation, frame, controller.signal);
      if (bytes === undefined) response.writeHead(204, { "cache-control": "no-store" }).end();
      else response.writeHead(200, { "content-type": "audio/wav", "content-length": bytes.byteLength,
        "cache-control": "no-store" }).end(bytes);
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      response.off("close", abort);
    }
    return true;
  }
  const picture = /^(?:source\/([a-zA-Z0-9._:-]+)\/|frame\/)([0-9]+)\.png$/u.exec(route);
  if (request.method === "GET" && picture !== null) {
    const frame = Number(picture[2]);
    if (!Number.isSafeInteger(frame)) throw new Error("Invalid Programme Picture frame.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    response.once("close", abort);
    try {
      const bytes = picture[1] === undefined
        ? await programme.renderedFrame(generation, frame, controller.signal)
        : await programme.sourceFrame(generation, picture[1], frame, controller.signal);
      response.writeHead(200, {
        "content-type": "image/png", "content-length": bytes.byteLength,
        "cache-control": "no-store", "access-control-allow-origin": "*",
      }).end(bytes);
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      response.off("close", abort);
    }
    return true;
  }
  return false;
}

async function receiveMediaFile(
  studio: NleStudioProductSession,
  request: IncomingMessage,
  name: string,
  folder: string | null,
): Promise<NleStudioOperationReceipt> {
  if (name.length === 0) throw new Error("NLE Studio Media import requires a filename.");
  const directory = await mkdtemp(join(tmpdir(), "hypit-media-upload-"));
  const source = join(directory, "source");
  try {
    await pipeline(request, createWriteStream(source, { flags: "wx" }));
    const information = await stat(source);
    if (information.size === 0) throw new Error(`NLE Studio Media import ${name} is empty.`);
    return await studio.importMediaFile({ sourcePath: source, sourceName: name, ...(folder === null ? {} : { folder }) });
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
        sendJson(response, 200, await studio.command(commandRequest(await jsonBody(request))));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/operate") {
        sendJson(response, 200, await studio.operate(operationRequest(await jsonBody(request))));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/media/import") {
        sendJson(response, 200, await receiveMediaFile(studio, request, url.searchParams.get("name") ?? "", url.searchParams.get("folder")));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/media/library") {
        sendJson(response, 200, await studio.editMediaLibrary(readProjectMediaLibraryEdit(await jsonBody(request))));
        return true;
      }
      if (request.method === "POST" && pathname === "/api/media/asset") {
        sendJson(response, 200, await studio.editMediaAsset(readProjectMediaAssetEdit(await jsonBody(request))));
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
        await sendResource(studio.resource(token), request, response);
        return true;
      }
      if (pathname.startsWith("/api/programme/") && await sendProgramme(studio, request, response, url, pathname)) return true;
      return request.method === "GET" && sendStatic(response, pathname);
    } catch (error) {
      const documentConflict = error instanceof NleDocumentConflict;
      const conflict = documentConflict || error instanceof Error && error.name.includes("RevisionConflict");
      sendJson(response, conflict ? 409 : 400, {
        error: error instanceof Error ? error.message : String(error),
        ...(documentConflict ? { code: "document-conflict" } : {}),
      } satisfies NleStudioErrorResponse);
      return true;
    }
  },
};
