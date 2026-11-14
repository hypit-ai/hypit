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
import { verifyRenderedAudio } from "@hypit/media";
import type { NleProject } from "@hypit/nle";
import { createMediaExecutionEnvironment, executeRenderAudioProgram } from "@hypit/media-local";
import {
  closePreparedNleProgramme,
  prepareNodeNleProgramme,
  type PreparedNodeNleProgramme,
} from "@hypit/nle-local";
import { canonicalize, type BlobRef, type ResourceId } from "@hypit/protocol";
import type { ResourceStore } from "@hypit/resource-store";
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

function previewKey(generation: number, frameRate: TemporalRate): string {
  return `${generation}:${frameRate.numerator}/${frameRate.denominator}`;
}

/**
 * Invocation-local Programme derivation for the open NLE Project.
 *
 * Component and Media owners still produce the terminal programmes. The application service
 * only binds project files to loopback URLs and closes those programmes into a
 * browser document. Neither the document nor its resource identities enter the
 * NLE Project or Timeline View.
 */
export class NleProgrammePreview {
  readonly #facets: readonly Facet[];
  readonly #resourceUrl: (resource: ResourceId, generation: number) => string;
  readonly #projectRoot: string;
  readonly #projectFile: string;
  readonly #byFile = new Map<string, Promise<BoundResource>>();
  readonly #byResource = new Map<ResourceId, BoundResource>();
  readonly #audio = new Map<string, Promise<AudioProgram>>();
  #cacheDirectory: Promise<string> | undefined;
  #preparedGeneration: number | undefined;
  #prepared: Promise<PreparedNodeNleProgramme> | undefined;
  readonly #prepareControllers = new Set<AbortController>();
  #key: string | undefined;
  #document: Promise<NleProgrammeDocument> | undefined;
  #buildController: AbortController | undefined;
  #generation = 0;

  constructor(
    projectRoot: string,
    projectFile: string,
    facets: readonly Facet[] = [],
    resourceUrl: (resource: ResourceId, generation: number) => string = (resource, generation) =>
      `/api/nle/programme-resource/${encodeURIComponent(resource)}?generation=${generation}`,
  ) {
    this.#projectRoot = resolve(projectRoot);
    this.#projectFile = resolve(projectFile);
    this.#facets = facets;
    this.#resourceUrl = resourceUrl;
  }

  invalidate(): void {
    this.#buildController?.abort();
    this.#buildController = undefined;
    this.#generation += 1;
    this.#preparedGeneration = undefined;
    this.#prepared = undefined;
    this.#key = undefined;
    this.#document = undefined;
  }

  get generation(): number {
    return this.#generation;
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

  async #retainDeclared(ref: BlobRef, bytes: Uint8Array, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (bytes.byteLength !== ref.size) {
      throw new Error(`Programme resource ${ref.resource} has ${bytes.byteLength} bytes, expected ${ref.size}.`);
    }
    const existing = this.#byResource.get(ref.resource);
    if (existing !== undefined) {
      if (existing.size !== ref.size || existing.mediaType !== ref.mediaType) {
        throw new Error(`Programme resource ${ref.resource} conflicts with an existing binding.`);
      }
      return;
    }
    const target = join(await this.#cacheRoot(), randomUUID());
    await writeFile(target, bytes, signal === undefined ? {} : { signal });
    this.#byResource.set(ref.resource, {
      ref: structuredClone(ref),
      file: target,
      mediaType: ref.mediaType,
      size: ref.size,
    });
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

  #executionResources(): ResourceStore {
    return {
      get: async (id, options = {}) => {
        options.signal?.throwIfAborted();
        const resource = this.#byResource.get(id);
        return resource === undefined ? undefined : await readFile(resource.file);
      },
      has: async (id, options = {}) => {
        options.signal?.throwIfAborted();
        return this.#byResource.has(id);
      },
      put: async (bytes, mediaType, options = {}) => {
        options.signal?.throwIfAborted();
        return await this.#retainBytes(bytes, mediaType);
      },
      write: async () => {
        throw new Error("Programme preview resources are append-only.");
      },
    };
  }

  /** Return the linked audiovisual graph for exactly one live Programme generation. */
  async prepared(
    project: NleProject,
    generation = this.#generation,
    allowStale = false,
  ): Promise<PreparedNodeNleProgramme> {
    if (!allowStale && generation !== this.#generation) throw new Error("NLE Programme generation is stale.");
    if (this.#preparedGeneration !== generation || this.#prepared === undefined) {
      const controller = new AbortController();
      this.#prepareControllers.add(controller);
      this.#preparedGeneration = generation;
      const resources = this.#executionResources();
      this.#prepared = prepareNodeNleProgramme({
        projectRoot: this.#projectRoot,
        projectFile: this.#projectFile,
        project,
        facets: this.#facets,
        resources: {
          store: resources,
          bindFile: async (file, mediaType, signal) => {
            signal?.throwIfAborted();
            return await this.#bind(file, mediaType);
          },
          write: async (resource, bytes, signal) => await this.#retainDeclared(resource, bytes, signal),
        },
        signal: controller.signal,
      });
      void this.#prepared.finally(() => this.#prepareControllers.delete(controller)).catch(() => undefined);
    }
    try {
      const prepared = await this.#prepared;
      if (!allowStale && generation !== this.#generation) throw new Error("NLE Programme generation is stale.");
      return prepared;
    } catch (error) {
      if (this.#preparedGeneration === generation) {
        this.#preparedGeneration = undefined;
        this.#prepared = undefined;
      }
      throw error;
    }
  }

  async #build(
    project: NleProject,
    frameRate: TemporalRate,
    generation: number,
    signal: AbortSignal,
  ): Promise<NleProgrammeDocument> {
    signal.throwIfAborted();
    const programme = await this.prepared(project, generation);
    signal.throwIfAborted();
    const closed = await closePreparedNleProgramme({
      programme,
      frameRate,
      signal,
    });
    const picture = closed.visual;
    signal.throwIfAborted();
    const audio = await this.#browserAudio(closed.audio);
    signal.throwIfAborted();
    const document = compileHtmlDocument(picture, audio);
    const html = materializeHtmlDocument(document, (artifact) => {
      const bound = this.#byResource.get(artifact.resource);
      if (bound === undefined) {
        throw new Error(`Programme resource ${artifact.resource} has no application file binding.`);
      }
      if (bound.size !== artifact.size || bound.mediaType !== artifact.mediaType) {
        throw new Error(`Programme resource ${artifact.resource} disagrees with its application file binding.`);
      }
      return this.#resourceUrl(artifact.resource, generation);
    }, {
      autoplay: false,
      loop: false,
      muted: true,
      responsive: true,
    });
    return { html, frameCount: picture.frameCount };
  }

  async document(
    project: NleProject,
    frameRate: TemporalRate,
    generation = this.#generation,
  ): Promise<NleProgrammeDocument> {
    if (generation !== this.#generation) throw new Error("NLE Programme preview generation is stale.");
    const key = previewKey(generation, frameRate);
    if (this.#key !== key || this.#document === undefined) {
      this.#buildController?.abort();
      const controller = new AbortController();
      this.#buildController = controller;
      this.#key = key;
      this.#document = this.#build(project, frameRate, generation, controller.signal);
    }
    try {
      const document = await this.#document;
      if (generation !== this.#generation) throw new Error("NLE Programme preview generation is stale.");
      return document;
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
    for (const controller of this.#prepareControllers) controller.abort();
    this.#prepareControllers.clear();
    this.#buildController?.abort();
    this.#buildController = undefined;
    const directory = this.#cacheDirectory === undefined
      ? undefined
      : await this.#cacheDirectory.catch(() => undefined);
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
    this.#byFile.clear();
    this.#byResource.clear();
    this.#audio.clear();
    this.#preparedGeneration = undefined;
    this.#prepared = undefined;
  }
}
