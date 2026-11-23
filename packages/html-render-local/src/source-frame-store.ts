import { WeightedCapacity } from "./weighted-capacity.js";
import type { CapacityLease } from "./weighted-capacity.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const defaultDecodeWindowFrames = 16;

export type SourceFrameWindow = {
  readonly source: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type DecodedSourceFrame = {
  readonly frame: number;
  readonly path: string;
  readonly bytes: number;
};

export type SourceFrameLease = { readonly release: () => void };

type ResidentFrame = DecodedSourceFrame & { capacity: CapacityLease; leases: number; lastUse: number };
type FrameSets = Map<string, Set<number>>;
type Waiter = {
  readonly required: FrameSets;
  readonly preferred: FrameSets;
  readonly signal: AbortSignal | undefined;
  readonly resolve: (lease: SourceFrameLease) => void;
  readonly reject: (error: unknown) => void;
};

/** Shared render-local decoded-frame working set with bounded speculative look-ahead. */
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
    "Decoded source window must contain a positive number of frames.");
    this.#bytes = new WeightedCapacity(args.maxBytes);
    this.#maxDecodeFrames = args.maxDecodeFrames ?? defaultDecodeWindowFrames;
    this.#decode = args.decode;
    this.#remove = args.remove;
    this.#signal = args.signal;
    this.#abort = () => this.fail(args.signal?.reason ?? new Error("Decoded source frame store aborted."));
    args.signal?.addEventListener("abort", this.#abort, { once: true });
    if (args.signal?.aborted) this.#abort();
  }

  path(source: string, frame: number): string | undefined {
    return this.#resident.get(source)?.get(frame)?.path;
  }

  acquire(requiredWindows: readonly SourceFrameWindow[], preferredWindows: readonly SourceFrameWindow[] = [],
    signal?: AbortSignal): Promise<SourceFrameLease> {
    this.#throwIfStopped();
    signal?.throwIfAborted();
    const required = frameSets(requiredWindows);
    if (required.size === 0) return Promise.resolve({ release: () => {} });
    const preferred = frameSets(preferredWindows);
    return new Promise<SourceFrameLease>((resolve, reject) => {
      const abort = () => {
        const index = this.#waiters.indexOf(waiter);
        if (index !== -1) this.#waiters.splice(index, 1);
        reject(signal?.reason);
        this.#notify();
      };
      const waiter: Waiter = {
        required, preferred, signal,
        resolve: lease => { signal?.removeEventListener("abort", abort); resolve(lease); },
        reject: error => { signal?.removeEventListener("abort", abort); reject(error); },
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.#waiters.push(waiter);
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
    const error = new Error("Decoded source frame store is closed.");
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
    this.#notify();
    await this.#pump?.catch(() => {});
    const frames = [...this.#resident.values()].flatMap((source) => [...source.values()]);
    this.#resident.clear();
    this.#activePreferred.clear();
    for (const frame of frames) frame.capacity.release();
    await Promise.all(frames.map((frame) => this.#remove(frame.path)));
  }

  #startPump(): void {
    if (this.#pump !== undefined || this.#closed || this.#failure !== undefined) return;
    const pump = Promise.resolve().then(() => this.#run()).catch((error: unknown) => { this.fail(error); }).finally(() => {
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
      for await (const frame of this.#decode(job.source, job)) {
        let retained = false;
        try {
          this.#throwIfStopped();
          if (target.signal?.aborted) break;
          assert(frame.frame === expected, `Prepared Source decoder returned frame ${frame.frame}, expected ${expected}.`);
          expected += 1;
          assert(Number.isSafeInteger(frame.bytes) && frame.bytes > 0, "Prepared Source decoder emitted an empty frame.");
          assert(!this.#resident.get(job.source)?.has(frame.frame),
            `Prepared Source decoder emitted resident frame ${frame.frame} twice.`);
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
    assert(first !== undefined, "Prepared Source waiter has no missing frame.");
    const [source, missingFrames] = first;
    const startFrame = Math.min(...missingFrames);
    const desired = new Set<number>(target.required.get(source));
    for (const frame of target.preferred.get(source) ?? []) desired.add(frame);
    for (const waiter of this.#waiters) {
      for (const frame of waiter.required.get(source) ?? []) desired.add(frame);
      for (const frame of waiter.preferred.get(source) ?? []) desired.add(frame);
    }
    for (const preferred of this.#activePreferred) for (const frame of preferred.get(source) ?? []) desired.add(frame);
    let endFrameExclusive = startFrame + 1;
    while (endFrameExclusive - startFrame < this.#maxDecodeFrames
      && desired.has(endFrameExclusive)
      && !this.#resident.get(source)?.has(endFrameExclusive)) endFrameExclusive += 1;
    return { source, startFrame, endFrameExclusive };
  }

  async #admit(source: string, frame: DecodedSourceFrame, required: FrameSets,
    preferred: FrameSets, target: Waiter, hard: boolean): Promise<boolean> {
    while (true) {
      if (target.signal?.aborted) return false;
      await this.#evictFor(frame.bytes, required, hard ? undefined : preferred);
      if (target.signal?.aborted) return false;
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
      assert(capacity !== undefined, "Prepared Source capacity was not acquired.");
      let resident = this.#resident.get(source);
      if (resident === undefined) { resident = new Map(); this.#resident.set(source, resident); }
      resident.set(frame.frame, { ...frame, capacity, leases: 0, lastUse: ++this.#clock });
      return true;
    }
  }

  #grantReady(): void {
    for (let index = 0; index < this.#waiters.length;) {
      const waiter = this.#waiters[index]!;
      if (!this.#contains(waiter.required)) { index += 1; continue; }
      this.#waiters.splice(index, 1);
      const leased: ResidentFrame[] = [];
      for (const [source, frames] of waiter.required) for (const frame of frames) {
        const resident = this.#resident.get(source)?.get(frame);
        assert(resident !== undefined, `Prepared Source has no decoded frame ${frame}.`);
        resident.leases += 1;
        resident.lastUse = ++this.#clock;
        leased.push(resident);
      }
      this.#activeLeases += 1;
      this.#activePreferred.add(waiter.preferred);
      let released = false;
      waiter.resolve({ release: () => {
        if (released) return;
        released = true;
        for (const frame of leased) {
          assert(frame.leases > 0, "Prepared Source frame lease underflowed.");
          frame.leases -= 1;
        }
        this.#activeLeases -= 1;
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
    return mergeFrameSets(target.required, ...this.#waiters.map((waiter) => waiter.required));
  }

  #preferredDemand(target: Waiter): FrameSets {
    return mergeFrameSets(target.preferred, ...this.#waiters.map((waiter) => waiter.preferred), ...this.#activePreferred);
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
    await Promise.all(removed.map((frame) => this.#remove(frame.path)));
  }

  #changed(): Promise<void> { return new Promise((resolve) => this.#changes.add(resolve)); }

  #notify(): void {
    const changes = [...this.#changes];
    this.#changes.clear();
    for (const change of changes) change();
  }

  #throwIfStopped(): void {
    if (this.#failure !== undefined) throw this.#failure;
    assert(!this.#closed, "Decoded source frame store is closed.");
  }
}

function frameSets(windows: readonly SourceFrameWindow[]): FrameSets {
  const result = new Map<string, Set<number>>();
  for (const window of windows) {
    assert(window.source.length > 0 && Number.isSafeInteger(window.startFrame) && window.startFrame >= 0
      && Number.isSafeInteger(window.endFrameExclusive) && window.endFrameExclusive > window.startFrame,
    "Decoded source frame window is invalid.");
    let frames = result.get(window.source);
    if (frames === undefined) { frames = new Set(); result.set(window.source, frames); }
    for (let frame = window.startFrame; frame < window.endFrameExclusive; frame += 1) frames.add(frame);
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
