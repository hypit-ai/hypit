import { useSyncExternalStore } from "react";
import type { CanvasCommand, CanvasDocument, CanvasNode, CanvasSelection, MediaReference } from "@hypit/canvas";
import type { InvocationAddress } from "@hypit/execution";
import type {
  CanvasAdoptionReceipt, CanvasAdoptionRequest, CanvasCancelReceipt, CanvasCommandReceipt, CanvasInvokeReceipt, CanvasObservation,
  CanvasObservationRequest, CanvasPreviewReceipt, CanvasPreviewRequest, CanvasQuoteReceipt, CanvasQuoteRequest, CanvasStudioEvent,
  CanvasTimelineRequest, CanvasTimelineResponse,
} from "../protocol.js";
import { t } from "./locale.js";
import { nodeSize, nodeTitle } from "./wiring.js";

type Board = Extract<CanvasObservation, { kind: "board" }>;
export type History = Extract<CanvasObservation, { kind: "history" }>;
export type LocalSnapshot = {
  board?: Board;
  catalog?: Extract<CanvasObservation, { kind: "catalog" }>;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  notice: { message: string; problem: boolean };
};
type Edit = { before: CanvasDocument; after: CanvasDocument };

const listeners = new Set<() => void>();
let state: LocalSnapshot = { busy: false, canUndo: false, canRedo: false, notice: { message: "", problem: false } };
let queue: Promise<unknown> = Promise.resolve();
let undo: Edit[] = [], redo: Edit[] = [];
let pending = 0, boardRead = 0, catalogRead = 0;

function update(next: Partial<LocalSnapshot>) {
  state = { ...state, ...next };
  for (const receive of listeners) receive();
}

function subscribe(receive: () => void) { listeners.add(receive); return () => { listeners.delete(receive); }; }
export function useCanvasSession() { return useSyncExternalStore(subscribe, () => state); }

class RequestError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

async function request<Result>(route: string, body: unknown): Promise<Result> {
  const response = await fetch("api/" + route, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const value = await response.json() as Result & { error?: string; code?: string };
  if (!response.ok) throw new RequestError(value.error ?? t("Canvas request failed.", "画布请求失败。"), value.code);
  return value;
}

export function timelineRequest(input: CanvasTimelineRequest) { return request<CanvasTimelineResponse>("timeline", input); }

export function observe(input: CanvasObservationRequest) { return request<CanvasObservation>("observe", input); }

export function notify(message: string, problem = false) { update({ notice: { message, problem } }); }
export function report(error: unknown) { notify(error instanceof Error ? error.message : String(error), true); }

function updateHistory() { update({ canUndo: undo.length > 0, canRedo: redo.length > 0 }); }
function resetHistory() { undo = []; redo = []; updateHistory(); }

async function refreshBoard(expected?: string) {
  const sequence = ++boardRead;
  const value = await observe({ kind: "board" });
  if (value.kind !== "board" || sequence !== boardRead) return;
  if (state.board?.revision === value.revision) return value;
  if (state.board && expected !== value.revision) resetHistory();
  update({ board: value });
  document.title = value.document.name + " / Hypit Canvas";
  return value;
}

async function refreshCatalog() {
  const sequence = ++catalogRead;
  const value = await observe({ kind: "catalog" });
  if (value.kind === "catalog" && sequence === catalogRead) update({ catalog: value });
}

export async function refresh() {
  await queue;
  try { await Promise.all([refreshBoard(), refreshCatalog()]); notify(""); }
  catch (error) { report(error); }
}

export function startSession() {
  const events = new EventSource("api/events");
  events.addEventListener("change", (event: MessageEvent<string>) => {
    const change = JSON.parse(event.data) as CanvasStudioEvent;
    if (change.kind === "media") void refreshCatalog().catch(report);
    else if (pending === 0 && change.revision !== state.board?.revision) void refreshBoard().catch(report);
  });
  events.addEventListener("ready", () => { if (!pending) void refreshBoard().catch(report); });
  window.addEventListener("pagehide", () => events.close(), { once: true });
  void refresh();
}

function serialized<Result>(run: () => Promise<Result>): Promise<Result> {
  pending++;
  update({ busy: true });
  const result = queue.then(async () => {
    try { return await run(); }
    catch (error) {
      if (error instanceof RequestError && error.code === "revision-conflict") {
        await refreshBoard().catch(report);
      }
      report(error);
      throw error;
    }
  }).finally(() => {
    pending--;
    if (!pending) {
      update({ busy: false });
      void refreshBoard().catch(report);
    }
  });
  queue = result.catch(() => {});
  return result;
}

function boardNow() {
  if (!state.board) throw new Error(t("Canvas is still opening.", "画布仍在打开。"));
  return state.board;
}

function transact(commands: CanvasCommand[], expectedRevision: string) {
  return request<CanvasCommandReceipt>("command", { expectedRevision, commands });
}

export function commit(commands: CanvasCommand[], revision?: string) {
  if (!commands.length) return Promise.resolve();
  return serialized(async () => {
    const before = boardNow();
    const result = await transact(commands, revision ?? before.revision);
    const after = await refreshBoard(result.revision);
    if (after?.revision === result.revision && before.revision !== after.revision) {
      undo.push({ before: before.document, after: after.document });
      redo = [];
      updateHistory();
    }
    notify("");
  });
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const addressKey = (address: InvocationAddress) => `${address.environment}/${address.invocation}`;

function restoreCommands(from: CanvasDocument, to: CanvasDocument): CanvasCommand[] {
  const current = new Map(from.nodes.map(node => [node.id, node]));
  const target = new Map(to.nodes.map(node => [node.id, node]));
  const commands: CanvasCommand[] = [];
  for (const node of to.nodes) {
    if (!current.has(node.id)) commands.push({ kind: "node.add", node, placement: to.layout[node.id]! });
  }
  for (const node of to.nodes) {
    const prior = current.get(node.id);
    const position = to.layout[node.id]!;
    if (prior) {
      const oldPosition = from.layout[node.id]!;
      const size = nodeSize(node, state.catalog);
      if (position.x !== oldPosition.x || position.y !== oldPosition.y) commands.push({ kind: "node.move", node: node.id, x: position.x, y: position.y });
      if (position.width !== oldPosition.width || position.height !== oldPosition.height) commands.push({
        kind: "node.resize", node: node.id, width: position.width ?? size.width, height: position.height ?? size.height,
      });
      if (node.name !== prior.name) commands.push({ kind: "node.rename", node: node.id,
        name: nodeTitle(node, state.catalog?.models ?? []) });
      if ("media" in node && "media" in prior && !equal(prior.media, node.media)) {
        commands.push({ kind: "node.set-media", node: node.id, media: node.media });
      }
      if ("capability" in node && "capability" in prior && (node.capability !== prior.capability || !equal(prior.inputs, node.inputs))) {
        commands.push({ kind: "node.set-recipe", node: node.id, recipe: { capability: node.capability, inputs: node.inputs } });
      }
    }
    if (!("capability" in node)) continue;
    const previous = from.results[node.id], next = to.results[node.id];
    const keep = new Set(next?.invocations.map(addressKey));
    const existing = new Set(previous?.invocations.map(addressKey));
    for (const address of previous?.invocations ?? []) {
      if (!keep.has(addressKey(address))) commands.push({ kind: "result.detach", node: node.id, address });
    }
    for (const address of next?.invocations ?? []) {
      if (!existing.has(addressKey(address))) commands.push({ kind: "result.attach", node: node.id, address });
    }
    for (const output of Object.keys(previous?.selected ?? {})) {
      if (!next?.selected[output]) commands.push({ kind: "result.clear", node: node.id, output });
    }
    for (const [output, selection] of Object.entries(next?.selected ?? {})) {
      if (!equal(previous?.selected[output], selection)) commands.push({ kind: "result.select", node: node.id, output, selection });
    }
  }
  for (const node of from.nodes) {
    if (!target.has(node.id)) commands.push({ kind: "node.remove", node: node.id });
  }
  return commands;
}

export function editHistory(direction: "undo" | "redo") {
  return serialized(async () => {
    const previous = direction === "undo" ? undo : redo, next = direction === "undo" ? redo : undo;
    const edit = previous.at(-1);
    if (!edit) return;
    const current = boardNow();
    const commands = restoreCommands(current.document, direction === "undo" ? edit.before : edit.after);
    if (commands.length) {
      const result = await transact(commands, current.revision);
      const snapshot = await refreshBoard(result.revision);
      if (snapshot?.revision !== result.revision) return;
    }
    previous.pop();
    next.push(edit);
    updateHistory();
  });
}

export async function importMedia(file: File): Promise<MediaReference> {
  const response = await fetch("api/media/import?" + new URLSearchParams({ name: file.name }), { method: "POST", body: file });
  const value = await response.json() as { reference: MediaReference; error?: string; code?: string };
  if (!response.ok) throw new RequestError(value.error ?? t("Media import failed.", "素材导入失败。"), value.code);
  return value.reference;
}

export async function preview(input: CanvasPreviewRequest) {
  const { token, mediaType } = await request<CanvasPreviewReceipt>("resources", input);
  return { url: "api/resources/" + encodeURIComponent(token), mediaType };
}

export async function quote(input: CanvasQuoteRequest) {
  await queue;
  return request<CanvasQuoteReceipt>("quote", { ...input, expectedRevision: boardNow().revision });
}

export function invoke(input: CanvasQuoteRequest & { readonly invocation?: string }) {
  return serialized(async () => {
    const result = await request<CanvasInvokeReceipt>("invocations", {
      ...input, expectedRevision: boardNow().revision, invocation: input.invocation ?? crypto.randomUUID(),
    });
    if (state.board?.revision !== result.revision) resetHistory();
    await refreshBoard(result.revision);
    return result;
  });
}

export async function cancel(node: string, address: InvocationAddress) {
  return request<CanvasCancelReceipt>("invocations/cancel", { node, address });
}

export async function adopt(requestBody: CanvasAdoptionRequest) {
  const receipt = await request<CanvasAdoptionReceipt>("adoptions", requestBody);
  await refreshCatalog();
  notify(t("Added to Project Media", "已加入项目素材") + " / " + receipt.reference.path);
  return receipt.reference;
}

export const selectionIs = (first: CanvasSelection | undefined, second: CanvasSelection) =>
  first?.address.environment === second.address.environment && first.address.invocation === second.address.invocation
  && first.output === second.output && first.resource === second.resource;

export type Recipe = Extract<CanvasNode, { capability: string }>;
