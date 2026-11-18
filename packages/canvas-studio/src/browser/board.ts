import type { CanvasCommand, CanvasDocument, CanvasNode, CanvasPlacement } from "@hypit/canvas";
import type { CanvasModel } from "../protocol.js";
import { control, element, filename } from "./dom.js";

const cardWidth = 240;
const cardHeight = 120;
const margin = 48;

type Drag = {
  readonly id: string;
  readonly element: HTMLElement;
  readonly start: CanvasPlacement;
  readonly x: number;
  readonly y: number;
  readonly resize: boolean;
  next?: CanvasPlacement;
};

export function nodeTitle(node: CanvasNode, models: readonly CanvasModel[]) {
  return node.name ?? ("media" in node ? filename(node.media.path) : (models.find(model => model.id === node.capability)?.title ?? node.capability));
}

export class Board {
  readonly #viewport = control("viewport");
  readonly #world = control("world");
  readonly #wires = control("wires", "canvas");
  readonly #cards = new Map<string, HTMLElement>();
  readonly #select: (id: string | undefined) => void;
  readonly #commit: (commands: CanvasCommand[]) => void;
  #document?: CanvasDocument;
  #origin = { x: margin, y: margin };
  #drag: Drag | undefined;

  constructor(select: (id: string | undefined) => void, commit: (commands: CanvasCommand[]) => void) {
    this.#select = select;
    this.#commit = commit;
    this.#viewport.addEventListener("scroll", () => this.#draw());
    this.#viewport.addEventListener("click", event => {
      if (event.target === this.#world || event.target === this.#viewport) this.#select(undefined);
    });
    new ResizeObserver(() => this.#draw()).observe(this.#viewport);
  }

  get dragging() { return this.#drag !== undefined; }

  update(document: CanvasDocument, models: readonly CanvasModel[], selected?: string) {
    if (this.dragging) return;
    this.#document = document;
    this.#world.replaceChildren();
    this.#cards.clear();
    const placements = Object.values(document.layout);
    this.#origin = placements.reduce((origin, placement) => ({
      x: Math.max(origin.x, margin - display(placement.x)),
      y: Math.max(origin.y, margin - display(placement.y)),
    }), { x: margin, y: margin });
    const width = placements.reduce((value, item) => Math.max(value, display(item.x) + this.#origin.x + (item.width ?? cardWidth) + margin), 0);
    const height = placements.reduce((value, item) => Math.max(value, display(item.y) + this.#origin.y + (item.height ?? cardHeight) + margin), 0);
    this.#world.style.width = Math.min(220_000, width) + "px";
    this.#world.style.height = Math.min(220_000, height) + "px";
    for (const node of document.nodes) {
      const card = element("article", "card " + ("media" in node ? "media-card" : "recipe-card"));
      const title = element("button", "card-handle", nodeTitle(node, models));
      title.type = "button";
      title.addEventListener("click", () => this.#select(node.id));
      title.addEventListener("pointerdown", event => this.#begin(event, node.id, card, false));
      const subtitle = "media" in node ? node.media.path : models.find(model => model.id === node.capability)?.title ?? node.capability;
      card.append(title, element("p", "card-meta", subtitle));
      if ("capability" in node) {
        const prompt = node.inputs.prompt;
        if (prompt !== undefined && "value" in prompt && typeof prompt.value === "string") card.append(element("p", "card-prompt", prompt.value));
        const results = Object.hasOwn(document.results, node.id) ? document.results[node.id] : undefined;
        const choices = Object.keys(results?.selected ?? {});
        card.append(element("p", "card-output", choices.length > 0 ? choices.join(", ") + " selected" : "No result selected"));
      }
      const resize = element("button", "resize-grip");
      resize.type = "button";
      resize.setAttribute("aria-label", "Resize " + nodeTitle(node, models));
      resize.tabIndex = -1;
      resize.addEventListener("pointerdown", event => this.#begin(event, node.id, card, true));
      card.append(resize);
      this.#position(card, document.layout[node.id]!);
      this.#cards.set(node.id, card);
      this.#world.append(card);
    }
    this.select(selected);
  }

  select(id?: string) {
    for (const [key, card] of this.#cards) card.classList.toggle("selected", id === key);
    this.#draw();
  }

  #position(card: HTMLElement, item: CanvasPlacement) {
    card.style.left = display(item.x) + this.#origin.x + "px";
    card.style.top = display(item.y) + this.#origin.y + "px";
    card.style.width = Math.min(2048, item.width ?? cardWidth) + "px";
    card.style.height = Math.min(2048, item.height ?? cardHeight) + "px";
  }

  #begin(event: PointerEvent, id: string, card: HTMLElement, resize: boolean) {
    if (event.button !== 0 || this.dragging || this.#document === undefined) return;
    const target = event.currentTarget as HTMLButtonElement;
    const start = this.#document.layout[id]!;
    const drag: Drag = { id, element: card, start, x: event.clientX, y: event.clientY, resize };
    this.#drag = drag;
    this.#select(id);
    target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      const dx = next.clientX - drag.x;
      const dy = next.clientY - drag.y;
      if (drag.next === undefined && Math.hypot(dx, dy) < 3) return;
      drag.next = resize ? { ...start, width: Math.max(160, Math.min(2048, Math.round((start.width ?? cardWidth) + dx))),
        height: Math.max(96, Math.min(2048, Math.round((start.height ?? cardHeight) + dy))) }
        : { ...start, x: Math.round(start.x + dx), y: Math.round(start.y + dy) };
      this.#position(drag.element, drag.next);
      this.#draw();
    };
    const finish = (end: PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", finish);
      this.#drag = undefined;
      const next = drag.next;
      if (end.type === "pointercancel" || next === undefined) {
        this.#position(drag.element, start);
        this.#draw();
        return;
      }
      this.#commit([resize ? { kind: "node.resize", node: drag.id, width: next.width!, height: next.height! }
        : { kind: "node.move", node: drag.id, x: next.x, y: next.y }]);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
  }

  #draw() {
    const { clientWidth, clientHeight, scrollLeft, scrollTop } = this.#viewport;
    const scale = window.devicePixelRatio || 1;
    const width = Math.round(clientWidth * scale);
    const height = Math.round(clientHeight * scale);
    if (this.#wires.width !== width) {
      this.#wires.width = width;
      this.#wires.style.width = clientWidth + "px";
    }
    if (this.#wires.height !== height) {
      this.#wires.height = height;
      this.#wires.style.height = clientHeight + "px";
    }
    const ctx = this.#wires.getContext("2d");
    if (ctx === null) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, clientWidth, clientHeight);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#8d79bd";
    for (const node of this.#document?.nodes ?? []) {
      if (!("capability" in node)) continue;
      const card = this.#cards.get(node.id)!;
      const toX = card.offsetLeft - scrollLeft;
      const toY = card.offsetTop + card.offsetHeight / 2 - scrollTop;
      const links = new Set(Object.values(node.inputs).flatMap(binding => ("items" in binding ? binding.items : [binding])
        .flatMap(value => "from" in value ? [value.from.node] : [])));
      for (const id of links) {
        const source = this.#cards.get(id)!;
        const fromX = source.offsetLeft + source.offsetWidth - scrollLeft;
        const fromY = source.offsetTop + source.offsetHeight / 2 - scrollTop;
        const curve = Math.max(42, Math.abs(toX - fromX) / 2);
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.bezierCurveTo(fromX + curve, fromY, toX - curve, toY, toX, toY);
        ctx.stroke();
      }
    }
  }
}

function display(coord: number) { return Math.max(-100_000, Math.min(100_000, coord)); }
