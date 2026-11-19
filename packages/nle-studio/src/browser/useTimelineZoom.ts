import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
type TimelineView = { readonly zoom: number; readonly atMinimum?: boolean; readonly left?: number; readonly top?: number };

function read(key: string): TimelineView {
  try { const value = JSON.parse(localStorage.getItem(key) ?? "null") as TimelineView | null; return value?.zoom ? value : { zoom: 60 }; }
  catch { return { zoom: 60 }; }
}

export function useTimelineZoom(scroller: RefObject<HTMLDivElement | null>, labelWidth: number, identity: string,
  minZoom: number, maxZoom: number) {
  const storageKey = `hypit:nle:timeline:${identity}`;
  const [view, setView] = useState<TimelineView>(() => read(storageKey));
  const current = useRef(view);
  const limits = useRef({ minZoom, maxZoom });
  const zoom = view.atMinimum ? minZoom : Math.max(minZoom, Math.min(maxZoom, view.zoom));
  const changeZoom = useCallback((value: number, resetScroll = false, anchor = 0) => {
    const { minZoom, maxZoom } = limits.current;
    const previous = current.current, zoom = Math.max(minZoom, Math.min(maxZoom, value));
    const atMinimum = zoom === minZoom;
    const left = previous.left ?? scroller.current?.scrollLeft ?? 0;
    const next = { zoom, atMinimum, left: resetScroll || atMinimum ? 0 : Math.max(0, (left + anchor) * zoom / previous.zoom - anchor) };
    current.current = next; setView(next);
  }, [scroller]);
  const changeZoomPosition = (position: number) => {
    const { minZoom, maxZoom } = limits.current;
    changeZoom(minZoom * (maxZoom / minZoom) ** position);
  };
  useLayoutEffect(() => {
    if (view.left !== undefined && scroller.current) scroller.current.scrollLeft = view.left;
    if (view.top !== undefined && scroller.current) scroller.current.scrollTop = view.top;
  }, [view, scroller]);
  useLayoutEffect(() => {
    limits.current = { minZoom, maxZoom };
    const element = scroller.current;
    if (!element) return;
    if (view.atMinimum) element.scrollLeft = 0;
    current.current = { ...view, zoom, left: element.scrollLeft, top: element.scrollTop };
  }, [view, minZoom, maxZoom, zoom, scroller]);
  useEffect(() => {
    const element = scroller.current; if (!element) return;
    const save = () => localStorage.setItem(storageKey, JSON.stringify(current.current));
    const remember = () => { current.current = { ...current.current, left: element.scrollLeft, top: element.scrollTop }; save(); };
    const wheel = (event: WheelEvent) => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); const anchor = Math.max(0, event.clientX - element.getBoundingClientRect().left - labelWidth); changeZoom(current.current.zoom * Math.exp(-event.deltaY * .01), false, anchor); };
    element.addEventListener("scroll", remember); element.addEventListener("wheel", wheel, { passive: false }); window.addEventListener("pagehide", save);
    return () => { save(); element.removeEventListener("scroll", remember); element.removeEventListener("wheel", wheel); window.removeEventListener("pagehide", save); };
  }, [scroller, labelWidth, changeZoom, storageKey]);
  return { zoom, changeZoom, changeZoomPosition };
}
