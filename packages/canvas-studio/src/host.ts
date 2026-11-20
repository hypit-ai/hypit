import { randomUUID } from "node:crypto";
import type { ApplicationProductProvider } from "@hypit/application";
import { CanvasError, identity, readMediaReference, readSelection, record, text } from "@hypit/canvas";
import { openNodeCanvas, type NodeCanvas } from "@hypit/canvas/node";
import type { ProjectHost } from "@hypit/project";
import { importProjectMedia, openProjectMedia } from "./media.js";
import { canvasStudioProduct, type CanvasPreviewRequest, type CanvasStudioEvent } from "./protocol.js";

export { canvasStudioProduct } from "./protocol.js";

export class CanvasStudioProductSession {
  readonly #lifetime = new AbortController();
  readonly #previews = new Map<string, CanvasPreviewRequest>();
  readonly #tokens = new Map<string, string>();
  readonly #project: ProjectHost;
  readonly canvas: NodeCanvas;

  constructor(project: ProjectHost, canvas: NodeCanvas, private readonly mediaOptions: { readonly ffprobePath?: string } = {}) {
    this.#project = project;
    this.canvas = canvas;
  }

  get closed(): AbortSignal { return this.#lifetime.signal; }

  close(): void {
    this.#lifetime.abort();
    this.#previews.clear();
    this.#tokens.clear();
    this.canvas.close();
  }

  subscribe(listener: (event: CanvasStudioEvent) => void): () => void {
    const stopCanvas = this.canvas.subscribe(revision => listener({ kind: "canvas", revision }));
    const stopProject = this.#project.subscribe(event => {
      if (event.kind === "media.catalog") listener({ kind: "media" });
    });
    return () => { stopCanvas(); stopProject(); };
  }

  async createPreview(value: unknown) {
    const fields = record(value, "Canvas preview");
    const request: CanvasPreviewRequest = Object.hasOwn(fields, "media")
      ? { media: readMediaReference(record(value, "Canvas Media preview", ["media"]).media) }
      : { node: identity(record(value, "Canvas preview", ["node", "selection"]).node, "Node ID"),
        ...(fields.selection === undefined ? {} : { selection: readSelection(fields.selection) }) };
    const { mediaType } = await this.resolvePreview(request);
    this.closed.throwIfAborted();
    const key = JSON.stringify(request);
    let token = this.#tokens.get(key);
    if (token === undefined) {
      token = randomUUID();
      this.#tokens.set(key, token);
      this.#previews.set(token, request);
    }
    return { token, mediaType };
  }

  openPreview(token: string) {
    const request = this.#previews.get(token);
    if (request === undefined) throw new CanvasError("missing-resource", "Unknown Canvas preview.");
    return this.resolvePreview(request);
  }

  private resolvePreview(request: CanvasPreviewRequest) {
    return "media" in request ? openProjectMedia(this.#project, request.media) : this.canvas.openPreview(request);
  }

  importMedia(request: { sourcePath: string; sourceName: string }, signal: AbortSignal) {
    return importProjectMedia(this.#project, request, this.mediaOptions, AbortSignal.any([signal, this.closed]));
  }
}

export function createCanvasStudioProductProvider(options: { readonly ffprobePath?: string } = {}): ApplicationProductProvider {
  return {
    product: canvasStudioProduct,
    title: "Canvas",
    launchParameters: [{ name: "document", title: "Canvas document", required: true, initial: "generation/opening.canvas.json" }],
    async open(project, value) {
      const input = record(value, "Canvas launch", ["document"]);
      const document = text(input.document, "Canvas document path");
      return new CanvasStudioProductSession(project, await openNodeCanvas(project, document, options), options);
    },
  };
}
