import type { CSSProperties, PointerEvent } from "react";
import { timecode } from "./timecode.js";

const frameIntervals = [1, 2, 5, 10, 15];
const secondIntervals = [1, 2, 5, 10, 30, 60, 120, 300, 600];

export function TimelineRuler({ width, viewportLeft, viewportWidth, endFrame, pixels, fps, frame, onSeek }: {
  readonly viewportLeft: number;
  readonly width: number;
  readonly viewportWidth: number;
  readonly endFrame: number;
  readonly pixels: number;
  readonly fps: number;
  readonly frame: number;
  readonly onSeek: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const rate = Math.max(1, Math.round(fps));
  const frameStep = frameIntervals.find(step => step < rate && step * pixels >= 64);
  const tickSeconds = 78 / (pixels * fps);
  const seconds = secondIntervals.find(step => step >= tickSeconds) ?? Math.ceil(tickSeconds / 600) * 600;
  const step = frameStep ?? Math.max(1, Math.round(seconds * fps));
  const tickWidth = step * pixels;
  const first = Math.max(0, Math.floor((viewportLeft - viewportWidth) / tickWidth) - 1);
  const last = Math.min(Math.floor(endFrame / step), Math.ceil((viewportLeft + 2 * viewportWidth) / tickWidth) + 1);
  const label = (value: number) => {
    if (frameStep === undefined) return timecode(value, fps);
    const offset = value % rate;
    return offset === 0 ? timecode(value, fps).split(":").slice(0, -1).join(":") : `${offset}f`;
  };

  return <div className="nle-ruler">
    <div className="nle-ruler-label"/>
    <div className={`nle-ruler-scale${frameStep === 1 ? " single-frame" : ""}`} style={{ width }} onPointerDown={onSeek}>
      {Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => {
        const value = (first + index) * step;
        const midpoint = frameStep === undefined ? step / 2 : Math.floor(step / 2);
        return <span key={value} style={{ left: value * pixels, "--minor": `${midpoint * pixels}px` } as CSSProperties}>{label(value)}</span>;
      })}
      <i className={`nle-ruler-frame${pixels >= 8 ? " visible" : ""}`} style={{ left: frame * pixels, width: pixels }}/>
    </div>
  </div>;
}
