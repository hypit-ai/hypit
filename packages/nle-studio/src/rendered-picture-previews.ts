import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HtmlFrameCapture, HtmlFrameExecutor } from "@hypit/html-video";
import { isPicturePreviewRate, type MediaResource } from "@hypit/media";
import type { ProjectMediaPreviewResource } from "@hypit/media-asset/service";
import { nleCompositionDuration, nleItemEnd, type NleComponentItem, type NleComposition, type NleProject } from "@hypit/nle";
import { prepareNleCompilation, prepareNleComponentPicture, type PreparedNleCompilation } from "@hypit/nle-delivery";
import type { ProjectHost } from "@hypit/project";
import { addExactTemporalValues, compareExactTemporalValues, exactTemporalRational, exactTemporalZero,
  scaleExactTemporalValue, subtractExactTemporalValues,
  type ExactTemporalValue, type TemporalRange } from "@hypit/temporal/algebra";
import { previewCanvas } from "./programme.js";
import type { NleStudioActionObservation, NleStudioRenderedPicturePreviewRequest } from "./protocol.js";
import { studioFrameTime } from "./timeline-planning.js";

type OpenCapture = NonNullable<HtmlFrameExecutor["openCapture"]>;
type Sample = { readonly slot: number; readonly frame: number; readonly block: ProjectMediaPreviewResource };
type CachedFrame = { readonly token: string; readonly resource: MediaResource & { size: number } };
type Action = { readonly abort: AbortController; observation: NleStudioActionObservation };
type Subject = { readonly composition: NleComposition; readonly item?: NleComponentItem };
type PreparedPicture = {
  readonly region: { readonly width: number; readonly height: number };
  readonly constant?: boolean;
  readonly compilePicture: PreparedNleCompilation["compilePicture"];
};
type SampleGrid = { readonly density: bigint; readonly count: number; readonly firstFrame: number; sample(slot: number): Sample };
type PicturePage = {
  readonly program: ReturnType<PreparedPicture["compilePicture"]>;
  readonly ordinals: ReadonlyMap<number, number>;
  capture?: HtmlFrameCapture | undefined;
  idle?: ReturnType<typeof setTimeout> | undefined;
  closing?: Promise<void> | undefined;
};

const cacheBudget = 64 * 1024 * 1024;
const actionLimit = 24;
const pendingLimit = 8;
const maxPositions = 24;
const pageSamples = 120;
const pageLimit = 12;
const openPageLimit = 2;
const idleMs = 15_000;

function sampleGrid(range: TemporalRange, rate: NleProject["editRate"], samplesPerSecond: bigint): SampleGrid {
  const frame = (time: ExactTemporalValue, ceil: boolean) => {
    const seconds = exactTemporalRational(time);
    const numerator = seconds.numerator * BigInt(rate.numerator);
    const denominator = seconds.denominator * BigInt(rate.denominator);
    return (numerator + (ceil ? denominator - 1n : 0n)) / denominator;
  };
  const firstFrame = frame(range.start, true);
  const lastFrame = frame(range.end, true) - 1n;
  if (lastFrame > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Picture preview exceeds the edit frame range.");
  const length = exactTemporalRational(subtractExactTemporalValues(range.end, range.start));
  const count = lastFrame < firstFrame ? 0n : (length.numerator * samplesPerSecond + length.denominator - 1n) / length.denominator;
  if (count > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Picture preview sample grid is too large.");
  const tick = (slot: number): ExactTemporalValue => addExactTemporalValues(range.start,
    { ticks: String(slot), timeBase: { numerator: 1, denominator: Number(samplesPerSecond) } });
  return {
    count: Number(count),
    density: samplesPerSecond,
    firstFrame: Number(firstFrame),
    sample(slot) {
      const start = tick(slot);
      const next = tick(slot + 1);
      const end = compareExactTemporalValues(next, range.end) > 0 ? range.end : next;
      const middle = addExactTemporalValues(start, scaleExactTemporalValue(subtractExactTemporalValues(end, start),
        { numerator: 1, denominator: 2 }));
      const center = frame(middle, false);
      const selected = Number(center < firstFrame ? firstFrame : center > lastFrame ? lastFrame : center);
      return { slot, frame: selected, block: { range: { start, end }, positions: [studioFrameTime(selected, rate)] } };
    },
  };
}

function sampleSlots(positions: readonly ExactTemporalValue[], range: TemporalRange, grid: SampleGrid): readonly Sample[] {
  const result = new Map<number, Sample>();
  for (const position of positions) {
    if (compareExactTemporalValues(position, exactTemporalZero()) < 0) throw new Error("Picture preview positions must be non-negative.");
    if (grid.count === 0 || compareExactTemporalValues(position, range.start) < 0
      || compareExactTemporalValues(position, range.end) >= 0) continue;
    const value = exactTemporalRational(subtractExactTemporalValues(position, range.start));
    const slot = Number(value.numerator * grid.density / value.denominator);
    if (!result.has(slot)) result.set(slot, grid.sample(slot));
  }
  return [...result.values()];
}

/** The Product Session's bounded cache of rendered Picture samples. */
export class RenderedPicturePreviews {
  readonly #compiled = new Map<string, PreparedPicture>();
  readonly #pages = new Map<string, PicturePage>();
  readonly #compiledPages = new Map<string, { readonly program: PicturePage["program"]; readonly ordinals: PicturePage["ordinals"] }>();
  readonly #cache = new Map<string, CachedFrame>();
  readonly #resources = new Map<string, MediaResource>();
  readonly #actions = new Map<string, Action>();
  #bytes = 0;
  #directory: Promise<string> | undefined;
  #queue = Promise.resolve();

  constructor(
    private readonly host: ProjectHost,
    private readonly document: string,
    private readonly openCapture: OpenCapture,
    private readonly publish: (state: NleStudioActionObservation) => void,
  ) {}

  start(request: NleStudioRenderedPicturePreviewRequest, project: NleProject, subject: Subject,
    validate: () => Promise<void>): NleStudioActionObservation {
    if (request.positions.length === 0 || request.positions.length > maxPositions) {
      throw new Error("Picture source preview requires one to 24 positions.");
    }
    const completed = [...this.#actions].filter(([, { observation }]) =>
      observation.state !== "queued" && observation.state !== "running");
    if (this.#actions.size - completed.length >= pendingLimit) throw new Error("Picture preview queue is full.");
    for (const [handle] of completed.slice(0, Math.max(0, this.#actions.size - actionLimit + 1))) this.#actions.delete(handle);
    const density = request.samplesPerSecond ?? 2;
    if (!isPicturePreviewRate(density)) throw new Error("Picture preview requires a supported sampling density.");
    const { composition, item } = subject;
    const range = item === undefined ? { start: exactTemporalZero(), end: nleCompositionDuration(composition) }
      : { start: item.start, end: nleItemEnd(item) };
    const grid = sampleGrid(range, project.editRate, BigInt(density));
    const samples = sampleSlots(request.positions, range, grid);
    const uncovered = grid.count === 0 && request.positions.some(position =>
      compareExactTemporalValues(position, range.start) >= 0 && compareExactTemporalValues(position, range.end) < 0);
    const handle = randomUUID();
    const observation = { handle, kind: request.kind, state: "queued", progress: 0 } as const;
    const action = { observation, abort: new AbortController() };
    this.#actions.set(handle, action);
    this.publish(observation);
    this.#queue = this.#queue.then(() => this.#run(action, project, subject, request.version, range, grid, samples, uncovered, validate));
    return observation;
  }

  async #prepare(project: NleProject, { composition, item }: Subject, signal: AbortSignal): Promise<PreparedPicture> {
    const input = { host: this.host, document: this.document, snapshot: project, composition: composition.id, signal };
    if (item === undefined) {
      const { compilePicture } = await prepareNleCompilation({ ...input, pictureOnly: true });
      return { compilePicture, region: composition.canvas };
    }
    return await prepareNleComponentPicture({ ...input, item: item.id });
  }

  #closePage(page: PicturePage): Promise<void> | undefined {
    clearTimeout(page.idle);
    page.idle = undefined;
    if (page.capture !== undefined) {
      page.closing = page.capture.close();
      page.capture = undefined;
    }
    return page.closing;
  }

  async #pageFingerprint(program: PicturePage["program"]): Promise<string> {
    const resources = [...new Set([
      ...program.artifacts.filter(artifact => artifact.usage.kind !== "never").map(artifact => artifact.resource.address),
      ...program.videoSources.filter(source => source.usage.kind !== "never").map(source => source.resource.address),
    ])];
    const versions = await Promise.all(resources.map(async address => {
      const file = await stat(address, { bigint: true });
      return [file.dev, file.ino, file.size, file.mtimeNs, file.ctimeNs].join(":");
    }));
    return createHash("sha256").update(JSON.stringify([program, versions])).digest("hex");
  }

  async #captureSamples(compilation: PreparedPicture, rate: NleProject["editRate"], version: string,
    grid: SampleGrid, samples: readonly Sample[], signal: AbortSignal): Promise<ReadonlyMap<number, CachedFrame>> {
    const groups = new Map<number, Sample[]>();
    for (const sample of samples) {
      const first = compilation.constant ? 0 : Math.floor(sample.slot / pageSamples) * pageSamples;
      const group = groups.get(first) ?? [];
      group.push(sample);
      groups.set(first, group);
    }
    const results = new Map<number, CachedFrame>();
    for (const [first, wanted] of groups) {
      signal.throwIfAborted();
      const requestKey = `${version}:${compilation.constant ? "constant" : grid.density}:${first}`;
      let compiled = this.#compiledPages.get(requestKey);
      if (compiled === undefined) {
        const count = compilation.constant ? 1 : Math.min(pageSamples, grid.count - first);
        // A still can use any valid frame inside the placement. Reuse the same sample at every density.
        const firstFrame = compilation.constant ? grid.firstFrame : undefined;
        const frames = firstFrame === undefined
          ? [...new Set(Array.from({ length: count }, (_, index) => grid.sample(first + index).frame))]
          : [firstFrame];
        const canvas = { ...previewCanvas(compilation.region, 320), background: "transparent" };
        compiled = { program: compilation.compilePicture({ frameRate: rate, canvas, frames }),
          ordinals: new Map(frames.map((frame, index) => [frame, index])) };
      }
      this.#compiledPages.delete(requestKey);
      this.#compiledPages.set(requestKey, compiled);
      if (this.#compiledPages.size > 24) this.#compiledPages.delete(this.#compiledPages.keys().next().value!);

      const key = await this.#pageFingerprint(compiled.program);
      const ordinals = wanted.map(sample => compilation.constant ? 0 : compiled.ordinals.get(sample.frame)!);
      const available = new Map<number, CachedFrame>();
      const missing: number[] = [];
      for (const ordinal of new Set(ordinals)) {
        const frameKey = `${key}:${ordinal}`;
        const cached = this.#cache.get(frameKey);
        if (cached === undefined) { missing.push(ordinal); continue; }
        this.#cache.delete(frameKey);
        this.#cache.set(frameKey, cached);
        available.set(ordinal, cached);
      }
      if (missing.length > 0) {
        const images = await this.#capturePage(key, compiled, missing, signal);
        if (await this.#pageFingerprint(compiled.program) !== key) {
          throw new Error("A Picture resource changed during sampling.");
        }
        const directory = await (this.#directory ??= mkdtemp(join(tmpdir(), "hypit-picture-preview-")));
        for (const [index, ordinal] of missing.entries()) {
          signal.throwIfAborted();
          const bytes = images[index]!;
          const token = randomUUID();
          const address = join(directory, token + ".png");
          await writeFile(address, bytes, { signal });
          const resource = { address, size: bytes.byteLength, mediaType: "image/png" };
          const cached = { token, resource };
          this.#cache.set(`${key}:${ordinal}`, cached);
          this.#resources.set(token, resource);
          this.#bytes += bytes.byteLength;
          available.set(ordinal, cached);
        }
      }
      for (const [index, sample] of wanted.entries()) results.set(sample.slot, available.get(ordinals[index]!)!);
    }
    return results;
  }

  async #capturePage(key: string, compiled: Pick<PicturePage, "program" | "ordinals">,
    missing: readonly number[], signal: AbortSignal): Promise<readonly Uint8Array[]> {
    const page: PicturePage = this.#pages.get(key) ?? { ...compiled };
    this.#pages.delete(key);
    this.#pages.set(key, page);
    if (this.#pages.size > pageLimit) {
      const [oldKey, oldest] = this.#pages.entries().next().value!;
      this.#pages.delete(oldKey);
      await this.#closePage(oldest)?.catch(() => undefined);
    }
    const open = [...this.#pages.values()].filter(value => value.capture !== undefined);
    clearTimeout(page.idle);
    try {
      if (page.capture === undefined) {
        if (open.length >= openPageLimit) await this.#closePage(open[0]!)?.catch(() => undefined);
        await page.closing?.catch(() => undefined);
        page.closing = undefined;
        signal.throwIfAborted();
        // Cancel opening with this Action. The resulting page can serve other Actions.
        const opening = new AbortController();
        const abort = () => opening.abort(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        try { page.capture = await this.openCapture({ program: page.program, picture: { alpha: "straight" } }, opening.signal); }
        finally { signal.removeEventListener("abort", abort); }
      }
      const images = await page.capture.captureFrames(missing, signal);
      if (images.length !== missing.length) throw new Error("Picture preview returned an incomplete picture batch.");
      page.idle = setTimeout(() => { void this.#closePage(page)?.catch(() => undefined); }, idleMs).unref();
      return images;
    } catch (error) {
      await this.#closePage(page)?.catch(() => undefined);
      throw error;
    }
  }

  async #run(action: Action, project: NleProject, subject: Subject, version: string, range: TemporalRange,
    grid: SampleGrid, samples: readonly Sample[], uncovered: boolean, validate: () => Promise<void>): Promise<void> {
    const { handle, kind } = action.observation;
    const update = (observation: NleStudioActionObservation) => {
      action.observation = observation;
      this.publish(observation);
    };
    const signal = AbortSignal.any([action.abort.signal, AbortSignal.timeout(60_000)]);
    try {
      signal.throwIfAborted();
      update({ handle, kind, state: "running", progress: 0 });
      await validate();
      const blocks: ProjectMediaPreviewResource[] = uncovered ? [{ range }] : [];
      if (samples.length > 0) {
        const compilation = this.#compiled.get(version) ?? await this.#prepare(project, subject, signal);
        this.#compiled.delete(version);
        this.#compiled.set(version, compilation);
        if (this.#compiled.size > 4) this.#compiled.delete(this.#compiled.keys().next().value!);
        const batch = compilation.constant ? samples.slice(0, 1) : samples;
        const images = await this.#captureSamples(compilation, project.editRate, version, grid, batch, signal);
        await validate();
        for (const sample of batch) {
          const { token } = images.get(sample.slot)!;
          blocks.push({ ...(compilation.constant ? { range } : sample.block), resource: `api/resources/${token}`,
            displayAspectRatio: compilation.region.width / compilation.region.height });
        }
      }
      signal.throwIfAborted();
      update({ handle, kind, state: "complete", progress: 1, result: { blocks } });
    } catch (error) {
      update(action.abort.signal.aborted ? { handle, kind, state: "cancelled", progress: 0 }
        : { handle, kind, state: "failed", progress: 0, diagnostic: error instanceof Error ? error.message : String(error) });
    } finally {
      // Keep the freshly returned blocks readable. A batch at this output size fits within the byte budget.
      for (const [id, entry] of this.#cache) {
        if (this.#bytes <= cacheBudget) break;
        this.#cache.delete(id);
        this.#resources.delete(entry.token);
        this.#bytes -= entry.resource.size;
        await rm(entry.resource.address, { force: true }).catch(() => undefined);
      }
    }
  }

  observe(handle: string): NleStudioActionObservation | undefined { return this.#actions.get(handle)?.observation; }
  resource(token: string): MediaResource | undefined { return this.#resources.get(token); }
  cancel(handle: string): NleStudioActionObservation | undefined {
    const action = this.#actions.get(handle);
    action?.abort.abort();
    return action?.observation;
  }

  async close(): Promise<void> {
    for (const action of this.#actions.values()) action.abort.abort();
    await this.#queue;
    await Promise.allSettled([...this.#pages.values()].map(page => this.#closePage(page)));
    const directory = await this.#directory?.catch(() => undefined);
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
    this.#resources.clear();
    this.#cache.clear();
    this.#compiled.clear();
    this.#compiledPages.clear();
    this.#pages.clear();
    this.#actions.clear();
  }
}
