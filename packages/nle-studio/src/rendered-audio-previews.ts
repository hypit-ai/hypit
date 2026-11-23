import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWaveformPreviewResolution, mediaPreviewSampleRate, waveformPeaksPerBlock } from "@hypit/media";
import type { ProjectMediaPreviewResource } from "@hypit/media-asset/service";
import { pcmSampleIndex, readAudioProgramWaveformPeaksLocally, type LocalMediaToolchainOptions } from "@hypit/media-local";
import type { NleProject } from "@hypit/nle";
import { prepareNleCompositionAudio } from "@hypit/nle-delivery";
import type { ProjectHost, ProjectHostResourceResolution } from "@hypit/project";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import type { NleStudioActionObservation, NleStudioRenderedAudioPreviewRequest } from "./protocol.js";

type Program = NonNullable<Awaited<ReturnType<typeof prepareNleCompositionAudio>>>;
type Action = { readonly abort: AbortController; observation: NleStudioActionObservation };
type CachedBlock = {
  readonly token: string;
  readonly resource: ProjectHostResourceResolution & { readonly size: number };
  readonly block: ProjectMediaPreviewResource;
};

const sampleRate = mediaPreviewSampleRate;
const profile = { sampleRate, channels: 2 } as const;
const cacheBudget = 24 * 1024 * 1024;
const batchSamples = sampleRate * 30;

function sampleTime(sample: number): ExactTemporalValue {
  return { ticks: String(sample), timeBase: { numerator: 1, denominator: sampleRate } };
}

async function fingerprint(program: Program): Promise<string> {
  const addresses = [...new Set(Object.values(program.nodes).flatMap(node =>
    node.kind === "media" ? [node.media.resource.address] : []))];
  const sources = await Promise.all(addresses.map(async address => {
    const file = await stat(address, { bigint: true });
    return [file.dev, file.ino, file.size, file.mtimeNs, file.ctimeNs].join(":");
  }));
  return createHash("sha256").update(JSON.stringify([program, sources])).digest("hex");
}

/** Reusable mixes sampled at fixed positions on the child Composition clock. */
export class RenderedAudioPreviews {
  readonly #compiled = new Map<string, Program | undefined>();
  readonly #blocks = new Map<string, CachedBlock>();
  readonly #resources = new Map<string, ProjectHostResourceResolution>();
  readonly #actions = new Map<string, Action>();
  #bytes = 0;
  #directory: Promise<string> | undefined;
  #queue = Promise.resolve();

  constructor(private readonly host: ProjectHost, private readonly document: string,
    private readonly tools: LocalMediaToolchainOptions,
    private readonly publish: (state: NleStudioActionObservation) => void) {}

  start(request: NleStudioRenderedAudioPreviewRequest, project: NleProject,
    validate: () => Promise<void>): NleStudioActionObservation {
    if (!isWaveformPreviewResolution(request.samplesPerPeak) || request.blocks.length < 1 || request.blocks.length > 64
      || !request.blocks.every(index => Number.isSafeInteger(index) && index >= 0)) {
      throw new Error("Audio source preview requires a PCM resolution and one to 64 block indices.");
    }
    const completed = [...this.#actions].filter(([, { observation }]) =>
      observation.state !== "queued" && observation.state !== "running");
    if (this.#actions.size - completed.length >= 8) throw new Error("Audio preview queue is full.");
    for (const [handle] of completed.slice(0, Math.max(0, this.#actions.size - 63))) this.#actions.delete(handle);
    const observation = { handle: randomUUID(), kind: request.kind, state: "queued", progress: 0 } as const;
    const action = { observation, abort: new AbortController() };
    this.#actions.set(observation.handle, action);
    this.publish(observation);
    this.#queue = this.#queue.then(() => this.#run(action, request, project, validate));
    return observation;
  }

  async #sample(program: Program, { blocks, samplesPerPeak }: NleStudioRenderedAudioPreviewRequest,
    signal: AbortSignal): Promise<readonly ProjectMediaPreviewResource[]> {
    const total = pcmSampleIndex(program.domain.duration, sampleRate);
    const blockSamples = samplesPerPeak * waveformPeaksPerBlock;
    const indices = [...new Set(blocks)].filter(index => index < total / blockSamples).sort((a, b) => a - b);
    if (indices.length === 0) return [];
    const version = await fingerprint(program);
    const key = (index: number) => `${version}:${samplesPerPeak}:${index}`;
    const range = (first: number, after: number) => ({
      start: sampleTime(first * blockSamples),
      end: after >= total / blockSamples ? program.domain.duration : sampleTime(after * blockSamples),
    });
    const results = new Map<number, ProjectMediaPreviewResource>();
    const missing = indices.filter(index => {
      const id = key(index);
      const cached = this.#blocks.get(id);
      if (cached === undefined) return true;
      this.#blocks.delete(id);
      this.#blocks.set(id, cached);
      results.set(index, cached.block);
      return false;
    });
    for (let i = 0; i < missing.length;) {
      signal.throwIfAborted();
      let end = i + 1;
      while (end < missing.length && missing[end] === missing[end - 1]! + 1
        && (end - i + 1) * blockSamples <= batchSamples) end += 1;
      const envelope = await readAudioProgramWaveformPeaksLocally({ program, samplesPerPeak, tools: this.tools, signal,
        range: range(missing[i]!, missing[end - 1]! + 1) });
      if (await fingerprint(program) !== version) throw new Error("An Audio resource changed during sampling.");
      const directory = await (this.#directory ??= mkdtemp(join(tmpdir(), "hypit-audio-preview-")));
      for (let offset = 0; i + offset < end; offset += 1) {
        signal.throwIfAborted();
        const index = missing[i + offset]!;
        const token = randomUUID();
        const address = join(directory, `${token}.json`);
        const firstPeak = offset * waveformPeaksPerBlock;
        const bytes = Buffer.from(JSON.stringify({
          ...envelope, sampleCount: Math.min(blockSamples, envelope.sampleCount - offset * blockSamples),
          peaks: envelope.peaks.slice(firstPeak, firstPeak + waveformPeaksPerBlock),
        }));
        await writeFile(address, bytes, { signal });
        const resource = { address, mediaType: "application/json", size: bytes.byteLength };
        const block = { range: range(index, index + 1), samplesPerPeak, resource: `api/resources/${token}` };
        this.#resources.set(token, resource);
        this.#blocks.set(key(index), { token, resource, block });
        this.#bytes += resource.size;
        results.set(index, block);
      }
      i = end;
    }
    return indices.map(index => results.get(index)!);
  }

  async #run(action: Action, request: NleStudioRenderedAudioPreviewRequest, project: NleProject,
    validate: () => Promise<void>): Promise<void> {
    const { handle, kind } = action.observation;
    const update = (observation: NleStudioActionObservation) => {
      action.observation = observation;
      this.publish(observation);
    };
    const signal = AbortSignal.any([action.abort.signal, AbortSignal.timeout(120_000)]);
    try {
      signal.throwIfAborted();
      update({ handle, kind, state: "running", progress: 0 });
      await validate();
      const { version, target: { composition } } = request;
      const program = this.#compiled.has(version) ? this.#compiled.get(version)
        : await prepareNleCompositionAudio({ host: this.host, document: this.document, snapshot: project,
          composition, profile, signal });
      this.#compiled.delete(version);
      this.#compiled.set(version, program);
      if (this.#compiled.size > 8) this.#compiled.delete(this.#compiled.keys().next().value!);
      const blocks = program === undefined ? [] : await this.#sample(program, request, signal);
      await validate();
      signal.throwIfAborted();
      update({ handle, kind, state: "complete", progress: 1, result: { blocks } });
    } catch (error) {
      update(action.abort.signal.aborted ? { handle, kind, state: "cancelled", progress: 0 }
        : { handle, kind, state: "failed", progress: 0, diagnostic: error instanceof Error ? error.message : String(error) });
    } finally {
      for (const [id, entry] of this.#blocks) {
        if (this.#bytes <= cacheBudget) break;
        this.#blocks.delete(id);
        this.#resources.delete(entry.token);
        this.#bytes -= entry.resource.size;
        await rm(entry.resource.address, { force: true }).catch(() => undefined);
      }
    }
  }

  observe(handle: string): NleStudioActionObservation | undefined { return this.#actions.get(handle)?.observation; }
  resource(token: string): ProjectHostResourceResolution | undefined { return this.#resources.get(token); }
  cancel(handle: string): NleStudioActionObservation | undefined {
    const action = this.#actions.get(handle);
    if (action?.observation.state === "queued" || action?.observation.state === "running") action.abort.abort();
    return action?.observation;
  }

  async close(): Promise<void> {
    for (const action of this.#actions.values()) action.abort.abort();
    await this.#queue;
    const directory = await this.#directory?.catch(() => undefined);
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
    this.#compiled.clear();
    this.#blocks.clear();
    this.#resources.clear();
    this.#actions.clear();
  }
}
