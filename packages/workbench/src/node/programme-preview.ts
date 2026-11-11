import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  audioProgramGraphFromMediaSources,
  audioProgramMediaSources,
  sealAudioProgram,
  type AudioProgram,
} from "@hypit/audio-program";
import type { Facet } from "@hypit/facet";
import { compileHtmlDocument, materializeHtmlDocument } from "@hypit/html-document";
import { lowerPlaybackAudio } from "@hypit/html-playback";
import {
  createNleScaledHtmlOutput,
  createNleTerminalLinkHostFromFacets,
  linkNleProjectTerminals,
  lowerNleAudiovisualToAudioProgram,
  lowerNleAudiovisualToHtmlProgram,
  nleHtmlVideoPackagesFromFacets,
} from "@hypit/html-video";
import { verifyRenderedAudio } from "@hypit/media";
import type { NleProject } from "@hypit/nle";
import { createNodeNleMediaResolver } from "@hypit/nle/node";
import { resolveMediaAssetMediaFile } from "@hypit/media-asset/node";
import { createMediaExecutionEnvironment, executeRenderAudioProgram } from "@hypit/media-local";
import { canonicalize, type BlobRef, type ResourceId } from "@hypit/protocol";
import { exactTemporalZero, identityTemporalMap, type TemporalRate } from "@hypit/temporal/algebra";

export type NleProgrammeResource = {
  readonly file: string;
  readonly mediaType: string;
  readonly size: number;
};

export type NleProgrammeDocument = {
  readonly html: string;
  readonly frameCount: number;
};

type BoundResource = NleProgrammeResource & {
  readonly ref: BlobRef;
};

function previewKey(project: NleProject, frameRate: TemporalRate): string {
  return `${project.revision}:${frameRate.numerator}/${frameRate.denominator}`;
}

/**
 * Invocation-local Programme derivation for the open NLE Project.
 *
 * Component and Media owners still produce the terminal programmes. Workbench
 * only binds project files to loopback URLs and closes those programmes into a
 * browser document. Neither the document nor its resource identities enter the
 * NLE Project or Timeline View.
 */
export class NleProgrammePreview {
  readonly #facets: readonly Facet[];
  readonly #projectRoot: string;
  readonly #projectFile: string;
  readonly #byFile = new Map<string, Promise<BoundResource>>();
  readonly #byResource = new Map<ResourceId, BoundResource>();
  readonly #audio = new Map<string, Promise<AudioProgram>>();
  #cacheDirectory: Promise<string> | undefined;
  #packageResources: Promise<void> | undefined;
  #key: string | undefined;
  #document: Promise<NleProgrammeDocument> | undefined;

  constructor(projectRoot: string, projectFile: string, facets: readonly Facet[] = []) {
    this.#projectRoot = resolve(projectRoot);
    this.#projectFile = resolve(projectFile);
    this.#facets = facets;
  }

  invalidate(): void {
    this.#key = undefined;
    this.#document = undefined;
  }

  async #cacheRoot(): Promise<string> {
    this.#cacheDirectory ??= mkdtemp(join(tmpdir(), "hypit-workbench-programme-"));
    return await this.#cacheDirectory;
  }

  async #bind(file: string, mediaType: string): Promise<BlobRef> {
    const path = resolve(file);
    const held = this.#byFile.get(path);
    if (held !== undefined) {
      const resource = await held;
      if (resource.mediaType !== mediaType) {
        throw new Error(`Programme resource ${path} has conflicting media types.`);
      }
      return resource.ref;
    }
    const pending = (async (): Promise<BoundResource> => {
      const details = await stat(path);
      if (!details.isFile()) throw new Error(`Programme resource ${path} is not a file.`);
      if (!Number.isSafeInteger(details.size)) throw new Error(`Programme resource ${path} is too large.`);
      const resource = `res_${randomUUID()}` as ResourceId;
      const ref: BlobRef = { kind: "blob", resource, size: details.size, mediaType };
      const bound = { ref, file: path, mediaType, size: details.size };
      this.#byResource.set(resource, bound);
      return bound;
    })();
    this.#byFile.set(path, pending);
    try {
      return (await pending).ref;
    } catch (error) {
      this.#byFile.delete(path);
      throw error;
    }
  }

  async #retainFile(file: string, mediaType: string): Promise<BlobRef> {
    const target = join(await this.#cacheRoot(), randomUUID());
    await copyFile(file, target);
    return await this.#bind(target, mediaType);
  }

  async #retainBytes(bytes: Uint8Array, mediaType: string): Promise<BlobRef> {
    const target = join(await this.#cacheRoot(), randomUUID());
    await writeFile(target, bytes);
    return await this.#bind(target, mediaType);
  }

  async #bindPackageResources(): Promise<void> {
    this.#packageResources ??= (async () => {
      const providers = new Set<ResourceId>();
      for (const pack of nleHtmlVideoPackagesFromFacets(this.#facets)) {
        for (const resource of pack.resources ?? []) {
          const ref = resource.artifact;
          if (providers.has(ref.resource)) {
            throw new Error(`Programme package resource ${ref.resource} has multiple providers.`);
          }
          providers.add(ref.resource);
          const existing = this.#byResource.get(ref.resource);
          if (existing !== undefined) {
            if (existing.size !== ref.size || existing.mediaType !== ref.mediaType) {
              throw new Error(`Programme package resource ${ref.resource} conflicts with an existing binding.`);
            }
            continue;
          }
          const bytes = await resource.open();
          if (!(bytes instanceof Uint8Array) || bytes.byteLength !== ref.size) {
            throw new Error(`Programme package resource ${ref.resource} returned unexpected bytes.`);
          }
          const target = join(await this.#cacheRoot(), randomUUID());
          await writeFile(target, bytes);
          this.#byResource.set(ref.resource, {
            ref: structuredClone(ref),
            file: target,
            mediaType: ref.mediaType,
            size: ref.size,
          });
        }
      }
    })();
    try {
      await this.#packageResources;
    } catch (error) {
      this.#packageResources = undefined;
      throw error;
    }
  }

  async #browserAudio(program: AudioProgram): Promise<AudioProgram> {
    if (audioProgramMediaSources(program).length === 0) return program;
    try {
      lowerPlaybackAudio(program, () => "/__hypit_browser_audio_capability__");
      return program;
    } catch {
      // Native media elements cannot select arbitrary container streams or
      // execute every AudioProgram relation. Render the exact closed Programme
      // once, then let browser playback address that one canonical WAV stream.
    }
    const key = JSON.stringify(program);
    let pending = this.#audio.get(key);
    if (pending === undefined) {
      pending = (async () => {
        const execution = createMediaExecutionEnvironment({
          get: async (id) => {
            const resource = this.#byResource.get(id);
            return resource === undefined ? undefined : await readFile(resource.file);
          },
          has: async (id) => this.#byResource.has(id),
          put: async (bytes, mediaType) => await this.#retainBytes(bytes, mediaType),
          write: async () => { throw new Error("Programme preview resources are append-only."); },
        });
        execution.artifacts.open = async (source) => {
          const resource = this.#byResource.get(source.resource);
          return resource === undefined ? undefined : createReadStream(resource.file);
        };
        execution.artifacts.putFile = async (file, mediaType) => await this.#retainFile(file, mediaType);
        const result = await executeRenderAudioProgram(execution, canonicalize({ program }));
        verifyRenderedAudio(result.value);
        const domain = structuredClone(program.domain);
        return sealAudioProgram({
          domain,
          sampling: structuredClone(program.sampling),
          graph: audioProgramGraphFromMediaSources([{
            id: `${domain.id}:workbench-preview-audio`,
            source: {
              source: structuredClone(result.value.artifact),
              streamIndex: 0,
              presentationStart: exactTemporalZero(),
              sourceDomain: structuredClone(domain),
            },
            preparation: identityTemporalMap(domain),
          }]),
        });
      })();
      this.#audio.set(key, pending);
    }
    try {
      return await pending;
    } catch (error) {
      this.#audio.delete(key);
      throw error;
    }
  }

  async #build(project: NleProject, frameRate: TemporalRate): Promise<NleProgrammeDocument> {
    await this.#bindPackageResources();
    const resolveMedia = await createNodeNleMediaResolver(
      this.#projectRoot,
      this.#projectFile,
      project,
      async (manifest) => await resolveMediaAssetMediaFile(
        manifest,
        async (file, mediaType) => await this.#bind(file, mediaType),
      ),
    );
    const host = createNleTerminalLinkHostFromFacets(this.#facets, resolveMedia);
    const linked = linkNleProjectTerminals(project, host);
    const picture = lowerNleAudiovisualToHtmlProgram(
      linked,
      createNleScaledHtmlOutput(project, frameRate),
    );
    const loweredAudio = lowerNleAudiovisualToAudioProgram(
      linked,
      { sampleRate: 48_000 },
      { silenceWhenAbsent: true },
    );
    const audio = await this.#browserAudio(loweredAudio);
    const document = compileHtmlDocument(picture, audio);
    const html = materializeHtmlDocument(document, (artifact) => {
      const bound = this.#byResource.get(artifact.resource);
      if (bound === undefined) {
        throw new Error(`Programme resource ${artifact.resource} has no Workbench file binding.`);
      }
      if (bound.size !== artifact.size || bound.mediaType !== artifact.mediaType) {
        throw new Error(`Programme resource ${artifact.resource} disagrees with its Workbench file binding.`);
      }
      return `/api/nle/programme-resource/${encodeURIComponent(artifact.resource)}?revision=${project.revision}`;
    }, {
      autoplay: false,
      loop: false,
      muted: true,
      responsive: true,
    });
    return { html, frameCount: picture.frameCount };
  }

  async document(project: NleProject, frameRate: TemporalRate): Promise<NleProgrammeDocument> {
    const key = previewKey(project, frameRate);
    if (this.#key !== key || this.#document === undefined) {
      this.#key = key;
      this.#document = this.#build(project, frameRate);
    }
    try {
      return await this.#document;
    } catch (error) {
      if (this.#key === key) this.invalidate();
      throw error;
    }
  }

  resource(id: ResourceId): NleProgrammeResource | undefined {
    const value = this.#byResource.get(id);
    return value === undefined
      ? undefined
      : { file: value.file, mediaType: value.mediaType, size: value.size };
  }

  async close(): Promise<void> {
    const directory = this.#cacheDirectory === undefined
      ? undefined
      : await this.#cacheDirectory.catch(() => undefined);
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
    this.#byFile.clear();
    this.#byResource.clear();
    this.#audio.clear();
    this.#packageResources = undefined;
  }
}
