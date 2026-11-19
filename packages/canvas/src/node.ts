import { randomUUID } from "node:crypto";
import type { ProjectHost, ProjectHostContext, ProjectOwnerProvider } from "@hypit/project";
import { CanvasError, encodeCanvas, readAddress, readSelection, record, identity, text } from "./document.js";
import { canvasFileStore, canvasPath, prepareProjectDestination, writeNewDocument } from "./node-files.js";
import { CanvasOperations } from "./operations.js";
import { CanvasService } from "./service.js";
import type { CanvasTransaction } from "./transaction.js";

export type { CanvasAdoptionRequest, CanvasInvokeRequest, CanvasModel, CanvasQuoteRequest } from "./operations.js";

export const canvasOwnerProvider: ProjectOwnerProvider<CanvasService, ProjectHostContext> = {
  owner: "canvas.document",
  async open(context, path) {
    const store = canvasFileStore(context.boundary.root, path);
    const operations = new CanvasOperations(context);
    return new CanvasService(store, await store.read(), (before, after) => operations.validate(before, after));
  },
  close() {},
};

export async function createNodeCanvas(project: ProjectHost, path: string, name: string): Promise<void> {
  if (!path.endsWith(".canvas.json")) throw new CanvasError("invalid-path", "Canvas path must end in .canvas.json.");
  const contents = encodeCanvas({ format: "hypit.canvas", id: "canvas-" + randomUUID(), name: text(name, "Canvas name"),
    nodes: [], layout: {}, results: {} });
  await writeNewDocument(await prepareProjectDestination(project.boundary.root, path), contents);
}

export async function openNodeCanvas(project: ProjectHost, path: string, options: { readonly ffprobePath?: string } = {}) {
  const operations = new CanvasOperations(project, options);
  const document = await canvasPath(project.boundary.root, path);
  const lease = await project.documents.open(canvasOwnerProvider, document);
  const service = lease.service;
  try { await service.refresh(); }
  catch (error) { lease.close(); throw error; }
  return {
    document,
    close: lease.close,
    subscribe: (listener: (revision: string) => void) => service.subscribe(listener),
    async observe(value: unknown) {
      const input = record(value, "Canvas observation", ["kind", "node"]);
      switch (input.kind) {
        case "catalog": return { kind: "catalog" as const, ...await operations.catalog(), media: await project.media.observe() };
        case "board": return { kind: "board" as const, ...await service.refresh() };
        case "node": {
          const snapshot = await service.refresh();
          return { kind: "node" as const, revision: snapshot.revision, ...operations.observeNode(snapshot.document, identity(input.node, "Node ID")) };
        }
        case "history": {
          const snapshot = await service.refresh();
          return { kind: "history" as const, revision: snapshot.revision, entries: await operations.history(snapshot.document, identity(input.node, "Node ID")) };
        }
        default: throw new CanvasError("invalid-observation", "Unknown Canvas observation.");
      }
    },
    transact: (value: CanvasTransaction) => service.transact(value),
    async quote(value: unknown, signal?: AbortSignal) { return await operations.quote(await service.refresh(), value, signal); },
    invoke: (value: unknown, signal?: AbortSignal) => operations.invoke(service, value, signal),
    async adopt(value: unknown, signal?: AbortSignal) { return await operations.adopt((await service.refresh()).document, value, signal); },
    async cancel(value: unknown) {
      const input = record(value, "Canvas cancellation", ["node", "address"]);
      return await operations.cancel((await service.refresh()).document, identity(input.node, "Node ID"), readAddress(input.address));
    },
    async openPreview(value: unknown) {
      const input = record(value, "Canvas preview", ["node", "selection"]);
      const id = identity(input.node, "Node ID");
      const snapshot = await service.refresh();
      if (input.selection !== undefined) return await operations.openOutput(snapshot.document, id, readSelection(input.selection));
      const node = snapshot.document.nodes.find(item => item.id === id);
      if (node === undefined || !("media" in node)) throw new CanvasError("missing-media", "Preview requires a Media node or an attached Publication resource.", { node: id });
      return await operations.openMedia(node.media);
    },
  };
}

export type NodeCanvas = Awaited<ReturnType<typeof openNodeCanvas>>;
export type CanvasObservation = Awaited<ReturnType<NodeCanvas["observe"]>>;
