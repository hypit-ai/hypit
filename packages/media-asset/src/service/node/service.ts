import { stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import {
  type MediaAdoptionContext,
  type MediaAssetReference,
  verifyMediaAssetReference,
} from "../../index.js";
import {
  adoptMediaFile,
  type AdoptMediaFileHost,
  type AdoptMediaFileResult,
} from "../../node/index.js";
import {
  ProjectMediaService,
  type ProjectMediaCatalog,
} from "../index.js";
import {
  createNodeProjectMediaCollection,
  type NodeProjectMediaCollectionOptions,
} from "./collection.js";

export type AdoptProjectMediaFileRequest = {
  readonly sourcePath: string;
  readonly sourceName?: string;
  readonly mediaType: string;
  readonly target?: MediaAssetReference;
  readonly filePolicy?: "copy" | "link";
  readonly mediaFile?: string;
};

export type AdoptProjectMediaFileResult = AdoptMediaFileResult & {
  readonly reference: MediaAssetReference;
  readonly catalog: ProjectMediaCatalog;
};

function portable(path: string): string {
  return path.split(sep).join("/");
}

function inside(root: string, target: string, subject: string): string {
  const local = relative(root, target);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`${subject} leaves the Project Media collection.`);
  }
  return target;
}

function sourceFileName(request: AdoptProjectMediaFileRequest): string {
  const requested = request.sourceName ?? basename(request.sourcePath);
  const name = requested.replaceAll("\\", "/").split("/").at(-1) ?? "";
  if (name.length === 0 || name === "." || name === "..") {
    throw new Error("Project Media adoption requires a source filename.");
  }
  return name;
}

function safeStem(value: string): string {
  const normalized = value.normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^[._-]+|[._-]+$/gu, "");
  const stem = normalized.length === 0 ? "media" : normalized;
  return (/^[A-Za-z]/u.test(stem) ? stem : `media-${stem}`).slice(0, 128);
}

function safeMediaFile(value: string): string {
  const extension = extname(value).toLowerCase().replace(/[^a-z0-9.]+/gu, "");
  return `${safeStem(parse(value).name)}${extension}`;
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then(() => true, () => false);
}

/** Node facet of the one Project Media Service owned by a ProjectHost. */
export class NodeProjectMediaService extends ProjectMediaService {
  readonly #root: string;
  readonly #directory: string;
  #actions: Promise<void> = Promise.resolve();

  constructor(options: NodeProjectMediaCollectionOptions) {
    super(createNodeProjectMediaCollection(options));
    this.#root = resolve(options.root);
    this.#directory = inside(this.#root, resolve(this.#root, options.directory ?? "media"), "Project Media collection");
  }

  async #target(request: AdoptProjectMediaFileRequest, sourceName: string): Promise<MediaAssetReference> {
    if (request.target !== undefined) {
      verifyMediaAssetReference(request.target);
      const path = resolve(this.#root, request.target.path);
      inside(this.#directory, path, `Media Asset ${request.target.path}`);
      return { path: portable(relative(this.#root, path)) };
    }
    const stem = safeStem(parse(sourceName).name);
    for (let suffix = 1; ; suffix += 1) {
      const name = suffix === 1 ? stem : `${stem}-${suffix}`;
      const path = resolve(this.#directory, name, `${name}.media.json`);
      if (!await exists(path) && !await exists(dirname(path))) {
        return { path: portable(relative(this.#root, path)) };
      }
    }
  }

  adoptFile(
    request: AdoptProjectMediaFileRequest,
    host: AdoptMediaFileHost,
    context: MediaAdoptionContext = {},
  ): Promise<AdoptProjectMediaFileResult> {
    const run = async (): Promise<AdoptProjectMediaFileResult> => {
      context.signal?.throwIfAborted();
      const sourceName = sourceFileName(request);
      const reference = await this.#target(request, sourceName);
      const result = await adoptMediaFile({
        sourcePath: request.sourcePath,
        assetPath: resolve(this.#root, reference.path),
        mediaType: request.mediaType,
        filePolicy: request.filePolicy ?? "copy",
        mediaFile: request.mediaFile ?? safeMediaFile(sourceName),
      }, host, context);
      const catalog = await this.refresh();
      return { ...result, reference, catalog };
    };
    const action = this.#actions.then(run, run);
    this.#actions = action.then(() => undefined, () => undefined);
    return action;
  }
}

export function openNodeProjectMediaService(options: NodeProjectMediaCollectionOptions): NodeProjectMediaService {
  return new NodeProjectMediaService(options);
}
