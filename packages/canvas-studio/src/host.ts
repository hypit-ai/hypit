import { randomUUID } from "node:crypto";
import type { ApplicationProductProvider } from "@hypit/application";
import { CanvasError, identity, readSelection, record, text } from "@hypit/canvas";
import { createNodeCanvas, openNodeCanvas, type NodeCanvas } from "@hypit/canvas/node";
import type { ProjectHost } from "@hypit/project";
import { canvasStudioProduct, type CanvasPreviewRequest, type CanvasStudioEvent } from "./protocol.js";

export { canvasStudioProduct } from "./protocol.js";

export class CanvasStudioProductSession {
  readonly #lifetime = new AbortController();
  readonly #previews = new Map<string, CanvasPreviewRequest>();
  readonly #tokens = new Map<string, string>();
  readonly #project: ProjectHost;
  readonly canvas: NodeCanvas;

  constructor(project: ProjectHost, canvas: NodeCanvas) {
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
    const fields = record(value, "Canvas preview", ["node", "selection"]);
    const request: CanvasPreviewRequest = { node: identity(fields.node, "Node ID"),
      ...(fields.selection === undefined ? {} : { selection: readSelection(fields.selection) }) };
    const { mediaType } = await this.canvas.openPreview(request);
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
    return this.canvas.openPreview(request);
  }
}

export function createCanvasStudioProductProvider(options: { readonly ffprobePath?: string } = {}): ApplicationProductProvider {
  return {
    product: canvasStudioProduct,
    title: "Canvas",
    launchParameters: [{ name: "document", title: "Canvas document", required: true, initial: "generation/opening.canvas.json" }],
    async open(project, value) {
      const input = record(value, "Canvas launch", ["document", "create"]);
      const document = text(input.document, "Canvas document path");
      if (input.create !== undefined) {
        const creation = record(input.create, "Create Canvas", ["name"]);
        await createNodeCanvas(project, document, text(creation.name, "Canvas name"));
      }
      return new CanvasStudioProductSession(project, await openNodeCanvas(project, document, options));
    },
  };
}
