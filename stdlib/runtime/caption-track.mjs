import { elements, html, numberAttr, stringAttr, trackOutput } from "./helpers.mjs";

export default {
  abiVersion: "1",
  project(context) {
    const script = context.resolve(context.element.attributes.script);
    const semantic = context.resolve(context.element.attributes.semantic);
    if (semantic?.contract !== "svml.exact-semantic-map.v1") {
      throw new Error("caption-track requires ExactSemanticMap");
    }
    if (semantic.basisDigest !== context.program.basisDigest) {
      throw new Error("caption-track SemanticMap does not match the selected ProgramBasis");
    }
    const points = new Map(semantic.anchors.map((anchor) => [anchor.identity, anchor.point.frame]));
    const frameRange = (startFrame, endFrameExclusive) => ({
      startFrame,
      endFrameExclusive,
      startSec: startFrame / context.fps,
      endSec: endFrameExclusive / context.fps,
    });
    const locatedWords = script.tokens.map((token) => ({
      ...token,
      ...frameRange(points.get(token.startAnchorId), points.get(token.endAnchorId)),
    }));
    const captionAtoms = script.captionAtoms.map((atom) => ({
      ...atom,
      ...frameRange(
        locatedWords[atom.startWord].startFrame,
        locatedWords[atom.endWordExclusive - 1].endFrameExclusive,
      ),
    }));
    const captionCues = semantic.captionCues?.map((cue, index) => ({
      id: cue.id ?? `cue-${index + 1}`,
      ...cue,
      ...frameRange(
        locatedWords[cue.startWord].startFrame,
        locatedWords[cue.endWordExclusive - 1].endFrameExclusive,
      ),
    }));
    const located = {
      words: locatedWords,
      captionAtoms,
      captionCues,
      durationFrames: context.program.durationFrames,
    };
    const z = numberAttr(context.element, "z");
    const maxWords = Math.max(1, Math.round(numberAttr(context.element, "maxWords", 3)));
    const words = located.words;
    const styledRanges = elements(context, "style").map((style) => ({
      id: stringAttr(style, "id"),
      ranges: context.selection(style.attributes.during, "style.during"),
      color: style.attributes.color,
      activeColor: style.attributes.activeColor,
      background: style.attributes.background,
      weight: style.attributes.weight,
      scale: style.attributes.scale,
    }));
    const inlineStyle = (word, active) => {
      const declarations = {};
      for (const rule of styledRanges) {
        if (!rule.ranges.some((range) =>
          word.startFrame < range.endFrameExclusive
          && word.endFrameExclusive > range.startFrame)) continue;
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
    const atomsByStart = new Map(located.captionAtoms.map((atom) => [atom.startWord, atom]));
    const displayUnits = (startWord, endWordExclusive) => {
      const units = [];
      let index = startWord;
      while (index < endWordExclusive) {
        const atom = atomsByStart.get(index);
        if (atom) {
          if (atom.endWordExclusive > endWordExclusive) {
            throw new Error(`caption cue cuts through Dual Text atom "${atom.id}"`);
          }
          if (atom.display) {
            units.push({
              text: atom.display,
              startFrame: atom.startFrame,
              endFrameExclusive: atom.endFrameExclusive,
            });
          }
          index = atom.endWordExclusive;
          continue;
        }
        const word = words[index];
        if (word) units.push(word);
        index += 1;
      }
      return units;
    };
    const groups = located.captionCues?.map((cue) => ({
      cue,
      words: displayUnits(cue.startWord, cue.endWordExclusive),
    })) ?? [];
    if (groups.length === 0) {
      const units = displayUnits(0, words.length);
      for (let index = 0; index < units.length; index += maxWords) {
        groups.push({
          words: units.slice(index, index + maxWords),
        });
      }
    }
    const visuals = [];
    for (const [groupIndex, entry] of groups.entries()) {
      const group = entry.words;
      const nextCueStart = groups[groupIndex + 1]?.words[0]?.startFrame;
      for (const [activeIndex, word] of group.entries()) {
        const next = group[activeIndex + 1];
        const endFrameExclusive = next?.startFrame
          ?? Math.min(
            located.durationFrames,
            nextCueStart ?? located.durationFrames,
            word.endFrameExclusive + Math.round(numberAttr(context.element, "hold", 0.08) * context.fps),
          );
        if (endFrameExclusive <= word.startFrame) continue;
        const body = group.map((item, index) => {
          const active = index === activeIndex;
          return `<span class="${active ? "active" : ""}"${inlineStyle(item, active)}>${html(item.text)}</span>`;
        }).join("");
        const fragmentDuration = Math.max(
          1 / context.fps,
          (endFrameExclusive - word.startFrame) / context.fps,
        );
        const fadeSec = Math.min(
          numberAttr(context.element, "cueFade", 0.12),
          fragmentDuration * 0.45,
        );
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
            "text-shadow": stringAttr(
              context.element,
              "shadow",
              "0 2px 9px rgba(0,0,0,.5), 0 0 2px rgba(0,0,0,.68)",
            ),
            animation: `${animationName} ${fragmentDuration}s linear both`,
          },
          css: `@keyframes ${animationName} { ${opacityKeyframes} }`,
        });
      }
    }
    const highlight = stringAttr(context.element, "highlight", "#ffd34d");
    const gap = Math.max(
      12,
      Math.round(
        numberAttr(context.element, "size", 50)
        * (0.34 + Math.max(0, -numberAttr(context.element, "tracking", -1) / numberAttr(context.element, "size", 50))),
      ),
    );
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
