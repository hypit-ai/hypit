import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CompositableSurfaceRef } from "@narratage/media";
import type { BlobRef, CanonicalValue } from "@narratage/protocol";

import { assertHyperframesDocument, materializeHyperframesHtml } from "./document.js";
import type { HyperframesDocument } from "./types.js";

/** Reads one content-addressed dependency. Whose store it comes from is the caller's business. */
export type HyperframesArtifactReader = (artifact: BlobRef) => Promise<Uint8Array>;
export type HyperframesSurfaceValidator = (
  surface: CompositableSurfaceRef,
  bytes: Uint8Array,
) => Promise<CanonicalValue>;

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
 * Provider points the CLI at it, and the AWS Provider tars it into a site. If
 * the two laid it out differently, one Need would name two different projects
 * and the content-addressed site id would stop meaning anything.
 *
 * Dependencies are named by digest, so a directory built twice from one
 * document is byte-identical and an unchanged tree re-uploads as a no-op.
 */
export async function stageHyperframesProject(options: {
  readonly document: HyperframesDocument;
  readonly directory: string;
  readonly read: HyperframesArtifactReader;
  readonly validateSurface?: HyperframesSurfaceValidator;
}): Promise<{ readonly html: string; readonly surfaceValidations: readonly CanonicalValue[] }> {
  const { document, directory, read } = options;
  assertHyperframesDocument(document);
  if (document.surfaces.length > 0 && options.validateSurface === undefined) {
    throw new Error("HyperFrames Runtime has no Surface-byte validator");
  }
  const artifactDirectory = join(directory, "artifacts");
  await mkdir(artifactDirectory, { recursive: true });
  const paths = new Map<string, string>();
  const surfaces = new Map(document.surfaces.map((surface) => [surface.artifact.digest, surface]));
  const validations = await Promise.all(document.artifacts.map(async (artifact) => {
    const name = `${artifact.digest.slice("sha256:".length)}${extension(artifact.mediaType)}`;
    const bytes = await read(artifact);
    if (bytes.byteLength !== artifact.size) {
      throw new Error(`HyperFrames Artifact ${artifact.digest} size differs`);
    }
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (digest !== artifact.digest) {
      throw new Error(`HyperFrames Artifact ${artifact.digest} bytes differ`);
    }
    const surface = surfaces.get(artifact.digest);
    const validation = surface === undefined
      ? undefined
      : await options.validateSurface!(structuredClone(surface), bytes.slice());
    await writeFile(join(artifactDirectory, name), bytes);
    paths.set(artifact.digest, `./artifacts/${name}`);
    return validation;
  }));
  const html = materializeHyperframesHtml(document, (artifact) => {
    const path = paths.get(artifact.digest);
    if (path === undefined) throw new Error(`HyperFrames Artifact ${artifact.digest} was not staged`);
    return path;
  });
  await writeFile(join(directory, "index.html"), html, "utf8");
  return {
    html,
    surfaceValidations: validations.filter((value): value is CanonicalValue => value !== undefined),
  };
}
