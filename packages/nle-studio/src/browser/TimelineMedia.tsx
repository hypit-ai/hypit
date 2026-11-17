import { useEffect, useState } from "react";
import type { NleStudioActionObservation, NleStudioOpenProjection, NleStudioTimelineMediaView } from "../protocol.js";
import { cancelAction, readAction, readTimelineMedia, startAction } from "./api.js";

type VisibleTracks = { readonly fromFrame: number; readonly toFrame: number; readonly tracks: readonly string[] };
type TimelineMediaResult = NleStudioTimelineMediaView & {
  readonly result: Extract<NleStudioActionObservation, { state: "complete" }>["result"];
};

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
  const [results, setResults] = useState<readonly TimelineMediaResult[]>([]);

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
    setResults([]);
    if (!derivedViews || visible === undefined || visible.tracks.length === 0 || visible.toFrame <= visible.fromFrame) return;
    let active = true;
    const pending = new Set<string>();
    const run = async (view: NleStudioTimelineMediaView) => {
      let action = await startAction(view.action);
      try {
        pending.add(action.handle);
        if (!active) {
          if (action.state === "queued" || action.state === "running") await cancelAction(action.handle);
          return;
        }
        while (active && (action.state === "queued" || action.state === "running")) {
          await new Promise<void>(resolve => window.setTimeout(resolve, 250));
          if (!active) return;
          action = await readAction(action.handle);
        }
        if (active && action.state === "complete") {
          const result = action.result;
          setResults(values => [...values, { ...view, result }]);
        }
      } finally {
        pending.delete(action.handle);
      }
    };
    void readTimelineMedia({
      kind: "timeline-media", composition: scene.composition, expectedProjectRevision: projectRevision,
      expectedViewRevision: viewRevision, expectedMediaGeneration: generation, ...visible,
    }).then(async views => {
      if (active) await Promise.allSettled(views.map(run));
    }).catch(() => undefined);
    return () => {
      active = false;
      for (const handle of pending) void cancelAction(handle).catch(() => undefined);
    };
  }, [derivedViews, visible, scene.composition, projectRevision, viewRevision, generation]);

  return results;
}

export function TimelineMedia({ views, item, start, frameWidth }: {
  readonly views: readonly TimelineMediaResult[];
  readonly item: string;
  readonly start: number;
  readonly frameWidth: number;
}) {
  return views.filter(view => view.item === item).map(view => {
    const { atlas, resource } = view.result;
    const left = (view.fromFrame - start) * frameWidth;
    const width = (view.toFrame - view.fromFrame) * frameWidth;
    const audio = view.action.kind === "media.waveform";
    return <span aria-hidden="true" key={view.action.kind}
      className={audio ? "nle-clip-media waveform" : "nle-clip-media"} style={{ left, width }}>
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
