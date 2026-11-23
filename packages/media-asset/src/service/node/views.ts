import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MediaResource } from "@hypit/media";
import { ProjectMediaAssetRevisionConflict, type ProjectMediaResourceResolver, type ProjectMediaService } from "../index.js";
import type { ProjectMediaPreviewResource, ProjectMediaViewExecutor, ProjectMediaViewLease, ProjectMediaViewObservation,
  ProjectMediaViewRequest, ProjectMediaViews } from "../views.js";

type ViewAction = {
  readonly owner: symbol;
  readonly request: ProjectMediaViewRequest;
  readonly controller: AbortController;
  readonly resources: Map<string, MediaResource>;
  directory?: string;
  state: ProjectMediaViewObservation;
};

const active = (action: ViewAction) => action.state.state === "queued" || action.state.state === "running";

/** A shared project Action queue, with result resources scoped to each caller lease. */
export class NodeProjectMediaViews implements ProjectMediaViews {
  readonly #actions = new Map<string, ViewAction>();
  readonly #listeners = new Map<symbol, (state: ProjectMediaViewObservation) => void>();
  readonly #work = new Set<Promise<void>>();
  readonly #cleanup = new Set<Promise<void>>();
  #closed = false;

  constructor(
    private readonly media: ProjectMediaService,
    private readonly resolver: ProjectMediaResourceResolver,
    private readonly executor: ProjectMediaViewExecutor,
  ) {}

  lease(publish: (state: ProjectMediaViewObservation) => void = () => {}): ProjectMediaViewLease {
    if (this.#closed) throw new Error("Project Media views are closed.");
    const owner = Symbol();
    this.#listeners.set(owner, publish);
    const owned = (handle: string) => {
      const action = this.#actions.get(handle);
      return action?.owner === owner ? action : undefined;
    };
    return {
      start: async request => {
        const catalog = await this.media.observe();
        if (!this.#listeners.has(owner)) throw new Error("Project Media view lease is closed.");
        if (catalog.generation !== request.expectedMediaGeneration) {
          throw new ProjectMediaAssetRevisionConflict(request.expectedMediaGeneration, catalog.generation);
        }
        if (!catalog.entries.some(entry => entry.state === "available" && entry.reference.path === request.media)) {
          throw new Error(`Project Media ${request.media} is unavailable.`);
        }
        return this.#start(owner, request);
      },
      observe: handle => structuredClone(owned(handle)?.state),
      resource: token => owned(token.split(":", 1)[0]!)?.resources.get(token),
      cancel: handle => {
        const action = owned(handle);
        if (action === undefined) return;
        if (active(action)) {
          action.controller.abort();
          if (action.state.state === "queued") this.#set(action, { ...action.state, state: "cancelled" });
        }
        return structuredClone(action.state);
      },
      close: () => {
        this.#listeners.delete(owner);
        for (const action of this.#actions.values()) if (action.owner === owner) this.#retire(action);
      },
    };
  }

  #start(owner: symbol, request: ProjectMediaViewRequest): ProjectMediaViewObservation {
    if ([...this.#actions.values()].filter(active).length >= 12) throw new Error("Project Media view queue is full.");
    const complete = [...this.#actions.values()].filter(action => action.owner === owner && !active(action));
    for (const action of complete.slice(0, Math.max(0, complete.length - 23))) this.#retire(action);
    const handle = randomUUID();
    const state = { handle, kind: request.kind, state: "queued", progress: 0 } as const;
    const action = { owner, request: structuredClone(request), controller: new AbortController(), resources: new Map(), state };
    this.#actions.set(handle, action);
    this.#set(action, state);
    this.#pump();
    return structuredClone(state);
  }

  #set(action: ViewAction, state: ProjectMediaViewObservation): void {
    action.state = state;
    if (!this.#actions.has(state.handle)) return;
    try { this.#listeners.get(action.owner)?.(structuredClone(state)); } catch { /* A caller cannot veto work. */ }
  }

  #discard(action: ViewAction): void {
    if (action.directory === undefined) return;
    const cleanup = rm(action.directory, { recursive: true, force: true });
    this.#cleanup.add(cleanup);
    void cleanup.finally(() => this.#cleanup.delete(cleanup)).catch(() => undefined);
    action.resources.clear();
  }

  #retire(action: ViewAction): void {
    this.#actions.delete(action.state.handle);
    action.controller.abort();
    this.#discard(action);
  }

  #pump(): void {
    while (!this.#closed && this.#work.size < 2) {
      const action = [...this.#actions.values()].find(entry => entry.state.state === "queued");
      if (action === undefined) return;
      const work = this.#run(action).finally(() => { this.#work.delete(work); this.#pump(); });
      this.#work.add(work);
      this.#set(action, { ...action.state, state: "running" });
    }
  }

  async #run(action: ViewAction): Promise<void> {
    const { handle, kind } = action.state;
    const { request, controller: { signal } } = action;
    const write = async (token: string, bytes: Uint8Array, mediaType: string) => {
      signal.throwIfAborted();
      action.directory ??= await mkdtemp(join(tmpdir(), "hypit-media-view-"));
      const address = join(action.directory, `${action.resources.size}`);
      await writeFile(address, bytes, { signal });
      action.resources.set(token, { address, mediaType, size: bytes.byteLength });
      return token;
    };
    try {
      const resolved = await this.media.resolveMedia({ path: request.media }, this.resolver);
      signal.throwIfAborted();
      if (request.kind === "media.source-preview") {
        const source = await this.executor.sourcePreview(resolved, request, signal);
        const blocks: ProjectMediaPreviewResource[] = [];
        for (const { bytes, ...block } of source) {
          const resource = bytes === undefined ? undefined : await write(`${handle}:${blocks.length}`, bytes,
            request.preset === "filmstrip" ? "image/png" : "application/json");
          blocks.push({ ...block, ...(resource === undefined ? {} : { resource }) });
        }
        signal.throwIfAborted();
        this.#set(action, { handle, kind, state: "complete", progress: 1, result: { blocks } });
      } else {
        const view = await this.executor.render(resolved, request, signal);
        const resource = await write(handle, view.bytes, view.mediaType);
        signal.throwIfAborted();
        this.#set(action, { handle, kind, state: "complete", progress: 1, result: { resource,
          mediaType: view.mediaType, ...(view.atlas === undefined ? {} : { atlas: view.atlas }) } });
      }
    } catch (error) {
      this.#discard(action);
      this.#set(action, signal.aborted ? { handle, kind, state: "cancelled", progress: 0 }
        : { handle, kind, state: "failed", progress: 0, diagnostic: error instanceof Error ? error.message : String(error) });
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#listeners.clear();
    for (const action of this.#actions.values()) this.#retire(action);
    await this.executor.close();
    await Promise.allSettled(this.#work);
    await Promise.allSettled(this.#cleanup);
  }
}
