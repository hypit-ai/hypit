import {
  durationSeconds,
  elements,
  material,
  mediaTiming,
  numberAttr,
  presentationAnimation,
  presentationStyle,
  resolveItemPresentations,
  resolveAttr,
  stringAttr,
  trackOutput,
} from "./helpers.mjs";

function appendAnimation(fragment, name, duration) {
  fragment.style.animation = [
    fragment.style.animation,
    `${name} ${duration}s linear both`,
  ].filter(Boolean).join(", ");
}

export default {
  abiVersion: "1",
  project(context) {
    const z = numberAttr(context.element, "z");
    const visuals = [];
    const audios = [];
    const itemVisuals = new Map();
    const transitionOpacity = new Map();
    for (const item of elements(context, "item")) {
      const id = stringAttr(item, "id");
      const source = material(resolveAttr(context, item, "source"));
      const expectedKind = stringAttr(item, "kind", source.type === "Video" ? "video" : "image");
      if (String(source.type).toLowerCase() !== expectedKind.toLowerCase()) {
        throw new Error(`broll item "${id}" expected ${expectedKind}, received ${source.type}`);
      }
      const presentations = resolveItemPresentations(context, item, source, z);
      for (const [index, presentation] of presentations.entries()) {
        const range = presentation.range;
        const zoom = numberAttr(item, "zoom", 1);
        const keyframes = `svml-broll-${context.instance.id}-${id}-${index}`.replaceAll(/[^A-Za-z0-9_-]/gu, "-");
        const animation = presentationAnimation(
          presentation.element,
          range,
          context.fps,
          `${context.instance.id}-${id}-${presentation.id}-${index}`,
        );
        const duration = (range.endFrameExclusive - range.startFrame) / context.fps;
        const timing = source.type === "Video"
          ? mediaTiming(item, presentation, source, context.fps)
          : {};
        const fragment = {
          id: `${context.instance.id}:${id}:${index}`,
          kind: source.type === "Video" ? "video" : "image",
          source: source.source,
          startFrame: range.startFrame,
          endFrameExclusive: range.endFrameExclusive,
          z: presentation.z,
          // HyperFrames receives source audio as an explicit sibling contribution.
          // Keep the visual element muted so one source can never play twice.
          muted: true,
          ...timing,
          style: {
            ...presentationStyle(presentation.element, item, { fit: "contain" }),
            "transform-origin": "50% 50%",
            animation: [
              `${keyframes} ${duration}s ease-in-out both`,
              animation.animation,
            ].filter(Boolean).join(", "),
          },
          css: [
            `@keyframes ${keyframes} { from { transform: scale(1); } to { transform: scale(${zoom}); } }`,
            animation.css,
          ].filter(Boolean).join("\n"),
        };
        visuals.push(fragment);
        const values = itemVisuals.get(id) ?? [];
        values.push(fragment);
        itemVisuals.set(id, values);
      }
      if (source.type === "Video" && (item.attributes.audio === true || item.attributes.audio === "source")) {
        const parents = new Map(presentations.map((presentation) => [
          presentation.parentIndex,
          presentation.parentRange,
        ]));
        for (const [parentIndex, range] of parents) {
          const timing = mediaTiming(item, { parentRange: range, range }, source, context.fps);
          audios.push({
            id: `${context.instance.id}:${id}:${parentIndex}:audio`,
            source: source.source,
            startFrame: range.startFrame,
            endFrameExclusive: range.endFrameExclusive,
            mediaStartSec: timing.mediaStartSec,
            playbackRate: timing.playbackRate,
            volume: numberAttr(item, "volume", 1),
            bus: "source",
          });
        }
      }
    }
    const occupiedWindows = [];
    for (const [transitionIndex, transition] of elements(context, "transition").entries()) {
      const from = stringAttr(transition, "from");
      const to = stringAttr(transition, "to");
      const kind = stringAttr(transition, "kind", "crossfade");
      if (!["cut", "crossfade"].includes(kind)) {
        throw new Error(`broll transition "${kind}" is not available in projector ABI v1`);
      }
      const outgoingValues = itemVisuals.get(from) ?? [];
      const incomingValues = itemVisuals.get(to) ?? [];
      if (outgoingValues.length !== 1 || incomingValues.length !== 1) {
        throw new Error(`broll transition ${from} -> ${to} requires one resolved visual per item`);
      }
      if (kind === "cut") continue;
      const outgoing = outgoingValues[0];
      const incoming = incomingValues[0];
      const durationFrames = Math.max(
        1,
        Math.round(durationSeconds(stringAttr(transition, "duration")) * context.fps),
      );
      const cueRatio = numberAttr(transition, "cuePositionRatio", 0);
      if (cueRatio < 0 || cueRatio > 1) {
        throw new Error(`broll transition cuePositionRatio must be between 0 and 1`);
      }
      const cue = incoming.startFrame;
      const startFrame = cue - Math.floor(durationFrames * cueRatio);
      const endFrameExclusive = startFrame + durationFrames;
      if (startFrame < 0 || endFrameExclusive > context.program.durationFrames) {
        throw new Error(`broll transition ${from} -> ${to} leaves the master timeline`);
      }
      if (occupiedWindows.some((window) =>
        startFrame < window.endFrameExclusive && endFrameExclusive > window.startFrame)) {
        throw new Error(`broll transition ${from} -> ${to} overlaps another transition`);
      }
      occupiedWindows.push({ startFrame, endFrameExclusive });
      outgoing.endFrameExclusive = Math.max(outgoing.endFrameExclusive, endFrameExclusive);
      incoming.startFrame = Math.min(incoming.startFrame, startFrame);
      if (incoming.mediaStartSec !== undefined && startFrame < cue) {
        incoming.mediaStartSec = Math.max(
          0,
          incoming.mediaStartSec - (cue - startFrame) / context.fps,
        );
      }
      const outgoingState = transitionOpacity.get(outgoing) ?? {};
      const incomingState = transitionOpacity.get(incoming) ?? {};
      if (outgoingState.out || incomingState.in) {
        throw new Error(`broll transition repeats an item edge`);
      }
      outgoingState.out = { startFrame, endFrameExclusive };
      incomingState.in = { startFrame, endFrameExclusive };
      transitionOpacity.set(outgoing, outgoingState);
      transitionOpacity.set(incoming, incomingState);
      if (transition.attributes.sound) {
        const sound = material(resolveAttr(context, transition, "sound"), "audio");
        audios.push({
          id: `${context.instance.id}:transition:${transitionIndex}`,
          source: sound.source,
          startFrame,
          endFrameExclusive,
          volume: numberAttr(transition, "volume", 1),
          bus: "sfx",
        });
      }
    }
    for (const [fragment, state] of transitionOpacity) {
      const totalFrames = fragment.endFrameExclusive - fragment.startFrame;
      const points = new Map();
      points.set(0, state.in ? 0 : 1);
      points.set(100, state.out ? 0 : 1);
      if (state.in) {
        points.set((state.in.startFrame - fragment.startFrame) / totalFrames * 100, 0);
        points.set((state.in.endFrameExclusive - fragment.startFrame) / totalFrames * 100, 1);
      }
      if (state.out) {
        points.set((state.out.startFrame - fragment.startFrame) / totalFrames * 100, 1);
        points.set((state.out.endFrameExclusive - fragment.startFrame) / totalFrames * 100, 0);
      }
      const ordered = [...points].sort((left, right) => left[0] - right[0]);
      for (let index = 1; index < ordered.length; index += 1) {
        if (ordered[index][0] < ordered[index - 1][0]) {
          throw new Error(`broll transition windows are not monotonic`);
        }
      }
      const name = `svml-broll-transition-${fragment.id}`.replaceAll(/[^A-Za-z0-9_-]/gu, "-");
      fragment.css = `${fragment.css ?? ""}
@keyframes ${name} {
${ordered.map(([percent, opacity]) => `${percent}% { opacity:${opacity}; }`).join("\n")}
}`;
      appendAnimation(fragment, name, totalFrames / context.fps);
    }
    return trackOutput(visuals, audios);
  },
};
