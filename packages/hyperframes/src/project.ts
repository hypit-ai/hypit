import { mkdir, open, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CompositableSurfaceRef } from "@hypit/media";
import type { BlobRef } from "@hypit/protocol";

import { assertHyperframesDocument, materializeHyperframesHtml } from "./document.js";
import type { HyperframesDocument } from "./types.js";

/** Reads one execution resource. Whose store it comes from is the caller's business. */
export type HyperframesArtifactReader = (
  artifact: BlobRef,
  signal?: AbortSignal,
) => Promise<Uint8Array | AsyncIterable<Uint8Array>>;
export type HyperframesSurfaceValidator = (
  surface: CompositableSurfaceRef,
  bytes: Uint8Array,
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
  if (found === undefined) throw new Error(`HyperFrames does not support Artifact media type ${mediaType}`);
  return found;
}

/**
 * Lay one document out as a directory HyperFrames can render.
 *
 * The same layout serves a local render and a distributed one: the local
 * Provider serves it to the capture engine, and the AWS Provider tars it into a site. If
 * the two laid it out differently, one Need would name two different projects.
 * Resource names are local to this staged project and carry no content claim.
 */
export async function stageHyperframesProject(options: {
  readonly document: HyperframesDocument;
  readonly directory: string;
  readonly read: HyperframesArtifactReader;
  readonly validateSurface?: HyperframesSurfaceValidator;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const { document, directory, read } = options;
  const controller = new AbortController();
  const signal = options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal]);
  signal.throwIfAborted();
  assertHyperframesDocument(document);
  if (document.surfaces.length > 0 && options.validateSurface === undefined) {
    throw new Error("HyperFrames Runtime has no Surface-byte validator");
  }
  const artifactDirectory = join(directory, "artifacts");
  await mkdir(artifactDirectory, { recursive: true });
  const paths = new Map<string, string>();
  const surfaces = new Map(document.surfaces.map((surface) => [surface.artifact.resource, surface]));
  await Promise.allSettled(document.artifacts.map(async (artifact) => {
    try {
      signal.throwIfAborted();
      const name = `${artifact.resource}${extension(artifact.mediaType)}`;
      const opened = await read(artifact, signal);
      signal.throwIfAborted();
      const chunks = opened instanceof Uint8Array
        ? (async function* () { yield opened; })()
        : opened;
      const surface = surfaces.get(artifact.resource);
      const retained: Uint8Array[] = [];
      let size = 0;
      const target = await open(join(artifactDirectory, name), "w");
      try {
        for await (const chunk of chunks) {
          signal.throwIfAborted();
          await target.write(chunk);
          size += chunk.byteLength;
          if (surface !== undefined) retained.push(Uint8Array.from(chunk));
        }
      } finally {
        await target.close();
      }
      if (size !== artifact.size) {
        throw new Error(`HyperFrames Artifact ${artifact.resource} size differs`);
      }
      const bytes = surface === undefined ? undefined : (() => {
        const value = new Uint8Array(size);
        let offset = 0;
        for (const chunk of retained) {
          value.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return value;
      })();
      if (surface !== undefined) {
        await options.validateSurface!(structuredClone(surface), bytes!.slice(), signal);
      }
      paths.set(artifact.resource, `./artifacts/${name}`);
    } catch (error) {
      controller.abort(error);
      throw error;
    }
  }));
  // All writes have settled before the caller can remove the staged directory.
  signal.throwIfAborted();
  const html = materializeHyperframesHtml(document, (artifact) => {
    const path = paths.get(artifact.resource);
    if (path === undefined) throw new Error(`HyperFrames Artifact ${artifact.resource} was not staged`);
    return path;
  });
  await writeFile(join(directory, "index.html"), html, { encoding: "utf8", signal });
}
