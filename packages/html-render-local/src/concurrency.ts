import { availableParallelism, totalmem } from "node:os";

function hostMemory(): number {
  const constrained = process.constrainedMemory?.() ?? 0;
  return constrained > 0 ? Math.min(totalmem(), constrained) : totalmem();
}

/** Stable browser-process ceiling for one local capture action. */
export function autoHtmlWorkerLimit(cpu = availableParallelism(), memory = hostMemory()): number {
  const byMemory = Math.floor(memory / 2 / (1.5 * 1024 ** 3));
  return Math.max(1, Math.min(Math.max(1, cpu - 2), byMemory));
}

export type HtmlWorkerPlan = { readonly limit: number; readonly automatic: boolean };

/** Validate the caller's ceiling without deciding the attempt's final live count. */
export function htmlWorkerPlan(config: {
  readonly workers?: number | "auto";
  readonly maxWorkers?: number;
}, frames: number, framesPerSecond?: number): HtmlWorkerPlan {
  const workers = config.workers ?? "auto";
  const maximum = config.maxWorkers ?? autoHtmlWorkerLimit();
  if (!Number.isSafeInteger(maximum) || maximum < 1
    || workers !== "auto" && (!Number.isSafeInteger(workers) || workers < 1)) {
    throw new Error("HTML capture worker configuration is invalid.");
  }
  const useful = framesPerSecond === undefined ? frames : Math.max(1, Math.ceil(frames / framesPerSecond));
  return {
    limit: Math.min(frames, workers === "auto" ? Math.min(maximum, useful) : workers),
    automatic: workers === "auto",
  };
}

/** Roughly one second of output per batch, split evenly across the exact range. */
export function captureBatches(frameCount: number, framesPerSecond: number, workers: number): readonly {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
}[] {
  const count = Math.max(workers, Math.ceil(frameCount / Math.max(1, Math.round(framesPerSecond))));
  const active = Math.min(frameCount, count);
  return Array.from({ length: active }, (_, index) => ({
    startFrame: Math.floor(index * frameCount / active),
    endFrameExclusive: Math.floor((index + 1) * frameCount / active),
  }));
}

/** Online controller driven only by completed production batches. */
export class CaptureConcurrency {
  target: number;
  #since: number | undefined;
  #frames = 0;
  #batches = 0;
  #baseline: { readonly workers: number; readonly rate: number } | undefined;
  #previousRate: number | undefined;
  #growth = true;

  constructor(readonly limit: number, readonly automatic: boolean) {
    this.target = automatic ? Math.max(1, Math.ceil(limit / 2)) : limit;
  }

  settled(now: number): void {
    this.#since = now;
    this.#frames = 0;
    this.#batches = 0;
  }

  complete(input: {
    readonly now: number;
    readonly frames: number;
    readonly remainingFrames: number;
    readonly startupMs: number;
    readonly active: number;
  }): void {
    if (!this.automatic) return;
    if (input.active !== this.target) { this.#since = undefined; return; }
    if (this.#since === undefined) { this.settled(input.now); return; }
    this.#frames += input.frames;
    this.#batches += 1;
    const elapsed = input.now - this.#since;
    if (this.#batches < this.target * 2 || elapsed < Math.max(1_000, input.startupMs)) return;
    const rate = this.#frames * 1_000 / elapsed;
    let next = this.target;
    if (this.#baseline !== undefined) {
      const before = this.#baseline;
      this.#baseline = undefined;
      const added = this.target > before.workers;
      if (rate < before.rate * (added ? 1.05 : 0.95)) {
        next = before.workers;
        this.#growth = false;
      }
    } else if (this.#previousRate !== undefined && rate < this.#previousRate * 0.7 && this.target > 1
      && input.remainingFrames > this.#frames * 2) {
      this.#baseline = { workers: this.target, rate };
      next -= 1;
      this.#growth = false;
    }
    if (next === this.target && this.#growth && next < this.limit
      && input.remainingFrames / rate * 1_000 > input.startupMs * (next + 1) * 2) {
      this.#baseline = { workers: this.target, rate };
      next += 1;
    }
    this.#previousRate = rate;
    this.settled(input.now);
    if (next === this.target) return;
    this.target = next;
    this.#since = undefined;
  }
}
