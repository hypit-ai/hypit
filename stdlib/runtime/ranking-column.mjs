import {
  elements,
  html,
  material,
  numberAttr,
  projectWindow,
  resolveAttr,
  stringAttr,
  trackOutput,
} from "./helpers.mjs";

const GRADIENT_STOPS = [
  "#ff3f56",
  "#ff741f",
  "#ffb832",
  "#ffd82f",
  "#d4df24",
  "#94c93a",
  "#52bea0",
  "#31add0",
];

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixHex(a, b, progress) {
  const from = hexToRgb(a);
  const to = hexToRgb(b);
  const mixed = from.map((value, index) =>
    Math.round(value + (to[index] - value) * progress));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function rankColor(index, total) {
  const progress = total <= 1 ? 0 : index / Math.max(1, total - 1);
  const scaled = progress * (GRADIENT_STOPS.length - 1);
  const stop = Math.min(GRADIENT_STOPS.length - 2, Math.floor(scaled));
  return mixHex(GRADIENT_STOPS[stop], GRADIENT_STOPS[stop + 1], scaled - stop);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - ((-2 * value + 2) ** 3) / 2;
}

function outBack(value) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * ((value - 1) ** 3) + c1 * ((value - 1) ** 2);
}

function activeKeyframes(args) {
  const {
    durationFrames,
    durationSec,
    fps,
    stageCx,
    stageCy,
    stageSize,
    targetCx,
    targetCy,
    targetSize,
    frameHeight,
  } = args;
  const enterPart = Math.min(1, 0.45 / Math.max(0.001, durationSec));
  const exitStart = Math.min(
    1,
    Math.max(enterPart, 1 - 0.55 / Math.max(0.001, durationSec)),
  );
  const frames = [];
  for (let frame = 0; frame <= durationFrames; frame += 1) {
    const local = clamp01(frame / Math.max(1, durationFrames));
    let centerX = stageCx;
    let centerY = stageCy;
    let size = stageSize;
    let opacity = 1;
    let breathe = 1;
    let rotate = 0;
    let shadow = "0 12px 30px rgba(0,0,0,.22)";
    if (local < enterPart) {
      const progress = outBack(clamp01(local / enterPart));
      centerY = lerp(frameHeight + stageSize * 0.25, stageCy, progress);
      opacity = Math.min(1, progress * 2.2);
      breathe = 0.96 + 0.04 * progress;
    } else if (local < exitStart) {
      const idle = (local - enterPart) / Math.max(0.001, exitStart - enterPart);
      const wave = Math.sin(idle * Math.PI * 2);
      const wave2 = Math.sin(idle * Math.PI * 2 + Math.PI / 2);
      centerY = stageCy - 1.8 * wave;
      centerX = stageCx + 0.8 * wave2;
      breathe = 1.004 + 0.003 * wave2;
      rotate = 0.12 * wave;
      shadow = "0 14px 34px rgba(0,0,0,.24)";
    } else {
      const progress = easeInOutCubic(
        clamp01((local - exitStart) / Math.max(0.001, 1 - exitStart)),
      );
      centerX = lerp(stageCx, targetCx, progress);
      centerY = lerp(stageCy, targetCy, progress);
      size = lerp(stageSize, targetSize, progress);
      breathe = 1 - 0.02 * Math.sin(progress * Math.PI);
    }
    frames.push(
      `${(frame / Math.max(1, durationFrames) * 100).toFixed(5)}% {`
      + `left:${(centerX - size / 2).toFixed(3)}px;`
      + `top:${(centerY - size / 2).toFixed(3)}px;`
      + `width:${size.toFixed(3)}px;`
      + `height:${size.toFixed(3)}px;`
      + `opacity:${opacity.toFixed(5)};`
      + `transform:scale(${breathe.toFixed(6)}) rotate(${rotate.toFixed(5)}deg);`
      + `box-shadow:${shadow};`
      + "}",
    );
  }
  return frames.join("\n");
}

export default {
  abiVersion: "1",
  project(context) {
    const z = numberAttr(context.element, "z");
    const x = Math.round(context.width * numberAttr(context.element, "x", 0));
    const y = Math.round(context.height * numberAttr(context.element, "y", 0.17));
    const rowH = Math.round(context.height * numberAttr(context.element, "rowHeight", 0.071));
    const gap = Math.round(context.height * numberAttr(context.element, "gap", 0.011));
    const width = Math.round(context.width * numberAttr(context.element, "width", 0.305));
    const pad = Math.max(8, Math.round(rowH * 0.13));
    const total = elements(context, "item").length;
    const boardH = total * rowH + Math.max(0, total - 1) * gap + pad * 2;
    const stageSize = Math.round(context.width * numberAttr(context.element, "stageSize", 0.33));
    const stageCx = Math.round(context.width * numberAttr(context.element, "stageX", 0.66));
    const stageCy = Math.round(context.height * numberAttr(context.element, "stageY", 0.73));
    const boardStartFrame = context.element.attributes.at
      ? context.moment(context.element.attributes.at, "at")[0]
      : 0;
    const cellLeft = x + pad + rowH + Math.max(8, Math.round(rowH * 0.16));
    const rows = Array.from({ length: total }, (_, index) => {
      const top = pad + index * (rowH + gap);
      return `<div style="position:absolute;left:${pad}px;top:${top}px;width:${rowH}px;height:${rowH}px;border-radius:${Math.round(rowH * 0.075)}px;background:${rankColor(index, total)};display:flex;align-items:center;justify-content:center;color:white;font:900 ${Math.round(rowH * 0.48)}px/1 Arial,sans-serif;letter-spacing:-0.04em;text-shadow:0 1px 1px rgba(0,0,0,.12)"><span style="display:inline-block;transform:scaleX(1.02);transform-origin:center center">${index + 1}</span></div>
<div style="position:absolute;left:${pad + rowH + Math.max(8, Math.round(rowH * 0.16))}px;top:${top}px;width:${rowH}px;height:${rowH}px;border-radius:${Math.round(rowH * 0.23)}px;border:1.5px solid rgba(255,255,255,.18);background:rgba(0,0,0,.72);overflow:hidden"></div>`;
    }).join("");
    const visuals = [{
      id: `${context.instance.id}:board`,
      kind: "html",
      startFrame: boardStartFrame,
      endFrameExclusive: context.program.durationFrames,
      z,
      html: rows,
      style: {
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${boardH}px`,
        "border-radius": `${Math.round(rowH * 0.16)}px`,
        background: "rgba(7,8,12,.94)",
        padding: `${pad}px`,
        "box-shadow": "0 6px 18px rgba(0,0,0,.35)",
      },
    }];
    const audios = [];
    const appear = context.element.attributes.appearSound
      ? material(resolveAttr(context, context.element, "appearSound"), "audio")
      : undefined;
    const move = context.element.attributes.moveSound
      ? material(resolveAttr(context, context.element, "moveSound"), "audio")
      : undefined;
    for (const item of elements(context, "item")) {
      const id = stringAttr(item, "id");
      const image = material(resolveAttr(context, item, "image"), "image");
      const rank = Math.max(1, Math.min(total, numberAttr(item, "rank")));
      const base = context.selection(item.attributes.during, "item.during")[0];
      const range = projectWindow(base, item.attributes.window, context.fps);
      const visibleRange = {
        ...range,
        startFrame: Math.max(boardStartFrame, range.startFrame),
      };
      const top = y + pad + (rank - 1) * (rowH + gap);
      const settledStartFrame = Math.max(boardStartFrame, range.endFrameExclusive);
      const endDuration = (context.program.durationFrames - settledStartFrame) / context.fps;
      if (endDuration > 0) {
        visuals.push({
          id: `${context.instance.id}:${id}:settled`,
          kind: "image",
          source: image.source,
          startFrame: settledStartFrame,
          endFrameExclusive: context.program.durationFrames,
          z: z + 1,
          style: {
            left: `${cellLeft}px`,
            top: `${top}px`,
            width: `${rowH}px`,
            height: `${rowH}px`,
            "border-radius": `${Math.round(rowH * 0.23)}px`,
            background: "rgba(255,255,255,.98)",
            overflow: "hidden",
          },
          innerStyle: {
            width: "100%",
            height: "100%",
            "object-fit": "cover",
            transform: "scale(1.1)",
          },
        });
      }
      if (visibleRange.endFrameExclusive <= visibleRange.startFrame) continue;
      const keyframes = `svml-rank-${context.instance.id}-${id}`.replaceAll(/[^A-Za-z0-9_-]/gu, "-");
      const durationFrames = Math.max(1, visibleRange.endFrameExclusive - visibleRange.startFrame);
      const duration = durationFrames / context.fps;
      const targetCx = cellLeft + rowH / 2;
      const targetCy = top + rowH / 2;
      visuals.push({
        id: `${context.instance.id}:${id}:active`,
        kind: "image",
        source: image.source,
        startFrame: visibleRange.startFrame,
        endFrameExclusive: visibleRange.endFrameExclusive,
        z: z + 2,
        style: {
          left: `${stageCx - stageSize / 2}px`,
          top: `${stageCy - stageSize / 2}px`,
          width: `${stageSize}px`,
          height: `${stageSize}px`,
          "border-radius": `${Math.round(stageSize * 0.23)}px`,
          background: "rgba(255,255,255,.98)",
          "box-shadow": "0 14px 34px rgba(0,0,0,.24)",
          "transform-origin": "center center",
          overflow: "hidden",
          animation: `${keyframes} ${duration}s linear both`,
        },
        innerStyle: {
          width: "100%",
          height: "100%",
          "object-fit": "cover",
          transform: "scale(1.1)",
        },
        css: `@keyframes ${keyframes} {
${activeKeyframes({
  durationFrames,
  durationSec: duration,
  fps: context.fps,
  stageCx,
  stageCy,
  stageSize,
  targetCx,
  targetCy,
  targetSize: rowH,
  frameHeight: context.height,
})}
}`,
      });
      if (appear) {
        audios.push({
          id: `${context.instance.id}:${id}:appear`,
          source: appear.source,
          startFrame: visibleRange.startFrame,
          endFrameExclusive: Math.min(
            context.program.durationFrames,
            visibleRange.startFrame + Math.round(0.247021 * context.fps),
          ),
          volume: numberAttr(context.element, "appearGain", 0.09),
          bus: "sfx",
        });
      }
      if (move) {
        const moveFrames = Math.round(0.6 * context.fps);
        audios.push({
          id: `${context.instance.id}:${id}:move`,
          source: move.source,
          startFrame: Math.max(visibleRange.startFrame, visibleRange.endFrameExclusive - Math.round(0.55 * context.fps)),
          endFrameExclusive: Math.min(context.program.durationFrames, visibleRange.endFrameExclusive - Math.round(0.55 * context.fps) + moveFrames),
          volume: numberAttr(context.element, "moveGain", 0.1),
          bus: "sfx",
        });
      }
    }
    return trackOutput(visuals, audios);
  },
};
