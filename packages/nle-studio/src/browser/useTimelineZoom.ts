import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { maxZoom, minZoom } from "./timelineGeometry.js";

type TimelineView = { readonly zoom: number; readonly left?: number; readonly top?: number };

function read(key: string): TimelineView {
  try { const value = JSON.parse(localStorage.getItem(key) ?? "null") as TimelineView | null; return value?.zoom ? value : { zoom: 60 }; }
  catch { return { zoom: 60 }; }
}

export function useTimelineZoom(scroller: RefObject<HTMLDivElement | null>, labelWidth: number, identity: string) {
  const storageKey = `hypit:nle:timeline:${identity}`;
  const [view, setView] = useState<TimelineView>(() => read(storageKey));
  const current = useRef(view);
  const changeZoom = useCallback((value: number, resetScroll = false, anchor = 0) => {
    const previous = current.current, zoom = Math.max(minZoom, Math.min(maxZoom, value));
    const left = previous.left ?? scroller.current?.scrollLeft ?? 0;
    const next = { zoom, left: resetScroll ? 0 : Math.max(0, (left + anchor) * zoom / previous.zoom - anchor) };
    current.current = next; setView(next);
  }, [scroller]);
  useLayoutEffect(() => {
    if (view.left !== undefined && scroller.current) scroller.current.scrollLeft = view.left;
    if (view.top !== undefined && scroller.current) scroller.current.scrollTop = view.top;
    current.current = { zoom: view.zoom, left: scroller.current?.scrollLeft ?? 0, top: scroller.current?.scrollTop ?? 0 };
  }, [view, scroller]);
  useEffect(() => {
    const element = scroller.current; if (!element) return;
    const save = () => localStorage.setItem(storageKey, JSON.stringify(current.current));
    const remember = () => { current.current = { zoom: current.current.zoom, left: element.scrollLeft, top: element.scrollTop }; save(); };
    const wheel = (event: WheelEvent) => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); const anchor = Math.max(0, event.clientX - element.getBoundingClientRect().left - labelWidth); changeZoom(current.current.zoom * Math.exp(-event.deltaY * .01), false, anchor); };
    element.addEventListener("scroll", remember); element.addEventListener("wheel", wheel, { passive: false }); window.addEventListener("pagehide", save);
    return () => { save(); element.removeEventListener("scroll", remember); element.removeEventListener("wheel", wheel); window.removeEventListener("pagehide", save); };
  }, [scroller, labelWidth, changeZoom, storageKey]);
  return { zoom: view.zoom, changeZoom };
}
