import { useEffect, useRef, useState } from "react";
import type { NleStudioActionObservation, NleStudioOpenProjection, NleStudioTimelineMediaView } from "../protocol.js";
import { cancelAction, readAction, readTimelineMedia, startAction } from "./api.js";

type VisibleTracks = { readonly fromFrame: number; readonly toFrame: number; readonly tracks: readonly string[] };
type TimelineMediaResult = NleStudioTimelineMediaView & {
  readonly image: HTMLImageElement;
  readonly atlas?: NonNullable<Extract<NleStudioActionObservation, { state: "complete" }>["result"]["atlas"]>;
};

const cachedViewLimit = 24;

async function loadImage(resource: string, signal: AbortSignal): Promise<HTMLImageElement> {
  const response = await fetch(resource, { signal });
  if (!response.ok) throw new Error(`Timeline image request failed with ${response.status}.`);
  const url = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    return image;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function useTimelineMedia(
  scroller: React.RefObject<HTMLDivElement | null>,
  session: NleStudioOpenProjection,
  frameWidth: number,
  labelWidth: number,
) {
  const { scene } = session.timeline;
  const { projectRevision, viewRevision } = session.status;
  const { generation, derivedViews } = session.media;
  const [visible, setVisible] = useState<VisibleTracks>();
  const scope = JSON.stringify([scene.composition, projectRevision, generation, scene.editRate.numerator, scene.editRate.denominator, derivedViews]);
  const cache = useRef(new Map<string, TimelineMediaResult>());
  const resources = useRef(new Set<string>());
  const [shown, setShown] = useState<{ scope: string; views: readonly TimelineMediaResult[] }>();

  useEffect(() => {
    cache.current.clear();
    setShown(undefined);
  }, [scope]);

  useEffect(() => {
    const retained = new Set([...(shown?.views ?? []), ...cache.current.values()].map(view => view.image.src));
    for (const url of resources.current) {
      if (retained.has(url)) continue;
      URL.revokeObjectURL(url);
      resources.current.delete(url);
    }
  }, [shown]);

  useEffect(() => {
    const urls = resources.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    let timer: number | undefined;
    const measure = () => {
      const viewport = element.getBoundingClientRect();
      const top = element.querySelector(".nle-ruler")?.getBoundingClientRect().bottom ?? viewport.top;
      const tracks = Array.from(element.querySelectorAll<HTMLElement>(".nle-track[data-track-id]")).filter(row => {
        const box = row.getBoundingClientRect();
        return box.top < viewport.bottom && box.bottom > top;
      }).slice(0, 64).map(row => row.dataset.trackId!);
      const fromFrame = Math.max(0, Math.floor(element.scrollLeft / frameWidth));
      const toFrame = Math.ceil((element.scrollLeft + element.clientWidth - labelWidth) / frameWidth);
      setVisible(previous => previous?.fromFrame === fromFrame && previous.toFrame === toFrame
        && previous.tracks.join("\u0000") === tracks.join("\u0000") ? previous : { fromFrame, toFrame, tracks });
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 180);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    element.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      resize.disconnect();
      element.removeEventListener("scroll", schedule);
      window.clearTimeout(timer);
    };
  }, [scroller, frameWidth, labelWidth, scene]);

  useEffect(() => {
    if (!derivedViews || visible === undefined || visible.tracks.length === 0 || visible.toFrame <= visible.fromFrame) return;
    const controller = new AbortController();
    const { signal } = controller;
    const pending = new Set<string>();
    const run = async (view: NleStudioTimelineMediaView) => {
      const key = JSON.stringify([view.item, view.action.kind]);
      const previous = cache.current.get(key);
      if (previous !== undefined && JSON.stringify(previous.action) === JSON.stringify(view.action)) {
        cache.current.delete(key);
        cache.current.set(key, previous);
        return;
      }
      let action = await startAction(view.action);
      try {
        pending.add(action.handle);
        if (signal.aborted) {
          if (action.state === "queued" || action.state === "running") await cancelAction(action.handle);
          return;
        }
        while (!signal.aborted && (action.state === "queued" || action.state === "running")) {
          await new Promise<void>(resolve => window.setTimeout(resolve, 250));
          if (signal.aborted) return;
          action = await readAction(action.handle);
        }
        if (action.state === "complete" && !signal.aborted) {
          const { resource, atlas } = action.result;
          const image = await loadImage(resource, signal);
          if (signal.aborted) { URL.revokeObjectURL(image.src); return; }
          resources.current.add(image.src);
          cache.current.delete(key);
          cache.current.set(key, { ...view, image, ...(atlas === undefined ? {} : { atlas }) });
          if (cache.current.size > cachedViewLimit) cache.current.delete(cache.current.keys().next().value!);
          setShown({ scope, views: [...cache.current.values()] });
        }
      } finally {
        pending.delete(action.handle);
      }
    };
    void readTimelineMedia({
      kind: "timeline-media", composition: scene.composition, expectedProjectRevision: projectRevision,
      expectedViewRevision: viewRevision, expectedMediaGeneration: generation, ...visible,
    }).then(async views => {
      if (!signal.aborted) await Promise.allSettled(views.map(run));
    }).catch(() => undefined);
    return () => {
      controller.abort();
      for (const handle of pending) void cancelAction(handle).catch(() => undefined);
    };
  }, [derivedViews, visible, scene.composition, projectRevision, viewRevision, generation, scope]);

  return shown?.scope === scope ? shown.views : [];
}

export function TimelineMedia({ views, item, start, frameWidth }: {
  readonly views: readonly TimelineMediaResult[];
  readonly item: string;
  readonly start: number;
  readonly frameWidth: number;
}) {
  return views.filter(view => view.item === item).map(view => {
    const { atlas } = view;
    const resource = view.image.src;
    const left = (view.fromFrame - start) * frameWidth;
    const width = (view.toFrame - view.fromFrame) * frameWidth;
    const audio = view.action.kind === "media.waveform";
    return <span aria-hidden="true" key={view.action.kind}
      className={audio ? "nle-clip-media waveform" : "nle-clip-media"}
      style={view.action.kind === "media.thumbnail" ? { left: 0, width: "100%" } : { left, width }}>
      {atlas === undefined ? <img src={resource} alt=""/> : atlas.samples.map(({ tile }, index) => {
        const column = tile % atlas.columns, row = Math.floor(tile / atlas.columns);
        const x = atlas.columns === 1 ? 0 : column / (atlas.columns - 1) * 100;
        const y = atlas.rows === 1 ? 0 : row / (atlas.rows - 1) * 100;
        return <span key={index} style={{
          backgroundImage: `url("${resource}")`, backgroundSize: `${atlas.columns * 100}% ${atlas.rows * 100}%`,
          backgroundPosition: `${x}% ${y}%`,
        }}/>;
      })}
    </span>;
  });
}
