import type { MediaArtifactRef } from "../svml.js";

/**
 * Media the playground has been given, addressed the way the Runtime addresses
 * it.
 *
 * `assertHyperframesDocument` cross-checks every `svml-artifact://` placeholder
 * against the document's declared Artifacts and runs `isDigest` on each, so a
 * stub digest would be rejected. These are real SHA-256 digests of the actual
 * bytes, computed with Web Crypto — which is asynchronous, hence registering a
 * file is too.
 */

const refs = new Map<string, MediaArtifactRef>();
const urls = new Map<string, string>();

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Reads a media file's own duration, which MediaArtifactRef requires. */
async function durationOf(file: File, url: string): Promise<number> {
  if (file.type.startsWith("image/")) return 0;
  const kind = file.type.startsWith("audio/") ? "audio" : "video";
  return await new Promise<number>((resolve) => {
    const probe = document.createElement(kind);
    probe.preload = "metadata";
    const done = (value: number): void => { probe.removeAttribute("src"); resolve(value); };
    probe.addEventListener("loadedmetadata", () => {
      done(Number.isFinite(probe.duration) ? probe.duration : 0);
    }, { once: true });
    // A file the browser cannot decode still has to produce a legal Artifact,
    // so the preview can show the failure rather than refusing to build.
    probe.addEventListener("error", () => done(0), { once: true });
    probe.src = url;
  });
}

/**
 * Records an Artifact the playground can name but has no bytes for.
 *
 * A component only needs the reference to build a legal Composition; the bytes
 * are needed to draw it. Keeping the two separable is what lets an adapter be
 * exercised outside a browser, and it is also the honest model for a digest
 * that arrives from somewhere other than a file picker.
 */
export function registerArtifact(ref: MediaArtifactRef, objectUrl?: string): MediaArtifactRef {
  refs.set(ref.digest, ref);
  if (objectUrl !== undefined) urls.set(ref.digest, objectUrl);
  return ref;
}

export async function registerFile(file: File): Promise<MediaArtifactRef> {
  const bytes = await file.arrayBuffer();
  const digest = `sha256:${hex(await crypto.subtle.digest("SHA-256", bytes))}`;
  const existing = refs.get(digest);
  if (existing !== undefined) return existing;

  const mediaType = file.type || "application/octet-stream";
  const url = URL.createObjectURL(new Blob([bytes], { type: mediaType }));
  return registerArtifact({
    digest,
    size: bytes.byteLength,
    mediaType,
    durationSec: await durationOf(file, url),
  } as MediaArtifactRef, url);
}

export function artifactRef(digest: string | undefined): MediaArtifactRef | undefined {
  return digest === undefined ? undefined : refs.get(digest);
}

export function artifactUrl(digest: string): string | undefined {
  return urls.get(digest);
}

export function artifactLabel(digest: string | undefined): string {
  if (digest === undefined) return "no media";
  const ref = refs.get(digest);
  if (ref === undefined) return `${digest.slice(0, 15)}… (missing)`;
  const size = ref.size < 1024 * 1024
    ? `${Math.round(ref.size / 1024)} KB`
    : `${(ref.size / 1024 / 1024).toFixed(1)} MB`;
  return `${ref.mediaType} · ${size}`;
}
