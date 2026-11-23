import { addExactTemporalValues, compareExactTemporalValues, createTemporalMapEvaluator, exactTemporalZero, isAffineTemporalMapPiece,
  type TemporalRate } from "@hypit/temporal/algebra";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NleTimelineSceneTrack } from "@hypit/nle/surface";
import type { NleStudioTimelineAudioPreviewSource, NleStudioTimelinePreview, NleStudioTimelineProjection } from "../protocol.js";
import { SourceWaveform } from "./SourceWaveform.js";
import { SourceFilmstrip } from "./SourceFilmstrip.js";
import { mediaSeconds, sampleTime } from "./source-preview.js";
import { rowSize, rulerHeight } from "./timelineGeometry.js";
import type { TimelineViewport } from "./useTimelineViewport.js";

type PreviewWindow = { readonly left: number; readonly right: number };
const overscan = 108;
const retainedPreviews = 32;

export function useTimelineMedia(
  { previewSources, scene }: NleStudioTimelineProjection,
  tracks: readonly NleTimelineSceneTrack[],
  frameWidth: number,
  viewport: TimelineViewport,
  trackPadding: number,
) {
  const left = Math.max(0, viewport.left - overscan);
  const right = viewport.left + viewport.width + overscan;
  const top = viewport.top + rulerHeight - overscan;
  const bottom = viewport.top + viewport.height + overscan;
  const active = useMemo(() => {
    const items = new Set<string>();
    if (viewport.height === 0) return items;
    let y = rulerHeight + trackPadding;
    for (const track of tracks) {
      const end = y + rowSize(track);
      if (y >= bottom) break;
      if (end > top) {
        for (const item of track.items) {
          if (previewSources[item.id] !== undefined && item.startFrame * frameWidth < right
            && (item.startFrame + item.durationFrames) * frameWidth > left) items.add(item.id);
        }
      }
      y = end;
    }
    return items;
  }, [previewSources, tracks, frameWidth, viewport.height, trackPadding, left, right, top, bottom]);

  const [held, setHeld] = useState<{ composition: string; items: ReadonlySet<string> }>();
  const composition = scene.composition;
  useLayoutEffect(() => {
    setHeld(previous => {
      const recent = previous?.composition === composition
        ? [...previous.items].filter(id => !active.has(id) && previewSources[id] !== undefined) : [];
      const items = new Set([...recent.slice(-retainedPreviews), ...active]);
      if (previous?.composition === composition && previous.items.size === items.size
        && [...items].every(id => previous.items.has(id))) return previous;
      return { composition, items };
    });
  }, [active, composition, previewSources]);
  return { left, right, active, retained: held?.composition === composition ? held.items : active };
}

function TimelineAudio({ source, generation, pixelsPerSecond, from, until, active }: {
  readonly source: NleStudioTimelineAudioPreviewSource;
  readonly generation: number;
  readonly pixelsPerSecond: number;
  readonly from: number;
  readonly until: number;
  readonly active: boolean;
}) {
  const duration = mediaSeconds(source.duration);
  return source.sourceTime.stages[0]!.pieces.map((piece, index) => {
    if (!isAffineTemporalMapPiece(piece) || piece.wrap !== undefined || piece.rate.numerator === 0) return null;
    const itemStart = mediaSeconds(piece.target.start);
    const sourceStart = mediaSeconds(piece.sourceAtStart);
    const rate = piece.rate.numerator / piece.rate.denominator;
    const zeroAt = itemStart - sourceStart / rate;
    const endAt = itemStart + (duration - sourceStart) / rate;
    const start = Math.max(from / pixelsPerSecond, itemStart, Math.min(zeroAt, endAt));
    const end = Math.min(until / pixelsPerSecond, mediaSeconds(piece.target.end), Math.max(zeroAt, endAt));
    if (!(end > start)) return null;
    return <span key={index} className="nle-clip-media waveform"
      style={{ left: start * pixelsPerSecond - from, width: (end - start) * pixelsPerSecond }}>
      <SourceWaveform source={"target" in source ? source : { media: source.media, generation, version: source.version }} duration={duration}
        active={active} fromSeconds={sourceStart + (start - itemStart) * rate} toSeconds={sourceStart + (end - itemStart) * rate}/>
    </span>;
  });
}

export function TimelineSourcePreview({ source: { picture, audio }, pictureItem, generation, origin, duration, start, frameWidth, editRate,
  viewport, active }: {
  readonly source: NleStudioTimelinePreview;
  readonly pictureItem: boolean;
  readonly generation: number;
  readonly origin: number;
  readonly duration: number;
  readonly start: number;
  readonly frameWidth: number;
  readonly editRate: TemporalRate;
  readonly viewport: PreviewWindow;
  readonly active: boolean;
}) {
  const strip = useRef<HTMLSpanElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = strip.current;
    if (element === null) return;
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const sourceTime = picture?.sourceTime;
  const sourceDuration = picture?.duration;
  const evaluate = useMemo(() => sourceTime === undefined ? undefined
    : createTemporalMapEvaluator(sourceTime), [sourceTime]);
  const targetKey = picture !== undefined && "target" in picture ? JSON.stringify(picture.target) : undefined;
  const [extent, setExtent] = useState<{ readonly target: string; readonly aspect: number }>();
  const onPictureAspect = useCallback((aspect: number) => {
    if (targetKey === undefined || !Number.isFinite(aspect) || aspect <= 0) return;
    setExtent(previous => previous?.target === targetKey && previous.aspect === aspect ? previous : { target: targetKey, aspect });
  }, [targetKey]);
  const aspect = picture?.displayAspectRatio ?? (extent?.target === targetKey ? extent?.aspect : undefined);
  const tileRatio = Math.min(2, Math.max(1 / 2, aspect ?? 1));
  const cellWidth = picture === undefined ? 64 : height * tileRatio;
  const from = cellWidth === 0 ? 0 : Math.max(0, Math.floor((viewport.left - origin * frameWidth) / cellWidth) * cellWidth);
  const until = cellWidth === 0 ? 0 : Math.min(duration * frameWidth,
    Math.ceil((viewport.right - origin * frameWidth) / cellWidth) * cellWidth);
  const drawing = active && from < until;
  const [lastWindow, setLastWindow] = useState<readonly [number, number]>();
  useLayoutEffect(() => {
    if (!drawing) return;
    setLastWindow(previous => previous?.[0] === from && previous[1] === until ? previous : [from, until]);
  }, [drawing, from, until]);
  const drawFrom = drawing ? from : lastWindow?.[0] ?? 0;
  const drawUntil = drawing ? until : lastWindow?.[1] ?? 0;
  const { numerator, denominator } = editRate;
  const pixelsPerSecond = frameWidth * numerator / denominator;
  const range = picture !== undefined && "range" in picture ? picture.range : undefined;
  const sourceAt = useCallback((pixels: number) => {
    if (range !== undefined) {
      const time = addExactTemporalValues(range.start, sampleTime((drawFrom + pixels) / pixelsPerSecond));
      return compareExactTemporalValues(time, range.end) < 0 ? time : undefined;
    }
    if (evaluate === undefined) return exactTemporalZero();
    const time = evaluate(sampleTime((drawFrom + pixels) / pixelsPerSecond), "after")?.position;
    return time !== undefined && sourceDuration !== undefined && compareExactTemporalValues(time, sourceDuration) < 0 ? time : undefined;
  }, [evaluate, pixelsPerSecond, drawFrom, sourceDuration, range]);
  const stripWidth = Math.max(0, drawUntil - drawFrom);
  const pictureLayout = { width: stripWidth, height };
  const waveform = drawFrom < drawUntil && audio !== undefined
    ? <TimelineAudio source={audio} generation={generation} pixelsPerSecond={pixelsPerSecond}
        from={drawFrom} until={drawUntil} active={drawing}/>
    : undefined;
  return <span ref={strip} className="nle-clip-media" aria-hidden="true"
    style={{ left: (origin - start) * frameWidth + drawFrom, width: stripWidth }}>
    {drawFrom < drawUntil && picture !== undefined && <SourceFilmstrip className="nle-clip-filmstrip" active={drawing}
      source={"target" in picture ? picture : { media: picture.media, generation, version: picture.version }}
      sourceAt={sourceAt} tileRatio={tileRatio} layout={pictureLayout}
      timed={range !== undefined || sourceTime !== undefined} onPictureAspect={onPictureAspect}/>}
    {pictureItem && waveform !== undefined ? <span className="nle-clip-audio-band">{waveform}</span> : waveform}
  </span>;
}
