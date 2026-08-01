import { elements, html, numberAttr, stringAttr, trackOutput } from "./helpers.mjs";

function fail(message) {
  throw new Error(message);
}

export default {
  abiVersion: "1",
  project(context) {
    const script = context.resolve(context.element.attributes.script);
    const semantic = context.resolve(context.element.attributes.semantic);
    const plan = context.resolve(context.element.attributes.plan);
    if (semantic?.contract !== "svml.complete-semantic-map.v1") {
      fail("caption-track requires CompleteSemanticMap");
    }
    if (plan?.contract !== "svml.caption-plan.v1") fail("caption-track requires CaptionPlan");
    if (
      semantic.basisDigest !== context.program.basisDigest
      || plan.basisDigest !== semantic.basisDigest
      || plan.semanticIndexDigest !== script.semanticIndex.digest
    ) fail("caption-track inputs do not share one Script and ProgramBasis");
    if (!Array.isArray(plan.cues) || !Array.isArray(plan.annotations)) {
      fail("CaptionPlan requires cues and annotations arrays");
    }
    const { planDigest, ...canonicalPlan } = plan;
    if (context.digest(canonicalPlan) !== planDigest) fail("CaptionPlan digest does not match its contents");
    for (const [index, annotation] of plan.annotations.entries()) {
      if (
        typeof annotation.id !== "string"
        || typeof annotation.kind !== "string"
        || !Number.isInteger(annotation.startToken)
        || !Number.isInteger(annotation.endTokenExclusive)
        || annotation.startToken < 0
        || annotation.endTokenExclusive <= annotation.startToken
        || annotation.endTokenExclusive > script.tokens.length
      ) fail(`CaptionPlan annotation ${index + 1} has an invalid Script token range`);
    }
    const points = new Map(semantic.anchors.map(anchor => [anchor.identity, anchor.point.frame]));
    const frameRange = (startFrame, endFrameExclusive) => ({
      startFrame,
      endFrameExclusive,
      startSec: startFrame / context.fps,
      endSec: endFrameExclusive / context.fps,
    });
    const words = script.tokens.map(token => ({
      ...token,
      ...frameRange(points.get(token.startAnchorId), points.get(token.endAnchorId)),
    }));
    const captionAtoms = script.captionAtoms.map(atom => ({
      ...atom,
      ...frameRange(
        words[atom.startToken].startFrame,
        words[atom.endTokenExclusive - 1].endFrameExclusive,
      ),
    }));
    const roleRanges = role => script.turns
      .filter(turn => turn.role === role)
      .map(turn => frameRange(
        words[turn.tokenStart].startFrame,
        words[turn.tokenEndExclusive - 1].endFrameExclusive,
      ));
    const annotationRanges = kind => plan.annotations
      .filter(annotation => annotation.kind === kind)
      .map(annotation => frameRange(
        words[annotation.startToken].startFrame,
        words[annotation.endTokenExclusive - 1].endFrameExclusive,
      ));
    const selectorRanges = (element, label, globalAllowed) => {
      const selectors = ["during", "role", "annotation"]
        .filter(name => element.attributes[name] !== undefined);
      if (selectors.length > 1 || (!globalAllowed && selectors.length !== 1)) {
        fail(`<${label} id="${stringAttr(element, "id")}"> requires ${globalAllowed ? "at most" : "exactly"} one selector`);
      }
      if (!selectors.length) return [frameRange(0, context.program.durationFrames)];
      if (selectors[0] === "during") {
        return context.selection(element.attributes.during, `${label}.during`);
      }
      if (selectors[0] === "role") return roleRanges(stringAttr(element, "role"));
      return annotationRanges(stringAttr(element, "annotation"));
    };
    const styledRanges = elements(context, "style").map(style => ({
      id: stringAttr(style, "id"),
      ranges: selectorRanges(style, "style", true),
      color: style.attributes.color,
      activeColor: style.attributes.activeColor,
      background: style.attributes.background,
      weight: style.attributes.weight,
      scale: style.attributes.scale,
    }));
    const mutedRanges = elements(context, "mute")
      .flatMap(mute => selectorRanges(mute, "mute", false));
    const overlaps = (unit, range) =>
      unit.startFrame < range.endFrameExclusive
      && unit.endFrameExclusive > range.startFrame;
    const inlineStyle = (word, active) => {
      const declarations = {};
      for (const rule of styledRanges) {
        if (!rule.ranges.some(range => overlaps(word, range))) continue;
        if (typeof rule.color === "string") declarations.color = rule.color;
        if (active && typeof rule.activeColor === "string") declarations.color = rule.activeColor;
        if (typeof rule.background === "string") declarations.background = rule.background;
        if (typeof rule.weight === "number") declarations["font-weight"] = rule.weight;
        if (typeof rule.scale === "number") declarations.transform = `scale(${rule.scale})`;
      }
      const body = Object.entries(declarations)
        .map(([name, value]) => `${name}:${String(value)}`).join(";");
      return body ? ` style="${html(body)}"` : "";
    };
    const atomsByStart = new Map(captionAtoms.map(atom => [atom.startToken, atom]));
    const displayUnits = (startToken, endTokenExclusive) => {
      const units = [];
      let index = startToken;
      while (index < endTokenExclusive) {
        const atom = atomsByStart.get(index);
        if (atom) {
          if (atom.endTokenExclusive > endTokenExclusive) {
            fail(`caption cue cuts through Dual Text atom "${atom.id}"`);
          }
          if (atom.display && !mutedRanges.some(range => overlaps(atom, range))) {
            units.push({
              text: atom.display,
              startFrame: atom.startFrame,
              endFrameExclusive: atom.endFrameExclusive,
            });
          }
          index = atom.endTokenExclusive;
          continue;
        }
        const word = words[index];
        if (word && !mutedRanges.some(range => overlaps(word, range))) units.push(word);
        index += 1;
      }
      return units;
    };
    let expectedStart = 0;
    const groups = plan.cues.map((cue, index) => {
      if (
        !Number.isInteger(cue.startToken)
        || !Number.isInteger(cue.endTokenExclusive)
        || cue.startToken !== expectedStart
        || cue.endTokenExclusive <= cue.startToken
        || cue.endTokenExclusive > words.length
      ) fail(`CaptionPlan cue ${index + 1} is not a complete ordered token partition`);
      const first = words[cue.startToken];
      const last = words[cue.endTokenExclusive - 1];
      if (first.segmentId !== last.segmentId) fail(`CaptionPlan cue ${index + 1} crosses Segments`);
      expectedStart = cue.endTokenExclusive;
      return { cue, words: displayUnits(cue.startToken, cue.endTokenExclusive) };
    }).filter(entry => entry.words.length);
    if (expectedStart !== words.length) fail("CaptionPlan does not cover every Script token");
    const visuals = [];
    const z = numberAttr(context.element, "z");
    for (const [groupIndex, entry] of groups.entries()) {
      const group = entry.words;
      const nextCueStart = groups[groupIndex + 1]?.words[0]?.startFrame;
      for (const [activeIndex, word] of group.entries()) {
        const next = group[activeIndex + 1];
        const endFrameExclusive = next?.startFrame
          ?? Math.min(
            context.program.durationFrames,
            nextCueStart ?? context.program.durationFrames,
            word.endFrameExclusive + Math.round(numberAttr(context.element, "hold", 0.08) * context.fps),
          );
        if (endFrameExclusive <= word.startFrame) continue;
        const body = group.map((item, index) => {
          const active = index === activeIndex;
          return `<span class="${active ? "active" : ""}"${inlineStyle(item, active)}>${html(item.text)}</span>`;
        }).join("");
        const fragmentDuration = Math.max(1 / context.fps, (endFrameExclusive - word.startFrame) / context.fps);
        const fadeSec = Math.min(numberAttr(context.element, "cueFade", 0.12), fragmentDuration * 0.45);
        const fadePercent = Math.min(45, fadeSec / fragmentDuration * 100);
        const animationName = `svml-caption-${context.instance.id}-${groupIndex}-${activeIndex}`
          .replaceAll(/[^A-Za-z0-9_-]/gu, "-");
        const first = activeIndex === 0;
        const last = activeIndex === group.length - 1;
        const opacityKeyframes = first && last
          ? `0% { opacity:0; } ${fadePercent}% { opacity:1; } ${100 - fadePercent}% { opacity:1; } 100% { opacity:0; }`
          : first
            ? `0% { opacity:0; } ${fadePercent}% { opacity:1; } 100% { opacity:1; }`
            : last
              ? `0% { opacity:1; } ${100 - fadePercent}% { opacity:1; } 100% { opacity:0; }`
              : "0%, 100% { opacity:1; }";
        visuals.push({
          id: `${context.instance.id}:g${groupIndex}:w${activeIndex}`,
          kind: "html",
          startFrame: word.startFrame,
          endFrameExclusive,
          z,
          html: `<div class="svml-caption-line">${body}</div>`,
          style: {
            left: `${numberAttr(context.element, "x", 0.37) * 100}%`,
            top: `${numberAttr(context.element, "y", 0.54) * 100}%`,
            width: `${numberAttr(context.element, "width", 0.64) * 100}%`,
            height: "auto",
            color: stringAttr(context.element, "color", "#ffffff"),
            "font-family": stringAttr(context.element, "font", "Poppins, Inter, Arial, sans-serif"),
            "font-size": `${numberAttr(context.element, "size", 50)}px`,
            "font-weight": numberAttr(context.element, "weight", 800),
            "line-height": 1.15,
            "letter-spacing": `${numberAttr(context.element, "tracking", -1)}px`,
            "text-align": "center",
            "-webkit-text-stroke": `${context.width * numberAttr(context.element, "strokeWidth", 0.002)}px ${stringAttr(context.element, "strokeColor", "rgba(0,0,0,.82)")}`,
            "paint-order": "stroke fill",
            "text-shadow": stringAttr(context.element, "shadow", "0 2px 9px rgba(0,0,0,.5), 0 0 2px rgba(0,0,0,.68)"),
            animation: `${animationName} ${fragmentDuration}s linear both`,
          },
          css: `@keyframes ${animationName} { ${opacityKeyframes} }`,
        });
      }
    }
    const highlight = stringAttr(context.element, "highlight", "#ffd34d");
    const fontSize = numberAttr(context.element, "size", 50);
    const gap = Math.max(12, Math.round(fontSize * (0.34 + Math.max(
      0,
      -numberAttr(context.element, "tracking", -1) / fontSize,
    ))));
    return trackOutput(visuals, [], [
      `.svml-caption-line .active { color: ${highlight}; }`,
      `.svml-caption-line {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: baseline;
  column-gap: ${gap}px;
  white-space: nowrap;
}`,
      ".svml-caption-line > span { display: inline-block; }",
    ]);
  },
};
