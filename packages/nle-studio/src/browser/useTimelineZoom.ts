import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

const zoomSteps = 31;
const wheelDeltaForFullZoom = 691;

type TimelineView = { readonly zoom: number; readonly left?: number; readonly top?: number };

function read(key: string, defaultZoom: number): TimelineView {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as TimelineView | null;
    if (value && Number.isFinite(value.zoom) && value.zoom > 0) return value;
  } catch { /* Use the default when browser storage is unavailable. */ }
  return { zoom: defaultZoom };
}

function positionOfZoom(zoom: number, minZoom: number, maxZoom: number): number {
  const position = Math.log(zoom / minZoom) / Math.log(maxZoom / minZoom);
  return Math.max(0, Math.min(1, position));
}

export function useTimelineZoom(scroller: RefObject<HTMLDivElement | null>, labelWidth: number, identity: string,
  minZoom: number, maxZoom: number) {
  const storageKey = `hypit:nle:timeline:${identity}`;
  const [view, setView] = useState<TimelineView>(() => read(storageKey, Math.max(minZoom, Math.min(maxZoom, 60))));
  const current = useRef(view);
  const limits = useRef({ minZoom, maxZoom });
  const zoom = view.zoom;
  const changeZoom = useCallback((value: number, resetScroll = false, anchor = 0) => {
    const { minZoom, maxZoom } = limits.current;
    const previous = current.current, zoom = Math.max(minZoom, Math.min(maxZoom, value));
    const left = previous.left ?? scroller.current?.scrollLeft ?? 0;
    const next = { zoom, left: resetScroll || zoom === minZoom ? 0 : Math.max(0, (left + anchor) * zoom / previous.zoom - anchor) };
    current.current = next; setView(next);
  }, [scroller]);
  const changeZoomPosition = useCallback((position: number, anchor = 0) => {
    const { minZoom, maxZoom } = limits.current;
    const zoom = position <= 1e-9 ? minZoom : position >= 1 - 1e-9 ? maxZoom : minZoom * (maxZoom / minZoom) ** position;
    changeZoom(zoom, false, anchor);
  }, [changeZoom]);
  const offsetZoomPosition = useCallback((offset: number, anchor = 0) => {
    const { minZoom, maxZoom } = limits.current;
    const position = positionOfZoom(current.current.zoom, minZoom, maxZoom);
    const next = Math.max(0, Math.min(1, position + offset));
    if (next !== position) changeZoomPosition(next, anchor);
  }, [changeZoomPosition]);
  useLayoutEffect(() => {
    limits.current = { minZoom, maxZoom };
  }, [minZoom, maxZoom]);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (view.left !== undefined) element.scrollLeft = view.left;
    if (view.top !== undefined) element.scrollTop = view.top;
    current.current = { zoom: view.zoom, left: element.scrollLeft, top: element.scrollTop };
  }, [view, scroller]);
  useEffect(() => {
    const element = scroller.current; if (!element) return;
    const save = () => localStorage.setItem(storageKey, JSON.stringify(current.current));
    const remember = () => { current.current = { ...current.current, left: element.scrollLeft, top: element.scrollTop }; save(); };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const anchor = Math.max(0, event.clientX - element.getBoundingClientRect().left - labelWidth);
      offsetZoomPosition(-event.deltaY / wheelDeltaForFullZoom, anchor);
    };
    element.addEventListener("scroll", remember); element.addEventListener("wheel", wheel, { passive: false }); window.addEventListener("pagehide", save);
    return () => { save(); element.removeEventListener("scroll", remember); element.removeEventListener("wheel", wheel); window.removeEventListener("pagehide", save); };
  }, [scroller, labelWidth, offsetZoomPosition, storageKey]);
  return {
    zoom, zoomPosition: positionOfZoom(zoom, minZoom, maxZoom), changeZoom, changeZoomPosition,
    stepZoom: (direction: -1 | 1) => offsetZoomPosition(direction / zoomSteps),
  };
}
