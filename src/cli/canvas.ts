import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  canvasStudioProduct,
  type CanvasAdoptionReceipt, type CanvasInvokeReceipt, type CanvasObservation, type CanvasQuoteReceipt,
} from "@hypit/canvas-studio/protocol";
import type { LocalHostClient } from "./client.js";
import { readJsonInput, type CliResult } from "./execution.js";
import { projectRoot } from "./nle.js";
import { openBrowser } from "./terminal.js";

type Options = {
  readonly project?: string;
  readonly node?: string;
  readonly name?: string;
  readonly environment: string;
  readonly input?: string;
  readonly expectedRevision?: string;
  readonly invocation?: string;
  readonly endpoint?: string;
  readonly noOpen: boolean;
};

async function existingParent(path: string): Promise<string> {
  try { return await realpath(path); }
  catch (error) {
    const parent = dirname(path);
    if (parent === path || !(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    return await existingParent(parent);
  }
}

export async function canvasCommand(
  host: LocalHostClient, action: string, document: string, options: Options, signal: AbortSignal,
): Promise<CliResult> {
  if (action === "create" && options.name === undefined) throw new Error("canvas create requires --name.");
  if (["history", "node", "quote", "invoke", "adopt"].includes(action) && options.node === undefined) {
    throw new Error("canvas " + action + " requires a node ID after the document.");
  }
  if (["apply", "adopt"].includes(action) && options.input === undefined) throw new Error("canvas " + action + " requires --input.");
  if (action === "invoke" && options.expectedRevision === undefined) throw new Error("canvas invoke requires --if-revision.");

  const candidate = resolve(options.project ?? process.cwd(), document);
  const absolute = action === "create" ? candidate : await realpath(candidate);
  const root = options.project === undefined
    ? await projectRoot(await existingParent(dirname(absolute))) : await realpath(options.project);
  const local = relative(root, absolute);
  if (local === "" || local === ".." || local.startsWith(".." + sep) || isAbsolute(local)) {
    throw new Error("Choose a Canvas inside the selected Project Boundary.");
  }
  const path = local.split(sep).join("/");
  const project = await host.openProject(root, signal);
  let session: { readonly handle: string; readonly url: string } | undefined;
  let keepOpen = false;
  try {
    session = await host.request("/api/application/sessions", {
      method: "POST", body: { project: project.handle, product: canvasStudioProduct, input: {
        document: path, ...(action === "create" ? { create: { name: options.name } } : {}),
      } }, signal,
    });
    if (session === undefined) throw new Error("Canvas Host returned no Product Session.");
    if (action === "open") {
      if (!options.noOpen) openBrowser(session.url);
      keepOpen = true;
      return { value: session, text: session.url };
    }
    const prefix = new URL("api/", session.url).pathname;
    const post = <T>(route: string, body: unknown) => host.request<T>(prefix + route, { method: "POST", body, signal });
    const node = options.node;
    switch (action) {
      case "create":
      case "inspect": {
        const board = await post<CanvasObservation>("observe", { kind: "board" });
        if (board.kind !== "board") throw new Error("Canvas Host returned an unexpected observation.");
        const { revision, document } = board;
        return { value: { path, revision, document }, text: `${document.name} · ${document.nodes.length} cards\n${path}\nRevision ${revision}` };
      }
      case "catalog": return { value: await post("observe", { kind: "catalog" }) };
      case "node":
      case "history": return { value: await post("observe", { kind: action, node }) };
      case "apply": {
        const value = await post<{ readonly revision: string }>("command", await readJsonInput(options.input!));
        return { value, text: "Saved " + value.revision };
      }
      case "quote":
      case "invoke": {
        const request = { node, environment: options.environment,
          ...(options.expectedRevision === undefined ? {} : { expectedRevision: options.expectedRevision }),
          ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }) };
        if (action === "quote") return { value: await post<CanvasQuoteReceipt>("quote", request) };
        const value = await post<CanvasInvokeReceipt>("invocations", { ...request,
          ...(options.invocation === undefined ? {} : { invocation: options.invocation }) });
        return { value, text: `${value.address.environment}/${value.address.invocation} · ${value.admission}${"issue" in value ? "\n" + value.issue : ""}`,
          failed: value.admission !== "accepted" };
      }
      case "adopt": {
        const body = await readJsonInput(options.input!);
        if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error("Adoption input must contain selection and target.");
        const value = await post<CanvasAdoptionReceipt>("adoptions", { ...body, node });
        return { value, text: value.kind === "media" ? value.reference.path : value.path };
      }
      default: throw new Error("Unknown Canvas command.");
    }
  } finally {
    try {
      if (session !== undefined && !keepOpen) await host.request(`/api/application/sessions/${encodeURIComponent(session.handle)}`, { method: "DELETE" });
    } finally { await host.closeProject(project.handle); }
  }
}
