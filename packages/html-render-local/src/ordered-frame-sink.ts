export type OrderedFrameWriter = {
  readonly write: (bytes: Uint8Array) => Promise<void>;
  readonly close: () => Promise<void>;
};

/** Bounded ordered join for independently captured PNG frames. */
export class OrderedFrameSink {
  readonly #frameCount: number;
  readonly #maxPendingBytes: number;
  readonly #writer: OrderedFrameWriter;
  readonly #pending = new Map<number, Uint8Array>();
  readonly #waiting = new Set<number>();
  readonly #changes = new Set<() => void>();
  #pendingBytes = 0;
  #nextOrdinal = 0;
  #draining: Promise<void> | undefined;
  #failure: unknown;
  #closed = false;

  constructor(args: { readonly frameCount: number; readonly maxPendingBytes: number; readonly writer: OrderedFrameWriter }) {
    if (!Number.isSafeInteger(args.frameCount) || args.frameCount <= 0
      || !Number.isSafeInteger(args.maxPendingBytes) || args.maxPendingBytes <= 0) {
      throw new Error("Ordered frame sink limits are invalid.");
    }
    this.#frameCount = args.frameCount;
    this.#maxPendingBytes = args.maxPendingBytes;
    this.#writer = args.writer;
  }

  async submit(ordinal: number, bytes: Uint8Array): Promise<void> {
    this.#throwIfStopped();
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= this.#frameCount
      || bytes.byteLength === 0 || ordinal < this.#nextOrdinal
      || this.#pending.has(ordinal) || this.#waiting.has(ordinal)) throw new Error(`Ordered frame ${ordinal} is invalid.`);
    this.#waiting.add(ordinal);
    try {
      while (ordinal !== this.#nextOrdinal && this.#pendingBytes > 0
        && this.#pendingBytes + bytes.byteLength > this.#maxPendingBytes) {
        await new Promise<void>((resolve) => this.#changes.add(resolve));
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

  async close(): Promise<void> {
    this.#throwIfStopped();
    await this.#flush();
    this.#throwIfStopped();
    if (this.#nextOrdinal !== this.#frameCount || this.#pending.size !== 0 || this.#waiting.size !== 0) {
      throw new Error(`Ordered frame sink closed after ${this.#nextOrdinal} of ${this.#frameCount} frames.`);
    }
    this.#closed = true;
    await this.#writer.close();
  }

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
        void draining.finally(() => { if (this.#draining === draining) this.#draining = undefined; }).catch(() => {});
      }
      await this.#draining;
      this.#throwIfStopped();
    }
  }

  async #drainReady(): Promise<void> {
    try {
      while (true) {
        const bytes = this.#pending.get(this.#nextOrdinal);
        if (bytes === undefined) return;
        await this.#writer.write(bytes);
        this.#pending.delete(this.#nextOrdinal++);
        this.#pendingBytes -= bytes.byteLength;
        this.#notify();
      }
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  #notify(): void {
    const changes = [...this.#changes];
    this.#changes.clear();
    changes.forEach((change) => change());
  }

  #throwIfStopped(): void {
    if (this.#failure !== undefined) throw this.#failure;
    if (this.#closed) throw new Error("Ordered frame sink is closed.");
  }
}
