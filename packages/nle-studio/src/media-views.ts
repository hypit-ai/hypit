import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MediaResource } from "@hypit/media";
import { renderLocalMediaView, type LocalMediaToolchainOptions } from "@hypit/media-local";
import type { ProjectHost } from "@hypit/project";
import { createNodeProjectResourceResolver } from "@hypit/project/node";
import type { NleStudioActionObservation, NleStudioMediaActionRequest } from "./protocol.js";

type ViewAction = {
  readonly request: NleStudioMediaActionRequest;
  readonly controller: AbortController;
  state: NleStudioActionObservation;
  resource?: MediaResource;
  directory?: string;
};

const active = (state: NleStudioActionObservation) => state.state === "queued" || state.state === "running";

export class NleStudioMediaViews {
  readonly #project: ProjectHost;
  readonly #tools: LocalMediaToolchainOptions;
  readonly #publish: (state: NleStudioActionObservation) => void;
  readonly #actions = new Map<string, ViewAction>();
  readonly #work = new Set<Promise<void>>();
  readonly #cleanup = new Set<Promise<void>>();

  constructor(project: ProjectHost, tools: LocalMediaToolchainOptions, publish: (state: NleStudioActionObservation) => void) {
    this.#project = project;
    this.#tools = tools;
    this.#publish = publish;
  }

  start(request: NleStudioMediaActionRequest): NleStudioActionObservation {
    if ([...this.#actions.values()].filter(action => active(action.state)).length >= 12) {
      throw new Error("NLE Studio Media view queue is full.");
    }
    while (this.#actions.size >= 24) {
      const retired = [...this.#actions.values()].find(action => !active(action.state));
      if (retired === undefined) break;
      this.#actions.delete(retired.state.handle);
      this.#discard(retired);
    }
    const handle = randomUUID();
    const state = { handle, kind: request.kind, state: "queued", progress: 0 } as const;
    const action = { request, state, controller: new AbortController() };
    this.#actions.set(handle, action);
    this.#publish(state);
    this.#pump();
    return structuredClone(state);
  }

  observe(handle: string): NleStudioActionObservation | undefined {
    const state = this.#actions.get(handle)?.state;
    return state === undefined ? undefined : structuredClone(state);
  }

  resource(handle: string): MediaResource | undefined {
    const action = this.#actions.get(handle);
    return action?.state.state === "complete" ? action.resource : undefined;
  }

  cancel(handle: string): NleStudioActionObservation | undefined {
    const action = this.#actions.get(handle);
    if (action === undefined) return undefined;
    if (active(action.state)) {
      action.controller.abort();
      if (action.state.state === "queued") this.#set(action, { ...action.state, state: "cancelled" });
    }
    return structuredClone(action.state);
  }

  invalidate(): void {
    const retired = [...this.#actions.values()];
    this.#actions.clear();
    for (const action of retired) {
      action.controller.abort();
      this.#discard(action);
    }
  }

  async close(): Promise<void> {
    this.invalidate();
    await Promise.allSettled(this.#work);
    await Promise.allSettled(this.#cleanup);
  }

  #set(action: ViewAction, state: NleStudioActionObservation): void {
    action.state = state;
    if (this.#actions.has(state.handle)) this.#publish(state);
  }

  #discard(action: ViewAction): void {
    if (action.directory === undefined) return;
    const cleanup = rm(action.directory, { recursive: true, force: true });
    this.#cleanup.add(cleanup);
    void cleanup.finally(() => this.#cleanup.delete(cleanup)).catch(() => undefined);
  }

  #pump(): void {
    while (this.#work.size < 2) {
      const action = [...this.#actions.values()].find(entry => entry.state.state === "queued");
      if (action === undefined) return;
      const running = Promise.resolve().then(() => this.#run(action)).finally(() => {
        this.#work.delete(running);
        this.#pump();
      });
      this.#work.add(running);
      this.#set(action, { ...action.state, state: "running" });
    }
  }

  async #run(action: ViewAction): Promise<void> {
    const { handle, kind } = action.state;
    const { request, controller: { signal } } = action;
    try {
      signal.throwIfAborted();
      const resolver = createNodeProjectResourceResolver(this.#project.boundary.root);
      const media = await this.#project.media.resolveMedia({ path: request.media }, resolver);
      signal.throwIfAborted();
      const view = await renderLocalMediaView({ media, request, tools: this.#tools, signal });
      signal.throwIfAborted();
      action.directory = await mkdtemp(join(tmpdir(), "hypit-media-view-"));
      const address = join(action.directory, view.mediaType === "image/png" ? "view.png" : "view.wav");
      await writeFile(address, view.bytes, { signal });
      signal.throwIfAborted();
      action.resource = { address, mediaType: view.mediaType, size: view.bytes.byteLength };
      this.#set(action, { handle, kind, state: "complete", progress: 1, result: {
        resource: `api/resources/${encodeURIComponent(handle)}`, mediaType: view.mediaType,
        ...(view.atlas === undefined ? {} : { atlas: view.atlas }),
      } });
    } catch (error) {
      this.#discard(action);
      this.#set(action, signal.aborted ? { handle, kind, state: "cancelled", progress: 0 }
        : { handle, kind, state: "failed", progress: 0, diagnostic: error instanceof Error ? error.message : String(error) });
    }
  }
}
