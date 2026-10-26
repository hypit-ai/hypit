import { assert } from "./process.js";
import { WeightedCapacity } from "./weighted-capacity.js";
import type { CapacityLease } from "./weighted-capacity.js";
import type { FrameSpan } from "@hypit/timeline";

// Bound speculative work per process without making decoder tuning a public
// rendering concept. Actual byte admission can stop the stream earlier.
const defaultDecodeWindowFrames = 16;

export type SourceFrameWindow = FrameSpan & {
  readonly source: string;
};

export type DecodedSourceFrame = {
  readonly frame: number;
  readonly path: string;
  readonly bytes: number;
};

export type SourceFrameLease = {
  readonly release: () => void;
};

type ResidentFrame = DecodedSourceFrame & { capacity: CapacityLease; leases: number; lastUse: number };
type FrameSets = Map<string, Set<number>>;
type Waiter = {
  readonly required: FrameSets;
  readonly preferred: FrameSets;
  readonly resolve: (lease: SourceFrameLease) => void;
  readonly reject: (error: unknown) => void;
};

/**
 * Render-local decoded-source working set. Acquisitions register demand; one
 * pump sees all waiting Workers, while numeric capacity owns resident bytes.
 */
export class SourceFrameStore {
  readonly #maxDecodeFrames: number;
  readonly #decode: (source: string, window: Omit<SourceFrameWindow, "source">) => AsyncIterable<DecodedSourceFrame>;
  readonly #remove: (path: string) => Promise<void>;
  readonly #resident = new Map<string, Map<number, ResidentFrame>>();
  readonly #waiters: Waiter[] = [];
  readonly #activePreferred = new Set<FrameSets>();
  readonly #changes = new Set<() => void>();
  readonly #bytes: WeightedCapacity;
  readonly #signal: AbortSignal | undefined;
  readonly #abort: () => void;
  #pump: Promise<void> | undefined;
  #decodedFrames = 0;
  #decodedBytes = 0;
  #largestDecodedFrameBytes = 0;
  #activeLeases = 0;
  #clock = 0;
  #overflowOwner: Waiter | undefined;
  #failure: unknown;
  #closed = false;

  constructor(args: {
    readonly maxBytes: number;
    readonly maxDecodeFrames?: number;
    readonly decode: (source: string, window: Omit<SourceFrameWindow, "source">) => AsyncIterable<DecodedSourceFrame>;
    readonly remove: (path: string) => Promise<void>;
    readonly signal?: AbortSignal;
  }) {
    assert(args.maxDecodeFrames === undefined
      || Number.isSafeInteger(args.maxDecodeFrames) && args.maxDecodeFrames > 0,
    "Decoded source window must contain a positive number of frames");
    this.#bytes = new WeightedCapacity(args.maxBytes);
    this.#maxDecodeFrames = args.maxDecodeFrames ?? defaultDecodeWindowFrames;
    this.#decode = args.decode;
    this.#remove = args.remove;
    this.#signal = args.signal;
    this.#abort = () => this.fail(args.signal?.reason ?? new Error("Decoded source frame store aborted"));
    args.signal?.addEventListener("abort", this.#abort, { once: true });
    if (args.signal?.aborted) this.#abort();
  }

  get residentBytes(): number { return this.#bytes.used; }
  get peakResidentBytes(): number { return this.#bytes.peak; }
  get decodedFrames(): number { return this.#decodedFrames; }
  get decodedBytes(): number { return this.#decodedBytes; }
  get largestDecodedFrameBytes(): number { return this.#largestDecodedFrameBytes; }

  path(source: string, frame: number): string | undefined {
    return this.#resident.get(source)?.get(frame)?.path;
  }

  /** Required frames remain through one screenshot; preferred frames guide and protect only soft prefetch. */
  acquire(requiredWindows: readonly SourceFrameWindow[], preferredWindows: readonly SourceFrameWindow[] = []): Promise<SourceFrameLease> {
    this.#throwIfStopped();
    const required = frameSets(requiredWindows);
    if (required.size === 0) return Promise.resolve({ release: () => {} });
    const preferred = frameSets(preferredWindows);
    return new Promise<SourceFrameLease>((resolve, reject) => {
      this.#waiters.push({ required, preferred, resolve, reject });
      this.#startPump();
    });
  }

  fail(error: unknown): void {
    if (this.#failure !== undefined || this.#closed) return;
    this.#failure = error;
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
    this.#notify();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#signal?.removeEventListener("abort", this.#abort);
    const error = new Error("Decoded source frame store is closed");
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
    this.#notify();
    await this.#pump?.catch(() => {});
    const frames = [...this.#resident.values()].flatMap(sourceFrames => [...sourceFrames.values()]);
    this.#resident.clear();
    this.#activePreferred.clear();
    for (const frame of frames) frame.capacity.release();
    await Promise.all(frames.map(frame => this.#remove(frame.path)));
  }

  #startPump(): void {
    if (this.#pump !== undefined || this.#closed || this.#failure !== undefined) return;
    const pump = Promise.resolve().then(() => this.#run()).catch((error) => { this.fail(error); }).finally(() => {
      if (this.#pump === pump) this.#pump = undefined;
      if (this.#waiters.length > 0) this.#startPump();
    });
    this.#pump = pump;
  }

  async #run(): Promise<void> {
    while (true) {
      this.#throwIfStopped();
      this.#grantReady();
      const target = this.#waiters[0];
      if (target === undefined) return;
      const job = this.#decodeWindow(target, this.#missing(target.required));
      let expected = job.startFrame;
      for await (const frame of this.#decode(job.source, {
        startFrame: job.startFrame, endFrameExclusive: job.endFrameExclusive,
      })) {
        this.#decodedFrames++;
        this.#decodedBytes += frame.bytes;
        this.#largestDecodedFrameBytes = Math.max(this.#largestDecodedFrameBytes, frame.bytes);
        let retained = false;
        try {
          this.#throwIfStopped();
          assert(frame.frame === expected, `HTML renderer source decoder returned frame ${frame.frame}, expected ${expected}`);
          expected++;
          assert(Number.isSafeInteger(frame.bytes) && frame.bytes > 0, "HTML renderer decoded source frame is empty");
          assert(!this.#resident.get(job.source)?.has(frame.frame),
            `HTML renderer decoded source frame ${frame.frame} more than once concurrently`);
          const hard = target.required.get(job.source)?.has(frame.frame) === true;
          retained = await this.#admit(job.source, frame, this.#requiredDemand(target),
            this.#preferredDemand(target), target, hard);
          if (!retained) break;
          this.#grantReady();
        } finally {
          if (!retained) await this.#remove(frame.path);
        }
      }
    }
  }

  #decodeWindow(target: Waiter, missing: FrameSets): SourceFrameWindow {
    const first = missing.entries().next().value as [string, Set<number>] | undefined;
    assert(first !== undefined, "Decoded source waiter has no missing frame");
    const [source, missingFrames] = first;
    const startFrame = Math.min(...missingFrames);
    const desired = new Set<number>(target.required.get(source));
    for (const frame of target.preferred.get(source) ?? []) desired.add(frame);
    for (const waiter of this.#waiters) {
      for (const frame of waiter.required.get(source) ?? []) desired.add(frame);
      for (const frame of waiter.preferred.get(source) ?? []) desired.add(frame);
    }
    for (const preferred of this.#activePreferred) {
      for (const frame of preferred.get(source) ?? []) desired.add(frame);
    }
    let endFrameExclusive = startFrame + 1;
    while (endFrameExclusive - startFrame < this.#maxDecodeFrames
      && desired.has(endFrameExclusive)
      && !this.#resident.get(source)?.has(endFrameExclusive)) endFrameExclusive++;
    return { source, startFrame, endFrameExclusive };
  }

  async #admit(source: string, frame: DecodedSourceFrame, required: FrameSets,
    preferred: FrameSets, target: Waiter, hard: boolean): Promise<boolean> {
    while (true) {
      await this.#evictFor(frame.bytes, required, hard ? undefined : preferred);
      let capacity = this.#bytes.tryAcquire(frame.bytes);
      if (capacity === undefined) {
        if (!hard) return false;
        if (this.#activeLeases === 0 && (this.#overflowOwner === undefined || this.#overflowOwner === target)) {
          await this.#evictFor(frame.bytes, target.required);
          capacity = this.#bytes.tryAcquire(frame.bytes);
          if (capacity === undefined) {
            this.#overflowOwner = target;
            capacity = this.#bytes.tryAcquire(frame.bytes, true);
          }
        } else {
          await this.#changed();
          this.#throwIfStopped();
          continue;
        }
      }
      assert(capacity !== undefined, "Decoded source capacity was not acquired");
      let resident = this.#resident.get(source);
      if (resident === undefined) { resident = new Map(); this.#resident.set(source, resident); }
      resident.set(frame.frame, { ...frame, capacity, leases: 0, lastUse: ++this.#clock });
      return true;
    }
  }

  #grantReady(): void {
    for (let index = 0; index < this.#waiters.length;) {
      const waiter = this.#waiters[index]!;
      if (!this.#contains(waiter.required)) { index++; continue; }
      this.#waiters.splice(index, 1);
      const leased: ResidentFrame[] = [];
      for (const [source, frames] of waiter.required) for (const frame of frames) {
        const resident = this.#resident.get(source)?.get(frame);
        assert(resident !== undefined, `HTML renderer has no decoded source frame ${frame}`);
        resident.leases++;
        resident.lastUse = ++this.#clock;
        leased.push(resident);
      }
      this.#activeLeases++;
      this.#activePreferred.add(waiter.preferred);
      let released = false;
      waiter.resolve({ release: () => {
        if (released) return;
        released = true;
        for (const frame of leased) {
          assert(frame.leases > 0, "HTML renderer source frame lease underflow");
          frame.leases--;
        }
        this.#activeLeases--;
        this.#activePreferred.delete(waiter.preferred);
        if (this.#overflowOwner === waiter) this.#overflowOwner = undefined;
        this.#notify();
      } });
    }
  }

  #contains(frames: FrameSets): boolean {
    for (const [source, requested] of frames) for (const frame of requested) {
      if (!this.#resident.get(source)?.has(frame)) return false;
    }
    return true;
  }

  #missing(frames: FrameSets): FrameSets {
    const missing = new Map<string, Set<number>>();
    for (const [source, requested] of frames) for (const frame of requested) {
      if (this.#resident.get(source)?.has(frame)) continue;
      let values = missing.get(source);
      if (values === undefined) { values = new Set(); missing.set(source, values); }
      values.add(frame);
    }
    return missing;
  }

  #requiredDemand(target: Waiter): FrameSets {
    return mergeFrameSets(target.required, ...this.#waiters.map(waiter => waiter.required));
  }

  #preferredDemand(target: Waiter): FrameSets {
    return mergeFrameSets(target.preferred, ...this.#waiters.map(waiter => waiter.preferred), ...this.#activePreferred);
  }

  async #evictFor(incomingBytes: number, required: FrameSets, preferred?: FrameSets): Promise<void> {
    const candidates = [...this.#resident.entries()].flatMap(([source, frames]) => [...frames.entries()]
      .filter(([frame, resident]) => resident.leases === 0
        && !required.get(source)?.has(frame) && !preferred?.get(source)?.has(frame))
      .map(([frame, resident]) => ({ source, frame, resident })))
      .sort((left, right) => left.resident.lastUse - right.resident.lastUse);
    const removed: ResidentFrame[] = [];
    for (const candidate of candidates) {
      if (this.#bytes.fits(incomingBytes)) break;
      this.#resident.get(candidate.source)!.delete(candidate.frame);
      candidate.resident.capacity.release();
      removed.push(candidate.resident);
    }
    if (removed.length > 0) this.#notify();
    await Promise.all(removed.map(frame => this.#remove(frame.path)));
  }

  #changed(): Promise<void> {
    return new Promise(resolve => this.#changes.add(resolve));
  }

  #notify(): void {
    const changes = [...this.#changes];
    this.#changes.clear();
    for (const change of changes) change();
  }

  #throwIfStopped(): void {
    if (this.#failure !== undefined) throw this.#failure;
    assert(!this.#closed, "Decoded source frame store is closed");
  }
}

function frameSets(windows: readonly SourceFrameWindow[]): FrameSets {
  const result = new Map<string, Set<number>>();
  for (const window of windows) {
    assert(window.source.length > 0 && Number.isSafeInteger(window.startFrame) && window.startFrame >= 0
      && Number.isSafeInteger(window.endFrameExclusive) && window.endFrameExclusive > window.startFrame,
    "Decoded source frame window is invalid");
    let frames = result.get(window.source);
    if (frames === undefined) { frames = new Set(); result.set(window.source, frames); }
    for (let frame = window.startFrame; frame < window.endFrameExclusive; frame++) frames.add(frame);
  }
  return result;
}

function mergeFrameSets(...inputs: readonly FrameSets[]): FrameSets {
  const result: FrameSets = new Map();
  for (const input of inputs) for (const [source, inputFrames] of input) {
    let frames = result.get(source);
    if (frames === undefined) { frames = new Set(); result.set(source, frames); }
    for (const frame of inputFrames) frames.add(frame);
  }
  return result;
}
