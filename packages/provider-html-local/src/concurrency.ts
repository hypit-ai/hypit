import { availableParallelism, totalmem } from "node:os";

function hostMemory(): number {
  const constrained = process.constrainedMemory?.() ?? 0;
  return constrained > 0 ? Math.min(totalmem(), constrained) : totalmem();
}

/** Stable reservation ceiling. Actual load tuning happens inside the admitted render. */
export function autoWorkerLimit(cpu = availableParallelism(), memory = hostMemory()): number {
  // Chrome owns raster surfaces, decoded media and the JS heap in separate
  // processes. Leave half the memory and two CPU slots to the host/other stages.
  const byMemory = Math.floor(memory / 2 / (1.5 * 1024 ** 3));
  return Math.max(1, Math.min(Math.max(1, cpu - 2), byMemory));
}

/** Exact browser reservation shared by Runtime admission and the admitted capture attempt. */
export function renderWorkerLimit(
  config: { readonly maxWorkers: number; readonly workers: "auto" | number },
  frameCount: number,
  fps: number,
  gpuVideo = false,
): number {
  // One GPU scene shares its source decoders and cache across the full timeline.
  if (config.workers === "auto" && gpuVideo) return 1;
  return Math.min(config.maxWorkers, config.workers === "auto" ? Math.max(1, Math.ceil(frameCount / fps)) : frameCount);
}

/**
 * Online throughput comparison of useful capture batches. All samples and
 * decisions die with this attempt. A change never invalidates captured frames.
 */
export class CaptureConcurrency {
  target: number;
  private since: number | undefined;
  private frames = 0;
  private batches = 0;
  private baseline: { workers: number; rate: number } | undefined;
  private previousRate: number | undefined;
  private growth = true;

  constructor(readonly limit: number, readonly automatic: boolean) {
    this.target = automatic ? Math.max(1, Math.ceil(limit / 2)) : limit;
  }

  settled(now: number): void {
    this.since = now;
    this.frames = 0;
    this.batches = 0;
  }

  complete(input: { now: number; frames: number; remainingFrames: number; startupMs: number; active: number }):
    { workers: number; reason: string; fps: number } | undefined {
    if (!this.automatic) return;
    if (input.active !== this.target) { this.since = undefined; return; }
    if (this.since === undefined) { this.settled(input.now); return; }
    this.frames += input.frames;
    this.batches++;
    const elapsed = input.now - this.since;
    // At least two batches per worker and a browser startup's worth of useful
    // work amortize short fluctuations. No synthetic calibration is rendered.
    if (this.batches < this.target * 2 || elapsed < Math.max(1_000, input.startupMs)) return;
    const rate = this.frames * 1_000 / elapsed;
    let next = this.target;
    let reason = "";
    if (this.baseline !== undefined) {
      const before = this.baseline;
      this.baseline = undefined;
      const added = this.target > before.workers;
      if (rate < before.rate * (added ? 1.05 : 0.95)) {
        next = before.workers;
        reason = added ? "extra browser did not improve throughput" : "fewer browsers reduced throughput";
        this.growth = false;
      }
    } else if (this.previousRate !== undefined && rate < this.previousRate * 0.7 && this.target > 1
      && input.remainingFrames > this.frames * 2) {
      // A slower passage is not proof of contention. Compare fewer browsers
      // on subsequent useful work and restore the old count if it is worse.
      this.baseline = { workers: this.target, rate };
      next--;
      reason = "compare fewer browsers after throughput changed";
      this.growth = false;
    }
    if (next === this.target && this.growth && next < this.limit
      && input.remainingFrames / rate * 1_000 > input.startupMs * (next + 1) * 2) {
      // A new browser must have enough remaining work to repay its startup,
      // even if its ideal contribution is only 1/(N+1) of current throughput.
      this.baseline = { workers: this.target, rate };
      next++;
      reason = "remaining capture can amortize another browser";
    }
    this.previousRate = rate;
    this.settled(input.now);
    if (next === this.target) return;
    this.target = next;
    this.since = undefined;
    return { workers: next, reason, fps: rate };
  }
}
