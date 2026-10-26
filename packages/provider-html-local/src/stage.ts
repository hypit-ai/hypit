import { mkdir, open, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { materializeHtmlProgram, selectHtmlArtifacts } from "@hypit/html-program";
import type { HtmlProgram } from "@hypit/html-program";
import type { CompositableSurfaceRef } from "@hypit/media";
import type { BlobRef } from "@hypit/hypit/protocol";
import type { FrameSpan } from "@hypit/timeline";

/** Reads one execution resource. Whose store it comes from is the caller's business. */
export type HtmlArtifactReader = (
  artifact: BlobRef,
  signal?: AbortSignal,
) => Promise<Uint8Array | AsyncIterable<Uint8Array>>;
/** Inspect the completed staged file; its lifetime belongs to the staging caller. */
export type HtmlSurfaceValidator = (
  surface: CompositableSurfaceRef,
  path: string,
  signal?: AbortSignal,
) => Promise<void>;

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "font/woff2": ".woff2",
  "font/woff": ".woff",
  "font/ttf": ".ttf",
  "font/otf": ".otf",
};

function extension(mediaType: string): string {
  const found = EXTENSIONS[mediaType];
  if (found === undefined) throw new Error(`HTML renderer does not support Artifact media type ${mediaType}`);
  return found;
}

export function htmlArtifactRelativePath(document: HtmlProgram, resource: string): string {
  const index = document.artifacts.findIndex((entry) => entry.artifact.resource === resource);
  if (index < 0) throw new Error(`HTML Program Artifact ${resource} is not declared`);
  return `artifacts/asset-${index}${extension(document.artifacts[index]!.artifact.mediaType)}`;
}

/**
 * Lay one document out as a directory HTML renderer can render.
 *
 * This local Provider serves the staged document to its browser workers.
 * Resource names are local to this staged project and carry no content claim.
 */
export async function stageHtmlProgram(options: {
  readonly document: HtmlProgram;
  readonly directory: string;
  readonly read: HtmlArtifactReader;
  readonly validateSurface?: HtmlSurfaceValidator;
  /** Whole-request absolute selection. Omit only when every frame may be rendered. */
  readonly frameSelection?: readonly FrameSpan[];
  /** Maximum complete Artifact read/write/validation lifecycles in flight. */
  readonly maxConcurrentArtifacts?: number;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const { document, directory, read } = options;
  const controller = new AbortController();
  const signal = options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal]);
  signal.throwIfAborted();
  const selectedResources = new Set(selectHtmlArtifacts(document, options.frameSelection)
    .map((entry) => entry.artifact.resource));
  const maxConcurrentArtifacts = options.maxConcurrentArtifacts ?? 1;
  if (!Number.isSafeInteger(maxConcurrentArtifacts) || maxConcurrentArtifacts < 1) {
    throw new Error("HTML renderer Artifact staging concurrency must be a positive safe integer");
  }
  const artifactDirectory = join(directory, "artifacts");
  await mkdir(artifactDirectory, { recursive: true });
  const selected = document.artifacts.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => selectedResources.has(entry.artifact.resource));
  // Paths remain a deterministic function of the complete compiled Document.
  // Unselected compiler-owned media keep a missing local URL in inert markup;
  // selected roots can only activate Artifacts admitted above.
  const paths = new Map(document.artifacts.map((entry, index) => [entry.artifact.resource,
    `./artifacts/asset-${index}${extension(entry.artifact.mediaType)}`]));
  const surfaces = new Map(document.surfaces.map((surface) => [surface.artifact.resource, surface]));
  if (options.validateSurface === undefined
    && selected.some(({ entry }) => surfaces.has(entry.artifact.resource))) {
    throw new Error("HTML renderer Runtime has no Surface-byte validator");
  }
  let nextArtifact = 0;
  let failure: unknown;
  const stageNext = async (): Promise<void> => {
    while (failure === undefined) {
      const index = nextArtifact;
      if (index >= selected.length) return;
      nextArtifact += 1;
      const selectedArtifact = selected[index]!;
      const artifact = selectedArtifact.entry.artifact;
      try {
        signal.throwIfAborted();
        // Resource identities are portable protocol values, not filesystem names.
        const name = `asset-${selectedArtifact.index}${extension(artifact.mediaType)}`;
        const opened = await read(artifact, signal);
        signal.throwIfAborted();
        const chunks = opened instanceof Uint8Array
          ? (async function* () { yield opened; })()
          : opened;
        const surface = surfaces.get(artifact.resource);
        let size = 0;
        const path = join(artifactDirectory, name);
        const target = await open(path, "w");
        try {
          for await (const chunk of chunks) {
            signal.throwIfAborted();
            await target.writeFile(chunk);
            size += chunk.byteLength;
          }
        } finally {
          await target.close();
        }
        if (size !== artifact.size) {
          throw new Error(`HTML renderer Artifact ${artifact.resource} size differs`);
        }
        if (surface !== undefined) {
          // The validator borrows the completed staged file for this call only.
          await options.validateSurface!(structuredClone(surface), path, signal);
        }
      } catch (error) {
        if (failure === undefined) {
          failure = error;
          controller.abort(error);
        }
        return;
      }
    }
  };
  const workers = Array.from({ length: Math.min(maxConcurrentArtifacts, selected.length) }, () => stageNext());
  // A failure stops new claims, but every already-started reader, writer and
  // validator settles before the caller may remove the staging directory.
  await Promise.all(workers);
  // Preserve whichever abort reached the combined signal first, including an
  // external caller's exact reason rather than a later stream AbortError.
  signal.throwIfAborted();
  if (failure !== undefined) throw failure;
  // All writes have settled before the caller can remove the staged directory.
  const html = materializeHtmlProgram(document, (artifact) => {
    const path = paths.get(artifact.resource);
    if (path === undefined) throw new Error(`HTML renderer Artifact ${artifact.resource} has no materialized path`);
    return path;
  });
  await writeFile(join(directory, "index.html"), html, { encoding: "utf8", signal });
}
