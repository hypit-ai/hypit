import { assert } from "./process.js";

export type OrderedFrameWriter = {
  readonly write: (bytes: Uint8Array) => Promise<void>;
  readonly close: () => Promise<void>;
};

/**
 * Joins independently captured frames into one ordered stream. This state belongs
 * to one render and knows only output ordinals and PNG bytes.
 */
export class OrderedFrameSink {
  readonly #frameCount: number;
  readonly #maxPendingBytes: number;
  readonly #writer: OrderedFrameWriter;
  readonly #pending = new Map<number, Uint8Array>();
  readonly #waiting = new Set<number>();
  readonly #changes = new Set<() => void>();
  readonly #signal: AbortSignal | undefined;
  readonly #abort: () => void;
  #pendingBytes = 0;
  #nextOrdinal = 0;
  #draining: Promise<void> | undefined;
  #failure: unknown;
  #closed = false;

  constructor(args: {
    readonly frameCount: number;
    readonly maxPendingBytes: number;
    readonly writer: OrderedFrameWriter;
    readonly signal?: AbortSignal;
  }) {
    assert(Number.isSafeInteger(args.frameCount) && args.frameCount > 0, "Ordered frame count must be a positive integer");
    assert(Number.isSafeInteger(args.maxPendingBytes) && args.maxPendingBytes > 0,
      "Ordered frame byte budget must be a positive integer");
    this.#frameCount = args.frameCount;
    this.#maxPendingBytes = args.maxPendingBytes;
    this.#writer = args.writer;
    this.#signal = args.signal;
    this.#abort = () => this.fail(args.signal?.reason ?? new Error("Ordered frame sink aborted"));
    args.signal?.addEventListener("abort", this.#abort, { once: true });
    if (args.signal?.aborted) this.#abort();
  }

  /** Resolves once this frame has entered the bounded waiting set or was written. */
  async submit(ordinal: number, bytes: Uint8Array): Promise<void> {
    this.#throwIfStopped();
    assert(Number.isSafeInteger(ordinal) && ordinal >= 0 && ordinal < this.#frameCount,
      `Ordered frame ordinal ${ordinal} is outside the render`);
    assert(bytes.byteLength > 0, `Ordered frame ${ordinal} is empty`);
    assert(ordinal >= this.#nextOrdinal && !this.#pending.has(ordinal) && !this.#waiting.has(ordinal),
      `Ordered frame ${ordinal} was submitted more than once`);
    this.#waiting.add(ordinal);
    try {
      // A future frame waits for byte capacity. The exact frontier always passes;
      // an otherwise-empty set also accepts one oversized frame, so neither the
      // order dependency nor a single large PNG can deadlock this render.
      while (ordinal !== this.#nextOrdinal && this.#pendingBytes > 0
        && this.#pendingBytes + bytes.byteLength > this.#maxPendingBytes) {
        await this.#changed();
        this.#throwIfStopped();
      }
      this.#waiting.delete(ordinal);
      this.#pending.set(ordinal, bytes);
      this.#pendingBytes += bytes.byteLength;
      await this.#flush();
    } catch (error) {
      this.#waiting.delete(ordinal);
      throw error;
    }
  }

  /** Finish the ordered input after every producer has settled. */
  async close(): Promise<void> {
    this.#throwIfStopped();
    assert(!this.#closed, "Ordered frame sink is already closed");
    await this.#flush();
    this.#throwIfStopped();
    assert(this.#nextOrdinal === this.#frameCount && this.#pending.size === 0 && this.#waiting.size === 0,
      `Ordered frame sink closed after ${this.#nextOrdinal} of ${this.#frameCount} frames`);
    this.#closed = true;
    this.#signal?.removeEventListener("abort", this.#abort);
    await this.#writer.close();
  }

  /** Stop blocked submitters when the encoder or another render participant fails. */
  fail(error: unknown): void {
    if (this.#failure !== undefined || this.#closed) return;
    this.#failure = error;
    this.#notify();
  }

  async #flush(): Promise<void> {
    while (this.#pending.has(this.#nextOrdinal)) {
      if (this.#draining === undefined) {
        const draining = this.#drainReady();
        this.#draining = draining;
        void draining.finally(() => {
          if (this.#draining === draining) this.#draining = undefined;
        }).catch(() => {});
      }
      await this.#draining;
      this.#throwIfStopped();
    }
  }

  async #drainReady(): Promise<void> {
    try {
      while (true) {
        const ordinal = this.#nextOrdinal;
        const bytes = this.#pending.get(ordinal);
        if (bytes === undefined) return;
        await this.#writer.write(bytes);
        this.#pending.delete(ordinal);
        this.#pendingBytes -= bytes.byteLength;
        this.#nextOrdinal++;
        this.#notify();
      }
    } catch (error) {
      this.fail(error);
      throw error;
    }
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
    assert(!this.#closed, "Ordered frame sink is already closed");
  }
}
