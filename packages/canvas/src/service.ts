import type { InvocationAddress } from "@hypit/execution";
import { CanvasError, sameAddress, type CanvasDocument } from "./document.js";
import { applyCanvasCommands, readCanvasTransaction, type CanvasCommand, type CanvasTransaction } from "./transaction.js";

export type CanvasSnapshot = { readonly revision: string; readonly document: CanvasDocument };
export type CanvasStore = {
  read(): Promise<CanvasSnapshot>;
  write(expectedRevision: string, document: CanvasDocument): Promise<CanvasSnapshot>;
};
type Validate = (before: CanvasDocument, after: CanvasDocument) => Promise<void>;

export class CanvasService {
  readonly #store: CanvasStore;
  readonly #validate: Validate;
  readonly #listeners = new Set<(revision: string) => void>();
  #current: CanvasSnapshot;
  #pending: Promise<unknown> = Promise.resolve();

  constructor(store: CanvasStore, current: CanvasSnapshot, validate: Validate) {
    this.#store = store;
    this.#current = structuredClone(current);
    this.#validate = validate;
  }

  snapshot(): CanvasSnapshot { return structuredClone(this.#current); }

  subscribe(listener: (revision: string) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  #serialize<Result>(operation: () => Promise<Result>): Promise<Result> {
    const next = this.#pending.then(operation);
    this.#pending = next.catch(() => undefined);
    return next;
  }

  #set(snapshot: CanvasSnapshot): void {
    if (snapshot.revision === this.#current.revision) return;
    this.#current = snapshot;
    for (const listener of this.#listeners) {
      try { listener(snapshot.revision); } catch { /* Observers cannot veto a committed edit. */ }
    }
  }

  async refresh(): Promise<CanvasSnapshot> {
    return await this.#serialize(async () => {
      this.#set(await this.#store.read());
      return this.snapshot();
    });
  }

  async transact(transaction: CanvasTransaction): Promise<{ revision: string; nodes: readonly string[] }> {
    const { expectedRevision, commands } = readCanvasTransaction(transaction);
    return await this.#serialize(async () => {
      const revision = await this.#commit(expectedRevision, commands, this.#validate);
      return { revision, nodes: [...new Set(commands.map(command => command.kind === "node.add" ? command.node.id : command.node))] };
    });
  }

  /** Preserve the lookup address before the Environment can admit the explicit request. */
  async reserve(node: string, address: InvocationAddress, expectedRevision: string): Promise<{ revision: string; reserved: boolean }> {
    return await this.#serialize(async () => {
      const results = this.#current.document.results;
      const owner = Object.entries(results).find(([, result]) => result.invocations.some(value => sameAddress(value, address)));
      if (owner !== undefined) {
        if (owner[0] !== node) throw new CanvasError("invocation-conflict", "Invocation address is already attached to another node.", { node });
        return { revision: this.#current.revision, reserved: false };
      }
      const revision = await this.#commit(expectedRevision, [{ kind: "result.attach", node, address }]);
      return { revision, reserved: true };
    });
  }

  async #commit(expected: string, commands: readonly CanvasCommand[], validate?: Validate): Promise<string> {
    const current = this.#current;
    if (current.revision !== expected) throw new CanvasError("revision-conflict", "Canvas changed. Inspect the current revision and retry.");
    const next = applyCanvasCommands(current.document, commands);
    await validate?.(current.document, next);
    const saved = await this.#store.write(expected, next);
    this.#set(saved);
    return saved.revision;
  }
}
