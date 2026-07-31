import type { AudioFragment, VisualFragment } from "./runtime-contract.js";
import { escapeHtml } from "./util.js";

const TIME_PRECISION = 1_000_000_000;

/**
 * HyperFrames consumes seconds while SVML's Located IR is frame-exact.
 * Flooring, instead of emitting a raw repeating float, keeps the authored
 * interval half-open at frame boundaries:
 *
 *   startFrame <= frame < endFrameExclusive
 *
 * A raw value such as 32 / 30 can otherwise compare a few ulps above or below
 * the browser's frame clock and leak one extra rendered frame.
 */
export function frameSeconds(frame: number, fps: number): string {
  const value = Math.floor((frame / fps) * TIME_PRECISION) / TIME_PRECISION;
  return String(value);
}

function cssStyle(style: Record<string, string | number> | undefined): string {
  if (!style) return "";
  return Object.entries(style)
    .map(([name, value]) => `${name}:${String(value)}`)
    .join(";");
}

function attributes(values: Record<string, string> | undefined): string {
  if (!values) return "";
  return Object.entries(values)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join("");
}

function visualHtml(fragment: VisualFragment, fps: number, trackIndex: number): string {
  const start = frameSeconds(fragment.startFrame, fps);
  const duration = frameSeconds(fragment.endFrameExclusive - fragment.startFrame, fps);
  const common = [
    `id="${escapeHtml(fragment.id)}"`,
    'class="clip svml-fragment"',
    `data-start="${start}"`,
    `data-duration="${duration}"`,
    `data-track-index="${trackIndex}"`,
    `style="${escapeHtml(cssStyle({
      position: "absolute",
      "z-index": fragment.z,
      ...fragment.style,
    }))}"`,
  ].join(" ");
  if (fragment.kind === "html") {
    return `<div ${common}${attributes(fragment.attributes)}>${fragment.html ?? ""}</div>`;
  }
  if (fragment.kind === "image" && fragment.innerStyle) {
    const nestedSource = `${fragment.source ?? ""}#svml-${encodeURIComponent(fragment.id)}`;
    return `<div ${common}${attributes(fragment.attributes)}><img src="${escapeHtml(nestedSource)}" style="${escapeHtml(cssStyle(fragment.innerStyle))}"/></div>`;
  }
  const media = [
    fragment.mediaStartSec !== undefined ? `data-media-start="${fragment.mediaStartSec}"` : "",
    fragment.playbackRate !== undefined ? `data-playback-rate="${fragment.playbackRate}"` : "",
    fragment.kind === "video" && fragment.muted !== false ? "muted" : "",
    fragment.kind === "video" ? "playsinline" : "",
    fragment.kind === "video" && fragment.loop ? "loop" : "",
  ].filter(Boolean).join(" ");
  return `<${fragment.kind} ${common} ${media} src="${escapeHtml(fragment.source ?? "")}"${attributes(fragment.attributes)}></${fragment.kind}>`;
}

function audioHtml(fragment: AudioFragment, fps: number, trackIndex: number): string {
  const start = frameSeconds(fragment.startFrame, fps);
  const duration = frameSeconds(fragment.endFrameExclusive - fragment.startFrame, fps);
  const volume = fragment.volume ?? 1;
  return [
    `<audio id="${escapeHtml(fragment.id)}"`,
    `data-start="${start}"`,
    `data-duration="${duration}"`,
    `data-track-index="${trackIndex}"`,
    `data-volume="${volume}"`,
    fragment.bus ? `data-bus="${fragment.bus}"` : "",
    fragment.fadeInSec ? `data-fade-in="${fragment.fadeInSec}"` : "",
    fragment.fadeOutSec ? `data-fade-out="${fragment.fadeOutSec}"` : "",
    fragment.mediaStartSec !== undefined ? `data-media-start="${fragment.mediaStartSec}"` : "",
    fragment.playbackRate !== undefined ? `data-playback-rate="${fragment.playbackRate}"` : "",
    `src="${escapeHtml(fragment.source)}"></audio>`,
  ].filter(Boolean).join(" ");
}

export function emitHyperframesHtml(args: {
  id: string;
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  background: string;
  visuals: VisualFragment[];
  audios: AudioFragment[];
  styles?: string[];
}): string {
  const orderedVisuals = [...args.visuals].sort((left, right) =>
    left.z - right.z
    || (left.layer ?? 0) - (right.layer ?? 0)
    || left.startFrame - right.startFrame
    || left.id.localeCompare(right.id));
  const visuals = orderedVisuals.map((fragment, index) =>
    visualHtml(fragment, args.fps, index));
  const audios = args.audios.map((fragment, index) =>
    audioHtml(fragment, args.fps, orderedVisuals.length + index));
  const duration = frameSeconds(args.durationFrames, args.fps);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: ${args.background}; }
    [data-composition-id] { position: relative; overflow: hidden; background: ${args.background}; }
    .svml-fragment { box-sizing: border-box; }
    ${args.styles?.join("\n") ?? ""}
    ${orderedVisuals.map((item) => item.css ?? "").filter(Boolean).join("\n")}
  </style>
</head>
<body>
  <div data-composition-id="${escapeHtml(args.id)}"
       data-start="0"
       data-no-timeline
       data-width="${args.width}"
       data-height="${args.height}"
       data-duration="${duration}"
       data-fps="${args.fps}">
    ${visuals.join("\n    ")}
    ${audios.join("\n    ")}
  </div>
</body>
</html>
`;
}
