import { sliceNleTimeMapping } from "@hypit/nle";
import { addExactTemporalValues, compareExactTemporalValues, createTemporalMapEvaluator, exactTemporalZero, isAffineTemporalMapPiece,
  subtractExactTemporalValues, type ExactTemporalValue, type TemporalMap, type TemporalRate } from "@hypit/temporal/algebra";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NleTimelineSceneTrack } from "@hypit/nle/surface";
import type { NleStudioTimelineAudioPreviewSource, NleStudioTimelinePreview, NleStudioTimelineProjection } from "../protocol.js";
import { studioFrameTime } from "../timeline-time.js";
import { SourceWaveform } from "./SourceWaveform.js";
import { SourceFilmstrip } from "./SourceFilmstrip.js";
import { mediaSeconds, sampleTime } from "./source-preview.js";
import { rowSize, rulerHeight } from "./timelineGeometry.js";
import type { TimelineViewport } from "./useTimelineViewport.js";

type PreviewWindow = { readonly left: number; readonly right: number };
export type TimelinePreviewTrim = { readonly edge: "start" | "end"; readonly atFrame: number };
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

function trimSourceTime(source: TemporalMap | undefined, start: ExactTemporalValue,
  trims: readonly TimelinePreviewTrim[] | undefined, rate: TemporalRate) {
  let stage = source?.stages[0];
  for (const { edge, atFrame } of trims ?? []) {
    const at = studioFrameTime(atFrame, rate);
    const offset = subtractExactTemporalValues(at, start);
    if (stage !== undefined) {
      const range = edge === "start"
        ? { start: offset, end: stage.target.duration }
        : { start: exactTemporalZero(), end: offset };
      const { pieces } = sliceNleTimeMapping({ pieces: stage.pieces }, stage.target.duration, range);
      stage = { ...stage, target: { ...stage.target, duration: subtractExactTemporalValues(range.end, range.start) }, pieces };
    }
    if (edge === "start") start = at;
  }
  return { start, clock: stage === undefined ? undefined : { stages: [stage] } };
}

function TimelineAudio({ source, clock, generation, pixelsPerSecond, from, until, active }: {
  readonly source: NleStudioTimelineAudioPreviewSource;
  readonly clock: TemporalMap;
  readonly generation: number;
  readonly pixelsPerSecond: number;
  readonly from: number;
  readonly until: number;
  readonly active: boolean;
}) {
  const duration = mediaSeconds(source.duration);
  return clock.stages[0]!.pieces.map((piece, index) => {
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

export function TimelineSourcePreview({ source, pictureItem, generation, authored, window, trims, frameWidth, editRate, viewport, active }: {
  readonly source: NleStudioTimelinePreview;
  readonly pictureItem: boolean;
  readonly generation: number;
  readonly authored: { readonly startFrame: number; readonly durationFrames: number };
  readonly window: { readonly start: number; readonly duration: number };
  readonly trims?: readonly TimelinePreviewTrim[] | undefined;
  readonly frameWidth: number;
  readonly editRate: TemporalRate;
  readonly viewport: PreviewWindow;
  readonly active: boolean;
}) {
  const { picture, audio } = source;
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
  const sourceTime = picture?.sourceTime ?? audio?.sourceTime;
  const sourceDuration = picture?.duration;
  const sample = useMemo(() => {
    try {
      const { start, clock } = trimSourceTime(sourceTime, source.start, trims, editRate);
      return { start, clock, evaluate: clock === undefined ? undefined : createTemporalMapEvaluator(clock), drafted: true };
    } catch (error) {
      // A queued trim can briefly outlive the accepted window it was planned against.
      if (trims === undefined) throw error;
      return { start: source.start, clock: sourceTime,
        evaluate: sourceTime === undefined ? undefined : createTemporalMapEvaluator(sourceTime), drafted: false };
    }
  }, [sourceTime, source.start, trims, editRate]);
  const origin = sample.drafted ? window.start : authored.startFrame;
  const duration = sample.drafted ? window.duration : authored.durationFrames;
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
  const lastComponentFrame = useMemo(() => {
    if (range === undefined) return undefined;
    const last = subtractExactTemporalValues(range.end, studioFrameTime(1, editRate));
    return compareExactTemporalValues(last, range.start) > 0 ? last : range.start;
  }, [range, editRate]);
  const sourceAt = useCallback((pixels: number) => {
    const local = sampleTime((drawFrom + pixels) / pixelsPerSecond);
    if (range !== undefined) {
      const time = addExactTemporalValues(sample.start, local);
      if (trims !== undefined && sample.drafted) {
        // Component frames outside the committed window do not exist until the edit is published.
        if (compareExactTemporalValues(time, range.start) < 0) return range.start;
        if (compareExactTemporalValues(time, range.end) >= 0) return lastComponentFrame;
      }
      return compareExactTemporalValues(time, range.end) < 0 ? time : undefined;
    }
    if (picture?.sourceTime === undefined) return exactTemporalZero();
    const time = sample.evaluate?.(local, "after")?.position;
    return time !== undefined && sourceDuration !== undefined && compareExactTemporalValues(time, sourceDuration) < 0 ? time : undefined;
  }, [sample, pixelsPerSecond, drawFrom, sourceDuration, picture?.sourceTime, range, lastComponentFrame, trims]);
  const stripWidth = Math.max(0, drawUntil - drawFrom);
  const pictureLayout = { width: stripWidth, height };
  const waveform = drawFrom < drawUntil && audio !== undefined && sample.clock !== undefined
    ? <TimelineAudio source={audio} clock={sample.clock} generation={generation} pixelsPerSecond={pixelsPerSecond}
        from={drawFrom} until={drawUntil} active={drawing}/>
    : undefined;
  return <span ref={strip} className="nle-clip-media" aria-hidden="true"
    style={{ left: (origin - window.start) * frameWidth + drawFrom, width: stripWidth }}>
    {drawFrom < drawUntil && picture !== undefined && <SourceFilmstrip className="nle-clip-filmstrip" active={drawing}
      source={"target" in picture ? picture : { media: picture.media, generation, version: picture.version }}
      sourceAt={sourceAt} tileRatio={tileRatio} layout={pictureLayout}
      timed={range !== undefined || sourceTime !== undefined} onPictureAspect={onPictureAspect}/>}
    {pictureItem && waveform !== undefined ? <span className="nle-clip-audio-band">{waveform}</span> : waveform}
  </span>;
}
