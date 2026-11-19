import type { NleItem, NleMediaItem } from "@hypit/nle";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NleStudioMediaEntry, NleStudioSession } from "../protocol.js";
import { audioPeaks, compoundFilm, sourceClock, videoFrame, type AudioPeaks } from "./clipMediaData.js";

const maximumFrames = 40, waveformStride = 6, waveformBar = 2.4;

type FilmstripSize = { readonly width: number; readonly height: number; readonly pixels: number; readonly fps: number };

/** A strip of source frames across a picture Media clip: images repeat, videos sample their mapped source time. */
export function ClipFilmstrip({ item, entry, ...size }: FilmstripSize & {
  readonly item: NleMediaItem;
  readonly entry: NleStudioMediaEntry;
}) {
  const clock = useMemo(() => sourceClock(item), [item]);
  return <Filmstrip clock={clock} entry={entry} {...size}/>;
}

/** A Composition item previewed through its lowest picture Media; empty tiles where that Media is absent. */
export function CompoundFilmstrip({ session, item, ...size }: FilmstripSize & {
  readonly session: NleStudioSession;
  readonly item: NleItem;
}) {
  const film = useMemo(() => compoundFilm(session, item), [session, item]);
  return film ? <Filmstrip clock={film.clock} entry={film.entry} {...size}/> : null;
}

function Filmstrip({ clock, entry, width, height, pixels, fps }: FilmstripSize & {
  readonly clock: (local: number) => number | undefined;
  readonly entry: NleStudioMediaEntry;
}) {
  const image = entry.mediaType?.startsWith("image/") ?? false;
  const frameWidth = Math.max(24, Math.round(height * 16 / 9));
  const count = Math.max(1, Math.min(maximumFrames, Math.ceil(width / (frameWidth + 3))));
  const tileWidth = count === maximumFrames ? width / count - 3 : frameWidth;
  const times = useMemo(() => Array.from({ length: count }, (_, index) =>
    clock(((index + .5) * (tileWidth + 3)) / pixels / fps)), [count, tileWidth, pixels, fps, clock]);
  const [sources, setSources] = useState<readonly (string | undefined)[]>([]);
  useEffect(() => {
    if (image || !entry.resource) return;
    let disposed = false;
    setSources([]);
    times.forEach((time, index) => { if (time !== undefined) void videoFrame(entry.resource!, time).then(source => {
      if (!disposed) setSources(previous => { const next = [...previous]; next[index] = source; return next; });
    }, () => undefined); });
    return () => { disposed = true; };
  }, [image, entry.resource, times]);
  return <span className="nle-clip-film" aria-hidden="true">{times.map((time, index) => {
    const source = time === undefined ? undefined : image ? entry.resource : sources[index];
    return <span key={index} className="nle-clip-frame" style={{ width: tileWidth }}>{source && <img src={source} alt="" draggable={false}/>}</span>;
  })}</span>;
}

/** Brand-coloured loudness bars for an audio Media clip, sampled through the clip's source-time mapping. */
export function ClipWaveform({ item, entry, width, inset = 0, pixels, fps }: {
  readonly item: NleMediaItem;
  readonly entry: NleStudioMediaEntry;
  readonly width: number;
  /** Leading pixels kept clear for the clip icon; bars stay aligned to their own time. */
  readonly inset?: number;
  readonly pixels: number;
  readonly fps: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useMemo(() => sourceClock(item), [item]);
  const [data, setData] = useState<AudioPeaks>();
  useEffect(() => {
    if (!entry.resource) return;
    let disposed = false;
    void audioPeaks(entry.resource).then(value => { if (!disposed) setData(value); }, () => undefined);
    return () => { disposed = true; };
  }, [entry.resource]);
  useEffect(() => {
    const element = canvas.current;
    if (!element || !data) return;
    const ratio = window.devicePixelRatio || 1, drawWidth = Math.min(8000, Math.max(1, Math.round(width))), drawHeight = element.clientHeight;
    element.width = drawWidth * ratio; element.height = drawHeight * ratio; element.style.width = `${drawWidth}px`;
    const context = element.getContext("2d")!;
    context.scale(ratio, ratio); context.clearRect(0, 0, drawWidth, drawHeight);
    context.fillStyle = getComputedStyle(element).color;
    for (let x = Math.max(waveformStride, Math.ceil(inset / waveformStride) * waveformStride); x < drawWidth - waveformStride; x += waveformStride) {
      const source = clock(x / pixels / fps);
      if (source === undefined || source > data.duration) continue;
      const peak = data.peaks[Math.min(data.peaks.length - 1, Math.floor(source / data.duration * data.peaks.length))] ?? 0;
      const barHeight = Math.max(4, peak * drawHeight * .8);
      context.beginPath();
      context.roundRect(x, (drawHeight - barHeight) / 2, waveformBar, barHeight, waveformBar / 2);
      context.fill();
    }
  }, [data, width, inset, pixels, fps, clock]);
  return <canvas ref={canvas} className="nle-clip-wave" aria-hidden="true"/>;
}
