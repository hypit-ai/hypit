import type { CanvasCommand } from "@hypit/canvas";
import type {
  CanvasAdoptionReceipt, CanvasCancelReceipt, CanvasCommandReceipt, CanvasInvokeReceipt, CanvasObservation,
  CanvasObservationRequest, CanvasPreviewReceipt, CanvasQuoteReceipt, CanvasStudioEvent,
} from "../protocol.js";
import { Board } from "./board.js";
import { control, element } from "./dom.js";
import { renderHistory, renderInspector, type InspectorActions } from "./inspector.js";
import "./style.css";

type Snapshot = Extract<CanvasObservation, { kind: "board" }>;
type Catalog = Extract<CanvasObservation, { kind: "catalog" }>;

const title = control("board-name");
const state = control("save-state");
const notice = control("notice");
const inspector = control("inspector");
const empty = control("empty");
const addCard = control("add-card", "button");
let snapshot: Snapshot | undefined;
let catalog: Catalog | undefined;
let selected: string | undefined;
let preview: HTMLElement | undefined;
let pending = 0;
let queue: Promise<void> = Promise.resolve();
let generationPending = false;
let boardReads = 0;
let catalogReads = 0;
let historyReads = 0;
let deferred = false;
let reveal: string | undefined;

class RequestError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

async function request<Result>(route: string, body: unknown): Promise<Result> {
  const response = await fetch("api/" + route, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const value = await response.json() as Result & { error?: string; code?: string };
  if (!response.ok) throw new RequestError(value.error ?? "Canvas request failed.", value.code);
  return value;
}

function observe(input: CanvasObservationRequest) { return request<CanvasObservation>("observe", input); }

function message(text: string, problem = false) {
  notice.hidden = text === "";
  notice.classList.toggle("problem", problem);
  notice.textContent = text;
}

function fail(error: unknown) { message(error instanceof Error ? error.message : String(error), true); }

const actions: InspectorActions = {
  commit: save,
  async preview(input) {
    const { token, mediaType } = await request<CanvasPreviewReceipt>("resources", input);
    return { url: "api/resources/" + encodeURIComponent(token), mediaType };
  },
  async quote(node, environment, endpoint) {
    await queue;
    return await request<CanvasQuoteReceipt>("quote", { node, environment, expectedRevision: snapshot?.revision,
      ...(endpoint === "" ? {} : { endpoint }) });
  },
  invoke(node, environment, endpoint) {
    if (generationPending) return;
    generationPending = true;
    message("Submitting generation…");
    void (async () => {
      await queue;
      const value = await request<CanvasInvokeReceipt>("invocations", { node, environment, expectedRevision: snapshot?.revision,
        invocation: globalThis.crypto.randomUUID(), ...(endpoint === "" ? {} : { endpoint }) });
      message(value.admission === "accepted" ? "Generation submitted." : ("issue" in value ? value.issue : "Generation admission is unconfirmed."),
        value.admission !== "accepted");
      await refreshBoard();
      await refreshHistory();
    })().catch(fail).finally(() => { generationPending = false; });
  },
  adopt(input) {
    void request<CanvasAdoptionReceipt>("adoptions", input).then(async result => {
      message("Added to Project Media · " + result.reference.path);
      await refreshCatalog();
    }).catch(fail);
  },
  cancel(node, address) {
    void request<CanvasCancelReceipt>("invocations/cancel", { node, address })
      .then(refreshHistory).catch(fail);
  },
};

const board = new Board({ select: selectNode, commit: save, preview: actions.preview,
  settled() { if (deferred && pending === 0) void refreshBoard().catch(fail); } });

function selection() { return snapshot?.document.nodes.find(node => node.id === selected); }

function selectNode(id: string | undefined) {
  if (id === selected) return;
  selected = id;
  board.select(id);
  renderSelection();
}

function renderSelection() {
  const node = selection();
  if (node === undefined || snapshot === undefined || catalog === undefined) {
    selected = undefined;
    preview = undefined;
    inspector.replaceChildren(element("p", "muted", "Select a card to edit its inputs and results."));
    return;
  }
  preview = renderInspector(inspector, node, snapshot.document, catalog, actions);
  if ("capability" in node) void refreshHistory().catch(fail);
}

function renderBoard() {
  if (snapshot === undefined || catalog === undefined) return;
  if (board.dragging) { deferred = true; return; }
  addCard.disabled = false;
  const document = snapshot.document;
  title.textContent = document.name;
  window.document.title = document.name + " · Hypit Canvas";
  empty.hidden = document.nodes.length > 0;
  control("empty-copy").textContent = catalog.palette.length > 0 || catalog.media.entries.length > 0
    ? "Add a model or Project Media to start. You can also double-click the canvas."
    : "Select models in hypit.project.json or import Project Media.";
  if (selection() === undefined) selected = undefined;
  board.update(document, snapshot.revision, catalog, selected, reveal);
  reveal = undefined;
  state.textContent = pending > 0 ? "Saving…" : "Saved";
  renderSelection();
}

async function refreshBoard() {
  const sequence = ++boardReads;
  const value = await observe({ kind: "board" });
  if (value.kind !== "board" || sequence !== boardReads) return;
  if (board.dragging) { deferred = true; return; }
  if (snapshot?.revision !== value.revision || deferred) {
    deferred = false;
    snapshot = value;
    renderBoard();
  }
}

async function refreshCatalog() {
  const sequence = ++catalogReads;
  const value = await observe({ kind: "catalog" });
  if (value.kind !== "catalog" || sequence !== catalogReads) return;
  catalog = value;
  renderBoard();
}

async function refreshHistory() {
  const node = selection();
  if (node === undefined || !("capability" in node)) return;
  const current = ++historyReads;
  const value = await observe({ kind: "history", node: node.id });
  if (value.kind !== "history" || snapshot === undefined || selected !== node.id || current !== historyReads || preview === undefined) return;
  const container = window.document.getElementById("history-entries");
  const model = catalog?.models.find(item => item.id === node.capability);
  if (container !== null) renderHistory(container, preview, node, model, snapshot.document, value.entries, actions);
}

function save(commands: CanvasCommand[], expectedRevision?: string) {
  if (commands.length === 0) return;
  pending++;
  state.textContent = "Saving…";
  queue = queue.then(async () => {
    if (snapshot === undefined) return;
    try {
      await request<CanvasCommandReceipt>("command", { expectedRevision: expectedRevision ?? snapshot.revision, commands });
      const added = commands.find(command => command.kind === "node.add");
      if (added !== undefined && added.kind === "node.add") selected = reveal = added.node.id;
      await refreshBoard();
      if (pending === 1) message("");
    } catch (error) {
      fail(error);
      if (error instanceof RequestError && error.code === "revision-conflict") {
        await refreshBoard();
      }
      renderBoard();
    }
  }).catch(fail).finally(() => {
    pending--;
    state.textContent = pending > 0 ? "Saving…" : "Saved";
  });
}

addCard.onclick = () => board.openAdd();
control("refresh").onclick = () => { void Promise.all([refreshBoard(), refreshCatalog()]).then(() => message("")).catch(fail); };
inspector.addEventListener("focusout", () => {
  if (deferred) window.setTimeout(() => { if (pending === 0) void refreshBoard().catch(fail); }, 0);
});

const events = new EventSource("api/events");
events.addEventListener("change", (event: MessageEvent<string>) => {
  const change = JSON.parse(event.data) as CanvasStudioEvent;
  if (change.kind === "media") {
    void refreshCatalog().catch(fail);
    return;
  }
  if (change.revision === snapshot?.revision || pending > 0) return;
  const focus = window.document.activeElement;
  if (board.dragging || (focus instanceof HTMLInputElement || focus instanceof HTMLTextAreaElement) && inspector.contains(focus)) {
    deferred = true;
    return;
  }
  void refreshBoard().catch(fail);
});
events.addEventListener("ready", () => {
  if (pending === 0) void refreshBoard().catch(fail);
});
window.addEventListener("pagehide", () => events.close(), { once: true });
window.setInterval(() => {
  if (window.document.visibilityState === "visible" && pending === 0) void refreshHistory().catch(fail);
}, 2500);

void Promise.all([refreshCatalog(), refreshBoard()]).catch(fail);
