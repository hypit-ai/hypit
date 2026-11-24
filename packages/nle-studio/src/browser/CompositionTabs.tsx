import type { NleComposition } from "@hypit/nle";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type PointerEvent } from "react";
import type { NleStudioOpenProjection } from "../protocol.js";
import { CompositionActions, NewCompositionButton } from "./CompositionActions.js";
import { fadeMotion } from "./motion.js";
import { useGestureOrder } from "./useGestureOrder.js";

type Canvas = NleComposition["canvas"];
const tabDropSlop = 14;

export function CompositionTabs({ tabs, active, root, canvas, busy,
  onSelect, onMove, onCreate, onEdit, onInsert, onCopy, onRoot, onRemove }: {
  readonly tabs: NleStudioOpenProjection["timeline"]["compositions"];
  readonly active: string;
  readonly root: string;
  readonly canvas: Canvas;
  readonly busy: boolean;
  readonly onSelect: (id: string) => void;
  readonly onMove: (id: string, before?: string) => Promise<void>;
  readonly onCreate: (name: string, canvas: Canvas) => void;
  readonly onEdit: (id: string, fields: { name?: string; canvas?: Canvas }) => void;
  readonly onInsert: (id: string) => void;
  readonly onCopy: (id: string) => void;
  readonly onRoot: (id: string) => void;
  readonly onRemove: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const list = useRef<HTMLDivElement>(null);
  const guide = useRef<HTMLSpanElement>(null);
  const cancel = useRef<() => void>(undefined);
  const suppressClick = useRef<string>(undefined);
  const { ordered, order, submit } = useGestureOrder(tabs, onMove);
  useEffect(() => () => cancel.current?.(), [active, order, busy]);

  useLayoutEffect(() => {
    const viewport = list.current;
    const tab = viewport?.querySelector<HTMLElement>(".nle-timeline-tab.current");
    if (!viewport || !tab) return;
    const start = tab.offsetLeft, end = start + tab.offsetWidth;
    if (start < viewport.scrollLeft) viewport.scrollLeft = start;
    else if (end > viewport.scrollLeft + viewport.clientWidth) viewport.scrollLeft = end - viewport.clientWidth;
  }, [active]);

  const start = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    const viewport = list.current, line = guide.current;
    const bar = viewport?.parentElement;
    const handle = event.currentTarget, tab = handle.closest<HTMLElement>(".nle-timeline-tab");
    if (event.button !== 0 || !event.isPrimary || busy || ordered.length < 2 || !viewport || !bar || !line || !tab) return;
    cancel.current?.();
    suppressClick.current = undefined;
    const elements = new Map(Array.from(viewport.querySelectorAll<HTMLElement>("[data-composition-tab]"),
      element => [element.dataset.compositionTab, element]));
    const neighbors = ordered.filter(candidate => candidate.id !== id).map(candidate => elements.get(candidate.id));
    if (neighbors.some(element => element === undefined)) return;

    const { pointerId, clientX: startX, clientY: startY } = event;
    const grabOffset = startX - tab.getBoundingClientRect().left;
    const original = ordered.findIndex(candidate => candidate.id === id);
    const lastTab = elements.get(ordered.at(-1)!.id)!;
    let x = startX, y = startY, target = original, dragging = false, animation = 0;
    const position = (left: number) => tab.style.setProperty("--nle-tab-drag-offset", `${left - tab.offsetLeft}px`);
    const edge = () => neighbors[target]?.offsetLeft ?? (neighbors.at(-1)!.offsetLeft + neighbors.at(-1)!.offsetWidth);
    const insideDrop = () => {
      const rect = bar.getBoundingClientRect();
      return x >= rect.left && x < rect.right && y >= rect.top - tabDropSlop && y < rect.bottom + tabDropSlop;
    };

    const locate = () => {
      if (!dragging) return;
      if (!insideDrop()) { line.hidden = true; return; }
      const rect = viewport.getBoundingClientRect();
      const end = lastTab.offsetLeft + lastTab.offsetWidth;
      const maxScroll = Math.max(0, end - viewport.clientWidth);
      const edgeZone = 16;
      const first = x <= rect.left || (viewport.scrollLeft <= 1 && x <= rect.left + edgeZone);
      const last = x >= rect.right || (viewport.scrollLeft >= maxScroll - 1 && x >= rect.right - edgeZone);
      let left = x - rect.left + viewport.scrollLeft - grabOffset;
      if (first || last) {
        // The pointer can reach either end slot even when the dragged tab's center cannot.
        viewport.scrollLeft = first ? 0 : maxScroll;
        target = first ? 0 : neighbors.length;
        left = first ? 0 : end - tab.offsetWidth;
      } else {
        const center = left + tab.offsetWidth / 2;
        const middle = (neighbor: HTMLElement) => neighbor.offsetLeft + neighbor.offsetWidth / 2;
        while (target > 0 && center < middle(neighbors[target - 1]!) - 4) target--;
        while (target < neighbors.length && center > middle(neighbors[target]!) + 4) target++;
      }
      position(Math.max(0, Math.min(end - tab.offsetWidth, left)));
      line.style.left = `${Math.min(end - 1, Math.max(1, edge()))}px`;
      line.hidden = target === original;
    };
    const scroll = () => {
      const rect = viewport.getBoundingClientRect();
      if (insideDrop()) {
        const delta = x < rect.left + 28 ? -Math.min(12, (rect.left + 28 - x) / 3)
          : x > rect.right - 28 ? Math.min(12, (x - rect.right + 28) / 3) : 0;
        if (delta !== 0) viewport.scrollLeft += delta;
      }
      animation = requestAnimationFrame(scroll);
    };
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      x = next.clientX; y = next.clientY;
      if (!dragging && Math.abs(x - startX) > 5) {
        dragging = true;
        suppressClick.current = id;
        tab.dataset.dragging = "";
        animation = requestAnimationFrame(scroll);
      }
      locate();
    };
    const stop = () => {
      delete tab.dataset.dragging;
      tab.style.removeProperty("--nle-tab-drag-offset");
      cancel.current = undefined;
      cancelAnimationFrame(animation);
      line.hidden = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", abort);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", stop);
      handle.removeEventListener("lostpointercapture", abort);
      viewport.removeEventListener("scroll", locate);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    };
    const finish = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      move(next);
      const moveTab = dragging && target !== original && insideDrop();
      const before = neighbors[target]?.dataset.compositionTab;
      stop();
      if (moveTab) submit(id, before);
    };
    const abort = (next: globalThis.PointerEvent) => { if (next.pointerId === pointerId) stop(); };
    const key = (next: KeyboardEvent) => {
      if (next.key !== "Escape") return;
      next.preventDefault();
      next.stopPropagation();
      stop();
    };
    handle.setPointerCapture(pointerId);
    cancel.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", abort);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", stop);
    handle.addEventListener("lostpointercapture", abort);
    viewport.addEventListener("scroll", locate);
  };

  return <div className="nle-timeline-tabbar">
    <div className="nle-timeline-tabs" ref={list} role="tablist" aria-label="项目时间线" data-reorderable={!busy && ordered.length > 1}>
      <AnimatePresence initial={false}>{ordered.map(composition => {
        const current = composition.id === active;
        return <motion.div {...fadeMotion(reduced)} className={`nle-timeline-tab${current ? " current" : ""}`}
          key={composition.id} data-composition-tab={composition.id}>
          <button type="button" role="tab" disabled={busy} aria-selected={current} title={composition.name}
            onPointerDown={event => start(event, composition.id)}
            onClick={event => {
              if (event.detail !== 0 && suppressClick.current === composition.id) {
                suppressClick.current = undefined;
                return;
              }
              onSelect(composition.id);
            }}>{composition.name}</button>
          <CompositionActions composition={composition} disabled={busy} root={composition.id === root}
            referenced={composition.referenced} canInsert={composition.canInsert}
            onRename={name => onEdit(composition.id, { name })} onResize={size => onEdit(composition.id, { canvas: size })}
            onInsert={() => onInsert(composition.id)} onCopy={() => onCopy(composition.id)}
            onRoot={() => onRoot(composition.id)} onRemove={() => onRemove(composition.id)}/>
        </motion.div>;
      })}</AnimatePresence>
      <span className="nle-timeline-tab-insertion" ref={guide} aria-hidden="true" hidden/>
    </div>
    <div className="nle-timeline-tab-create">
      <NewCompositionButton canvas={canvas} disabled={busy} onCreate={onCreate}/>
    </div>
  </div>;
}
