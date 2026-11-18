import { nleTimeMappingRequiredDuration, type NleMediaItem, type NlePictureLayout } from "@hypit/nle";
import { compareExactTemporalValues, createTemporalMapEvaluator, isAffineTemporalMapPiece, subtractExactTemporalValues, type ExactTemporalValue } from "@hypit/temporal/algebra";
import { useEffect, useMemo, useRef, type RefObject } from "react";

function seconds(time: ExactTemporalValue): number {
  return Number(time.ticks) * time.timeBase.numerator / time.timeBase.denominator;
}

function useMediaClock(element: RefObject<HTMLMediaElement | null>, item: NleMediaItem, at: ExactTemporalValue, playing: boolean, resource: string) {
  const evaluate = useMemo(() => {
    const sourceSpan = nleTimeMappingRequiredDuration(item.sourceTime);
    return createTemporalMapEvaluator({ stages: [{
      target: { id: "clip", duration: item.duration },
      source: { id: "source", duration: sourceSpan.ticks === "0" ? item.duration : sourceSpan },
      pieces: item.sourceTime.pieces,
    }] });
  }, [item]);
  const local = subtractExactTemporalValues(at, item.start);
  const sample = evaluate(local, "after");
  const piece = item.sourceTime.pieces.find(piece =>
    compareExactTemporalValues(local, piece.target.start) >= 0 && compareExactTemporalValues(local, piece.target.end) < 0);
  const rate = piece && isAffineTemporalMapPiece(piece) ? piece.rate.numerator / piece.rate.denominator : 0;
  const nativePlayback = playing && rate >= .25 && rate <= 4;
  const sourceTime = sample && Math.max(0, seconds(sample.position) - (sample.sourceSide === "before" ? .000001 : 0));
  const clock = useRef({ sourceTime, nativePlayback, rate, piece });
  clock.current = { sourceTime, nativePlayback, rate, piece };
  const synchronized = useRef<typeof clock.current | undefined>(undefined);
  const sync = useRef<() => void>(() => {});

  useEffect(() => {
    const media = element.current;
    if (!media) return;
    synchronized.current = undefined;
    const update = () => {
      if (media.readyState < 1) return;
      const next = clock.current, previous = synchronized.current;
      synchronized.current = next;
      if (next.sourceTime === undefined) { media.pause(); return; }
      const target = Math.min(next.sourceTime, Number.isFinite(media.duration) ? Math.max(0, media.duration - .000001) : next.sourceTime);
      if (!next.nativePlayback) media.pause();
      const tolerance = next.nativePlayback && previous?.nativePlayback && previous.piece === next.piece ? .12 : .000001;
      if (Math.abs(media.currentTime - target) > tolerance) media.currentTime = target;
      if (next.nativePlayback) {
        if (media.playbackRate !== next.rate) media.playbackRate = next.rate;
        if (media.paused && !media.ended) void media.play().catch(() => {});
      }
    };
    sync.current = update;
    media.addEventListener("loadedmetadata", update);
    return () => {
      media.removeEventListener("loadedmetadata", update);
      media.pause();
      sync.current = () => {};
    };
  }, [element, resource]);
  useEffect(() => sync.current(), [sourceTime, nativePlayback, rate, piece, resource]);
  return sourceTime !== undefined;
}

export function TimelineMedia({ item, resource, mediaType, at, playing, muted, layout }: {
  readonly item: NleMediaItem;
  readonly resource: string;
  readonly mediaType: string;
  readonly at: ExactTemporalValue;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly layout?: NlePictureLayout;
}) {
  const media = useRef<HTMLMediaElement | null>(null);
  const active = useMediaClock(media, item, at, playing, resource);
  const style = layout && { objectFit: layout.fit, objectPosition: `${(layout.contentX ?? .5) * 100}% ${(layout.contentY ?? .5) * 100}%` };
  if (mediaType.startsWith("image/")) return active && layout ? <img src={resource} alt="" draggable={false} style={style}/> : null;
  const audioMuted = muted || !active || !item.audio;
  if (layout && mediaType.startsWith("video/")) {
    return <video ref={node => { media.current = node; }} src={resource} preload="auto" muted={audioMuted} playsInline
      style={{ ...style, visibility: active ? "visible" : "hidden" }}/>;
  }
  if (item.audio) return <audio ref={node => { media.current = node; }} src={resource} preload="auto" muted={audioMuted}/>;
  return null;
}
