export function elements(context, name) {
  return context.element.children.filter((node) => node.kind === "element" && node.name === name);
}

export function stringAttr(element, name, fallback) {
  const value = element.attributes[name];
  if (typeof value === "string") return value;
  if (value === undefined && fallback !== undefined) return fallback;
  throw new Error(`<${element.name}> requires string attribute "${name}"`);
}

export function numberAttr(element, name, fallback) {
  const value = element.attributes[name];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (value === undefined && fallback !== undefined) return fallback;
  throw new Error(`<${element.name}> requires numeric attribute "${name}"`);
}

export function boolAttr(element, name, fallback) {
  const value = element.attributes[name];
  if (typeof value === "boolean") return value;
  if (value === undefined && fallback !== undefined) return fallback;
  throw new Error(`<${element.name}> requires boolean attribute "${name}"`);
}

export function resolveAttr(context, element, name) {
  return context.resolve(element.attributes[name]);
}

export function material(value, expected) {
  if (!value || typeof value !== "object") throw new Error(`expected ${expected ?? "media"} material`);
  const type = value.type ?? value.kind;
  if (expected && type && String(type).toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`expected ${expected}, received ${String(type)}`);
  }
  const source = value.absoluteSource ?? value.source;
  if (typeof source !== "string") throw new Error(`${expected ?? "media"} material has no source`);
  return { ...value, source };
}

function unitSeconds(raw) {
  const match = /^([+-]?\d+(?:\.\d+)?)(ms|s)$/u.exec(raw.trim());
  if (!match) throw new Error(`invalid relative time "${raw}"`);
  return Number(match[1]) * (match[2] === "ms" ? 0.001 : 1);
}

function endpoint(value, range) {
  const raw = value.trim();
  if (raw === "start") return range.startSec;
  if (raw === "end") return range.endSec;
  const match = /^(start|end)([+-]\d+(?:\.\d+)?(?:ms|s))$/u.exec(raw);
  if (!match) throw new Error(`invalid window endpoint "${value}"`);
  return (match[1] === "start" ? range.startSec : range.endSec) + unitSeconds(match[2]);
}

export function projectWindow(range, expression, fps) {
  if (!expression) return range;
  const parts = String(expression).split("..");
  if (parts.length !== 2) throw new Error(`invalid window "${expression}"`);
  const startSec = endpoint(parts[0], range);
  const endSec = endpoint(parts[1], range);
  const startFrame = Math.round(startSec * fps);
  const endFrameExclusive = Math.round(endSec * fps);
  if (endFrameExclusive < startFrame) throw new Error(`window "${expression}" resolves backwards`);
  return {
    startFrame,
    endFrameExclusive,
    startSec: startFrame / fps,
    endSec: endFrameExclusive / fps,
  };
}

export function html(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function trackOutput(visuals = [], audios = [], styles = []) {
  return {
    outputs: { track: { visuals, audios, styles } },
    visuals,
    audios,
    styles,
  };
}

export function intersectRange(left, right) {
  const startFrame = Math.max(left.startFrame, right.startFrame);
  const endFrameExclusive = Math.min(left.endFrameExclusive, right.endFrameExclusive);
  if (endFrameExclusive <= startFrame) return undefined;
  const fps = Math.round(
    (left.endFrameExclusive - left.startFrame) / Math.max(0.000001, left.endSec - left.startSec),
  );
  return {
    startFrame,
    endFrameExclusive,
    startSec: startFrame / fps,
    endSec: endFrameExclusive / fps,
  };
}

export function subtractRanges(base, cuts, fps) {
  const relevant = cuts
    .map((cut) => ({
      startFrame: Math.max(base.startFrame, cut.startFrame),
      endFrameExclusive: Math.min(base.endFrameExclusive, cut.endFrameExclusive),
    }))
    .filter((cut) => cut.endFrameExclusive > cut.startFrame)
    .sort((left, right) => left.startFrame - right.startFrame);
  const merged = [];
  for (const cut of relevant) {
    const previous = merged[merged.length - 1];
    if (previous && cut.startFrame <= previous.endFrameExclusive) {
      previous.endFrameExclusive = Math.max(previous.endFrameExclusive, cut.endFrameExclusive);
    } else {
      merged.push({ ...cut });
    }
  }
  const output = [];
  let cursor = base.startFrame;
  for (const cut of merged) {
    if (cut.startFrame > cursor) {
      output.push({
        startFrame: cursor,
        endFrameExclusive: cut.startFrame,
        startSec: cursor / fps,
        endSec: cut.startFrame / fps,
      });
    }
    cursor = Math.max(cursor, cut.endFrameExclusive);
  }
  if (cursor < base.endFrameExclusive) {
    output.push({
      startFrame: cursor,
      endFrameExclusive: base.endFrameExclusive,
      startSec: cursor / fps,
      endSec: base.endFrameExclusive / fps,
    });
  }
  return output;
}

function inherited(element, parent, name) {
  return element?.attributes[name] ?? parent?.attributes[name];
}

function inheritedNumber(element, parent, name, fallback) {
  const value = inherited(element, parent, name);
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  throw new Error(`<${element?.name ?? parent?.name}> requires numeric attribute "${name}"`);
}

function inheritedString(element, parent, name, fallback) {
  const value = inherited(element, parent, name);
  if (typeof value === "string") return value;
  if (value === undefined) return fallback;
  throw new Error(`<${element?.name ?? parent?.name}> requires string attribute "${name}"`);
}

export function presentationStyle(element, parent, defaults = {}) {
  const shape = inheritedString(element, parent, "shape", "rect");
  const radius = shape === "circle"
    ? "50%"
    : `${inheritedNumber(element, parent, "radius", 0)}px`;
  return {
    left: `${inheritedNumber(element, parent, "x", 0) * 100}%`,
    top: `${inheritedNumber(element, parent, "y", 0) * 100}%`,
    width: `${inheritedNumber(element, parent, "width", 1) * 100}%`,
    height: `${inheritedNumber(element, parent, "height", 1) * 100}%`,
    "object-fit": inheritedString(element, parent, "fit", defaults.fit ?? "cover"),
    "object-position": inheritedString(element, parent, "position", "50% 50%"),
    "border-radius": radius,
    opacity: inheritedNumber(element, parent, "opacity", 1),
    overflow: "hidden",
    background: inheritedString(element, parent, "background", defaults.background ?? "transparent"),
  };
}

export function durationSeconds(value) {
  const match = /^([0-9]+(?:\.[0-9]+)?)(ms|s)$/u.exec(value);
  if (!match) throw new Error(`invalid transition duration "${value}"`);
  return Number(match[1]) * (match[2] === "ms" ? 0.001 : 1);
}

function fadeSpec(raw) {
  if (raw === undefined) return 0;
  const match = /^fade\s+([0-9]+(?:\.[0-9]+)?(?:ms|s))$/u.exec(String(raw).trim());
  if (!match) throw new Error(`only "fade <duration>" is supported, received "${String(raw)}"`);
  return durationSeconds(match[1]);
}

export function presentationAnimation(element, range, fps, id) {
  const durationFrames = Math.max(1, range.endFrameExclusive - range.startFrame);
  const enterFrames = Math.min(durationFrames, Math.round(fadeSpec(element?.attributes.enter) * fps));
  const exitFrames = Math.min(
    durationFrames - enterFrames,
    Math.round(fadeSpec(element?.attributes.exit) * fps),
  );
  if (enterFrames <= 0 && exitFrames <= 0) return {};
  const enterPercent = enterFrames / durationFrames * 100;
  const exitPercent = 100 - exitFrames / durationFrames * 100;
  const name = `svml-present-${id}`.replaceAll(/[^A-Za-z0-9_-]/gu, "-");
  const duration = durationFrames / fps;
  return {
    animation: `${name} ${duration}s linear both`,
    css: `@keyframes ${name} {
      0% { opacity:${enterFrames > 0 ? 0 : 1}; }
      ${enterPercent}% { opacity:1; }
      ${exitPercent}% { opacity:1; }
      100% { opacity:${exitFrames > 0 ? 0 : 1}; }
    }`,
  };
}

export function resolveItemPresentations(context, item, source) {
  const rawParents = item.attributes.during
    ? context.selection(item.attributes.during, "item.during")
    : source.range
      ? [source.range]
      : [];
  if (!rawParents.length) {
    throw new Error(`item "${stringAttr(item, "id")}" has no temporal range`);
  }
  const parents = rawParents.map((range) =>
    projectWindow(range, item.attributes.window, context.fps));
  const presents = elements({ element: item }, "present");
  const explicit = [];
  for (const [presentIndex, present] of presents.entries()) {
    const presentRanges = present.attributes.during
      ? context.selection(present.attributes.during, "present.during")
      : parents;
    for (const projected of presentRanges.map((range) =>
      projectWindow(range, present.attributes.window, context.fps))) {
      for (const [parentIndex, parentRange] of parents.entries()) {
        const range = intersectRange(parentRange, projected);
        if (!range) continue;
        explicit.push({
          id: stringAttr(present, "id"),
          parentIndex,
          parentRange,
          range,
          element: present,
          layer: numberAttr(present, "layer", presentIndex + 1),
          explicit: true,
        });
      }
    }
  }
  const defaults = [];
  for (const [parentIndex, parentRange] of parents.entries()) {
    const cuts = explicit
      .filter((presentation) => presentation.parentIndex === parentIndex)
      .map((presentation) => presentation.range);
    const ranges = presents.length
      ? subtractRanges(parentRange, cuts, context.fps)
      : [parentRange];
    for (const range of ranges) {
      defaults.push({
        id: "default",
        parentIndex,
        parentRange,
        range,
        element: undefined,
        layer: 0,
        explicit: false,
      });
    }
  }
  return [...defaults, ...explicit];
}

export function mediaTiming(item, presentation, source, fps) {
  const playback = stringAttr(item, "playback", "sync");
  const offsetFrames = presentation.range.startFrame - presentation.parentRange.startFrame;
  const mediaStart = numberAttr(item, "mediaStart", 0);
  if (playback === "sync") {
    return {
      mediaStartSec: mediaStart + offsetFrames / fps,
      playbackRate: 1,
    };
  }
  if (playback === "loop") {
    return {
      mediaStartSec: mediaStart + offsetFrames / fps,
      playbackRate: 1,
      loop: true,
    };
  }
  if (playback === "stretch") {
    const sourceDuration = numberAttr(item, "sourceDuration");
    const parentFrames = Math.max(
      1,
      presentation.parentRange.endFrameExclusive - presentation.parentRange.startFrame,
    );
    return {
      mediaStartSec: mediaStart + sourceDuration * (offsetFrames / parentFrames),
      playbackRate: sourceDuration / (parentFrames / fps),
    };
  }
  if (playback === "hold" && source.type === "Image") return {};
  throw new Error(`unsupported playback "${playback}" for ${source.type}`);
}
