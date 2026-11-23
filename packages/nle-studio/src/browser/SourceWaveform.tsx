import { mediaPreviewSampleRate, waveformPeaksPerBlock, waveformPreviewResolution } from "@hypit/media";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSourcePreview, type PreviewSource } from "./source-preview.js";
import { rasterizeWaveform, selectWaveformTier } from "./waveform.js";

type WaveformTier = NonNullable<ReturnType<typeof selectWaveformTier>>;
const refinementDuration = 100;

type WaveformPaint = {
  readonly identity: string;
  readonly tier: WaveformTier;
  readonly transition?: { readonly tier: WaveformTier; readonly startedAt: number };
};

export function SourceWaveform({ source, duration, active = true, centered = false,
  fromSeconds = 0, toSeconds = duration, placeholder }: {
  readonly source: PreviewSource;
  readonly duration: number;
  readonly active?: boolean;
  readonly centered?: boolean;
  readonly fromSeconds?: number;
  readonly toSeconds?: number;
  readonly placeholder?: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const paint = useRef<WaveformPaint>(undefined);
  const paintedInterval = useRef<readonly [number, number]>(undefined);
  const [size, setSize] = useState({ columns: 0, rows: 0 });
  const [painted, setPainted] = useState<string>();
  const identity = source.target === undefined ? JSON.stringify([source.media, source.version ?? source.generation])
    : JSON.stringify(source.target);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (element === null) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const columns = Math.min(8192, Math.ceil(width * ratio));
      const rows = Math.ceil(height * ratio);
      setSize(old => old.columns === columns && old.rows === rows ? old : { columns, rows });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { columns, rows } = size;
  const secondsPerPixel = Math.abs(toSeconds - fromSeconds) / Math.max(1, columns);
  // Sample past display resolution so a refined peak can move by less than a pixel in normal zoom steps.
  const samplesPerPeak = waveformPreviewResolution(secondsPerPixel / 2);
  const blockSamples = samplesPerPeak * waveformPeaksPerBlock;
  const first = Math.max(0, Math.floor(Math.min(fromSeconds, toSeconds) * mediaPreviewSampleRate / blockSamples) - 1);
  const last = Math.min(Math.ceil(Math.round(duration * mediaPreviewSampleRate) / blockSamples),
    Math.ceil(Math.max(fromSeconds, toSeconds) * mediaPreviewSampleRate / blockSamples) + 1);
  const sampling = columns > 0 && secondsPerPixel > 0 && last > first;
  const selection = useMemo(() => !sampling ? undefined
    : { preset: "waveform" as const, samplesPerPeak, blocks: Array.from({ length: last - first }, (_, i) => first + i) },
  [sampling, first, last, samplesPerPeak]);
  const blocks = useSourcePreview(source, selection, active);
  const tier = useMemo(() => selectWaveformTier(blocks, fromSeconds, toSeconds), [blocks, fromSeconds, toSeconds]);
  useLayoutEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!active || !element || !context || columns === 0 || rows === 0) return;
    if (tier === undefined) {
      if (paintedInterval.current?.[0] !== fromSeconds || paintedInterval.current?.[1] !== toSeconds) {
        paint.current = undefined;
        setPainted(undefined);
      }
      return;
    }
    const current = paint.current?.identity === identity ? paint.current : undefined;
    const now = performance.now();
    const transition = current === undefined || window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? undefined : current.tier.resolution === tier.resolution ? current.transition : { tier: current.tier, startedAt: now };
    paint.current = { identity, tier, ...(transition === undefined ? {} : { transition }) };
    const amplitudes = rasterizeWaveform(tier, fromSeconds, toSeconds, columns);
    const previous = transition === undefined ? undefined : rasterizeWaveform(transition.tier, fromSeconds, toSeconds, columns);
    if (element.width !== columns) element.width = columns;
    if (element.height !== rows) element.height = rows;
    context.fillStyle = getComputedStyle(element).color;
    const baseline = centered ? rows / 2 : rows;
    let pending = 0;
    const draw = (at: number) => {
      const mix = transition === undefined ? 1 : Math.min(1, Math.max(0, (at - transition.startedAt) / refinementDuration));
      const y = (x: number) => {
        const peak = amplitudes[x]!;
        return (previous === undefined || mix === 1 ? peak : previous[x]! * (1 - mix) + peak * mix) * baseline;
      };
      context.clearRect(0, 0, columns, rows);
      context.beginPath();
      context.moveTo(0, baseline - y(0));
      for (let x = 0; x < columns; x += 1) context.lineTo(x + 0.5, baseline - y(x));
      context.lineTo(columns, baseline - y(columns - 1));
      if (centered) {
        context.lineTo(columns, baseline + y(columns - 1));
        for (let x = columns - 1; x >= 0; x -= 1) context.lineTo(x + 0.5, baseline + y(x));
        context.lineTo(0, baseline + y(0));
      } else {
        context.lineTo(columns, baseline);
        context.lineTo(0, baseline);
      }
      context.closePath();
      context.fill();
      if (mix < 1) pending = requestAnimationFrame(draw);
      else paint.current = { identity, tier };
    };
    draw(now);
    paintedInterval.current = [fromSeconds, toSeconds];
    setPainted(identity);
    return () => cancelAnimationFrame(pending);
  }, [active, centered, columns, fromSeconds, identity, rows, tier, toSeconds]);
  const ready = painted === identity;
  return <><canvas ref={canvas} className="media-waveform" style={{ visibility: ready ? "visible" : "hidden" }} aria-hidden="true"/>
    {!ready && placeholder}</>;
}
