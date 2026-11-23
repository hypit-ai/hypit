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
  type ProjectMediaResourceResolver,
  type ProjectMediaViewExecutor,
  type ProjectMediaViews,
} from "../index.js";
import { moveProjectMediaAsset, requireProjectMediaFolder } from "../library.js";
import {
  createNodeProjectMediaCollection,
  type NodeProjectMediaCollectionOptions,
} from "./collection.js";
import { NodeProjectMediaViews } from "./views.js";

type NodeProjectMediaServiceOptions = NodeProjectMediaCollectionOptions & {
  readonly previews?: { readonly resolver: ProjectMediaResourceResolver; readonly executor: ProjectMediaViewExecutor };
};

export type AdoptProjectMediaFileRequest = {
  readonly sourcePath: string;
  readonly sourceName?: string;
  readonly mediaType: string;
  readonly target?: MediaAssetReference;
  readonly filePolicy?: "copy" | "link";
  readonly mediaFile?: string;
  readonly folder?: string;
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
  override readonly views: ProjectMediaViews | undefined;
  readonly #root: string;
  readonly #directory: string;

  constructor(options: NodeProjectMediaServiceOptions) {
    super(createNodeProjectMediaCollection(options));
    this.#root = resolve(options.root);
    this.#directory = inside(this.#root, resolve(this.#root, options.directory ?? "media"), "Project Media collection");
    this.views = options.previews === undefined ? undefined
      : new NodeProjectMediaViews(this, options.previews.resolver, options.previews.executor);
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
    return this.serializeWrite(async () => {
      context.signal?.throwIfAborted();
      const placement = request.folder === undefined ? undefined : { folder: request.folder, library: await this.readLibrary() };
      if (placement !== undefined) requireProjectMediaFolder(placement.library.document.root, placement.folder);
      const sourceName = sourceFileName(request);
      const reference = await this.#target(request, sourceName);
      const result = await adoptMediaFile({
        sourcePath: request.sourcePath,
        assetPath: resolve(this.#root, reference.path),
        mediaType: request.mediaType,
        filePolicy: request.filePolicy ?? "copy",
        mediaFile: request.mediaFile ?? safeMediaFile(sourceName),
      }, host, context);
      let revision: string | undefined;
      if (placement !== undefined) {
        const { library, folder } = placement;
        try {
          if (moveProjectMediaAsset(library.document.root, reference, folder)) revision = await this.writeLibrary(library);
        } catch (error) {
          await this.refresh();
          throw new Error(`Media was adopted at ${reference.path}, but could not be placed in folder ${folder}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
      }
      const catalog = await this.refresh();
      if (revision !== undefined) this.publishLibrary(revision);
      return { ...result, reference, catalog };
    });
  }
}

export function openNodeProjectMediaService(options: NodeProjectMediaServiceOptions): NodeProjectMediaService {
  return new NodeProjectMediaService(options);
}
