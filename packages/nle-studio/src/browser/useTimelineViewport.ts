import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { defaultMaxZoom, emptyTimelineMinZoom, timelineEndPadding, timelineStartPadding } from "./timelineGeometry.js";

const zoomSteps = 31;
const wheelDeltaForFullZoom = 691;

type ZoomRequest = { readonly zoom: number; readonly left: number; readonly top?: number };
type ZoomAnchor = { readonly frame: number } | { readonly clientX: number } | "start";
export type TimelineViewport = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

function read(key: string): ZoomRequest {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<ZoomRequest> | null;
    if (stored?.zoom !== undefined && Number.isFinite(stored.zoom) && stored.zoom > 0) {
      return { zoom: stored.zoom, left: Number.isFinite(stored.left) ? Math.max(0, stored.left!) : 0,
        ...(Number.isFinite(stored.top) ? { top: Math.max(0, stored.top!) } : {}) };
    }
  } catch { /* Browser storage may be unavailable. */ }
  return { zoom: 60, left: 0 };
}

function limits(width: number, lastClipEnd: number, fps: number) {
  const min = lastClipEnd > 0
    ? Math.max(1, width - timelineStartPadding - timelineEndPadding) * fps / (4 * lastClipEnd) : emptyTimelineMinZoom;
  return { min, max: Math.max(defaultMaxZoom, 4 * min) };
}

function positionOfZoom(zoom: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, Math.log(zoom / min) / Math.log(max / min)));
}

function zoomAtPosition(position: number, min: number, max: number): number {
  if (position <= 0) return min;
  if (position >= 1) return max;
  return min * (max / min) ** position;
}

function contentWidth(width: number, frames: number, pixelsPerFrame: number): number {
  return Math.max(width - timelineStartPadding, frames * pixelsPerFrame + timelineEndPadding);
}

export function useTimelineViewport(scroller: RefObject<HTMLDivElement | null>, labelWidth: number, identity: string,
  lastClipEnd: number, maximumFrame: number, fps: number, { frame, playing, reveal }: {
    readonly frame: number;
    readonly playing: boolean;
    readonly reveal: { readonly frame: number } | undefined;
  }) {
  const contentFrames = maximumFrame + Math.ceil(fps * 15);
  const storageKey = `hypit:nle:timeline:${identity}`;
  const [request, setRequest] = useState(() => read(storageKey));
  const requested = useRef(request);
  const applied = useRef<ZoomRequest>(undefined);
  const drawnLeft = useRef(request.left);
  const knownLeft = useRef(request.left);
  const follow = useRef<"paused" | "following" | "detached">("paused");
  const lastReveal = useRef(reveal);
  const [measured, setMeasured] = useState<{ request: ZoomRequest; viewport: TimelineViewport }>(() => ({
    request, viewport: { left: request.left, top: request.top ?? 0, width: 900, height: 0 },
  }));

  const observe = useCallback((element: HTMLDivElement, zoom: ZoomRequest) => {
    const viewport = { left: element.scrollLeft, top: element.scrollTop,
      width: Math.max(0, element.clientWidth - labelWidth), height: element.clientHeight };
    element.style.setProperty("--nle-timeline-content-left", `${viewport.left + labelWidth}px`);
    setMeasured(previous => previous.request === zoom && previous.viewport.left === viewport.left
      && previous.viewport.top === viewport.top && previous.viewport.width === viewport.width
      && previous.viewport.height === viewport.height ? previous : { request: zoom, viewport });
  }, [labelWidth]);

  const save = useCallback((element: HTMLDivElement, zoom: number) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ zoom, left: element.scrollLeft, top: element.scrollTop }));
    } catch { /* Browser storage may be unavailable. */ }
  }, [storageKey]);

  const positionViewport = useCallback((element: HTMLDivElement, left: number) => {
    element.scrollLeft = left;
    knownLeft.current = element.scrollLeft;
  }, []);

  const noticeHorizontalScroll = useCallback((element: HTMLDivElement) => {
    if (element.scrollLeft === knownLeft.current) return;
    knownLeft.current = element.scrollLeft;
    if (follow.current === "following") follow.current = "detached";
  }, []);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    const width = Math.max(0, element.clientWidth - labelWidth);
    const { min, max } = limits(width, lastClipEnd, fps);
    const zoom = Math.max(min, Math.min(max, request.zoom));
    if (requested.current === request && zoom !== request.zoom) {
      const left = request === applied.current ? element.scrollLeft : request.left;
      const next = { ...request, zoom, left: left + Math.max(0, left - timelineStartPadding) * (zoom / request.zoom - 1) };
      requested.current = next;
      setRequest(next);
      return;
    }
    // The content has its new scale. Set and measure the scroll position before this scale paints.
    if (applied.current !== request) {
      positionViewport(element, request.left);
      if (applied.current === undefined && request.top !== undefined) element.scrollTop = request.top;
    }
    applied.current = request;
    observe(element, request);
    save(element, request.zoom);
  }, [scroller, request, observe, save, positionViewport, labelWidth, lastClipEnd, fps, measured.viewport.width]);

  const changeZoom = useCallback((value: (zoom: number, min: number, max: number, width: number) => number, anchor: ZoomAnchor) => {
    const element = scroller.current;
    if (element === null) return;
    const previous = requested.current;
    // Several wheel events can arrive before React commits their scale. Compose them on the pending position.
    const left = previous === applied.current ? element.scrollLeft : previous.left;
    const width = Math.max(0, element.clientWidth - labelWidth);
    const { min, max } = limits(width, lastClipEnd, fps);
    const zoom = Math.max(min, Math.min(max, value(previous.zoom, min, max, width)));
    let nextLeft = 0;
    if (anchor !== "start") {
      const playhead = "frame" in anchor ? timelineStartPadding + anchor.frame * previous.zoom / fps - left : undefined;
      const x = "clientX" in anchor ? Math.max(0, Math.min(width, anchor.clientX - element.getBoundingClientRect().left - labelWidth))
        : playhead !== undefined && playhead >= 0 && playhead <= width ? playhead : width / 2;
      const rightmost = timelineStartPadding + contentWidth(width, contentFrames, zoom / fps) - width;
      const anchorPosition = Math.max(0, left + x - timelineStartPadding);
      nextLeft = Math.max(0, Math.min(rightmost, left + anchorPosition * (zoom / previous.zoom - 1)));
    }
    if (zoom === previous.zoom && Math.abs(nextLeft - left) < 0.01) return;
    if (follow.current === "following") follow.current = "detached";
    const next = { zoom, left: nextLeft };
    requested.current = next;
    setRequest(next);
  }, [scroller, labelWidth, lastClipEnd, contentFrames, fps]);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    const measure = () => {
      const zoom = applied.current;
      if (zoom !== undefined && zoom === requested.current) observe(element, zoom);
    };
    const scroll = () => {
      noticeHorizontalScroll(element);
      // A scrollbar jump can pass all ruler marks rendered beyond the last viewport.
      if (Math.abs(element.scrollLeft - drawnLeft.current) > element.clientWidth - labelWidth) flushSync(measure);
      else measure();
      if (applied.current !== undefined) save(element, applied.current.zoom);
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? element.clientHeight : 1;
      changeZoom((zoom, min, max) => zoomAtPosition(positionOfZoom(zoom, min, max) - event.deltaY * unit / wheelDeltaForFullZoom, min, max),
        { clientX: event.clientX });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("scroll", scroll, { passive: true });
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", scroll);
      element.removeEventListener("wheel", wheel);
    };
  }, [scroller, labelWidth, changeZoom, observe, save, noticeHorizontalScroll]);

  useLayoutEffect(() => {
    const seek = reveal !== lastReveal.current ? reveal : undefined;
    if (!playing) {
      follow.current = "paused";
      if (seek === undefined) return;
    } else if (follow.current === "detached") return;
    const element = scroller.current;
    if (element === null || requested.current !== request) return;
    const width = element.clientWidth - labelWidth;
    if (width <= 0) return;
    lastReveal.current = reveal;
    // A native scroll can move the viewport before its scroll event is delivered.
    noticeHorizontalScroll(element);
    const left = element.scrollLeft;
    const x = timelineStartPadding + (seek?.frame ?? frame) * request.zoom / fps;
    const visible = x >= left && x < left + width;
    if (playing) {
      if (follow.current === "paused") {
        follow.current = visible ? "following" : "detached";
        return;
      }
      if (follow.current !== "following" || x < left + width - 1) return;
    } else if (visible) return;
    positionViewport(element, Math.max(0, x - width * .2));
    observe(element, request);
  }, [scroller, frame, playing, reveal, request, fps, labelWidth, noticeHorizontalScroll, positionViewport, observe]);

  const viewport = measured.request === request ? measured.viewport : { ...measured.viewport, left: request.left };
  useLayoutEffect(() => { drawnLeft.current = viewport.left; }, [viewport.left]);
  const { min, max } = limits(viewport.width, lastClipEnd, fps);
  return {
    viewport, zoom: request.zoom, minZoom: min, maxZoom: max, zoomPosition: positionOfZoom(request.zoom, min, max),
    contentWidth: contentWidth(viewport.width, contentFrames, request.zoom / fps),
    fit: () => changeZoom((_, _min, _max, width) => (width - timelineStartPadding - 40) / (lastClipEnd > 0 ? lastClipEnd / fps : 1), "start"),
    changeZoomPosition: (position: number, frame: number) =>
      changeZoom((_, min, max) => zoomAtPosition(position, min, max), { frame }),
    stepZoom: (direction: -1 | 1, frame: number) =>
      changeZoom((zoom, min, max) => zoomAtPosition(positionOfZoom(zoom, min, max) + direction / zoomSteps, min, max), { frame }),
  };
}
