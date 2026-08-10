import type { CanonicalValue } from "@narratage/protocol";
import type { SvsRecipe } from "@narratage/svs";

import { buildFineCaptionParameters } from "./style.js";
import type { FineCaptionGlyphPaint, FineCaptionParameters } from "./types.js";

/**
 * What each property came to, read back off the parameters it produced.
 *
 * A Recipe writes fifteen of ninety-eight properties and the decoder answers
 * for the rest — some from a fixed fallback, some computed from another
 * property, some inherited from one the author did set. None of that is
 * knowable from the schema, and a table of literals beside it could only be a
 * second opinion, so the values are taken from a real lowering and named by
 * where each one lands.
 */

/** Where a property's value sits in the parameters the decoder builds. */
const PLACES: Readonly<Record<string, (parameters: FineCaptionParameters) => CanonicalValue>> = {
  "stack-order": (p) => p.stackingOrder,

  "x": (p) => p.placement.x,
  "y": (p) => p.placement.y,
  "width": (p) => p.placement.width,
  "anchor-x": (p) => p.placement.anchorX,
  "anchor-y": (p) => p.placement.anchorY,

  "align": (p) => p.layout.textAlign,
  "direction": (p) => p.layout.direction,
  "line-height": (p) => p.layout.lineHeight,
  "letter-spacing": (p) => p.layout.letterSpacingPx,
  "word-gap": (p) => p.layout.wordGapPx,

  "font": (p) => p.typography.fontFamily,
  "size": (p) => p.typography.fontSizePx,
  "weight": (p) => p.typography.fontWeight,
  "font-style": (p) => p.typography.fontStyle,
  "text-transform": (p) => p.typography.textTransform,

  "underline": (p) => p.underline.mode,
  "underline-color": (p) => p.underline.color,
  "underline-thickness": (p) => p.underline.thicknessPx,
  "underline-offset": (p) => p.underline.offsetPx,

  "active-underline": (p) => p.activeUnderline.mode,
  "active-underline-color": (p) => p.activeUnderline.color,
  "active-underline-thickness": (p) => p.activeUnderline.thicknessPx,
  "active-underline-offset": (p) => p.activeUnderline.offsetPx,

  "background": (p) => p.cueBox.background,
  "border-color": (p) => p.cueBox.borderColor,
  "border-width": (p) => p.cueBox.borderWidthPx,
  "radius": (p) => p.cueBox.radiusPx,
  // A stylesheet spells a box inset as one string, vertical first.
  "padding": (p) => `${p.cueBox.paddingYPx} ${p.cueBox.paddingXPx}`,

  "karaoke": (p) => p.karaoke.mode,
  "karaoke-transition": (p) => p.karaoke.transition,

  "active-box": (p) => p.activeBox.mode,
  "active-box-continuity": (p) => p.activeBox.continuity,
  "active-box-background": (p) => p.activeBox.background,
  "active-box-border-color": (p) => p.activeBox.borderColor,
  "active-box-border-width": (p) => p.activeBox.borderWidthPx,
  "active-box-radius": (p) => p.activeBox.radiusPx,
  "active-box-enter": (p) => p.activeBox.enter,
  "active-box-exit": (p) => p.activeBox.exit,
  "active-box-transition-frames": (p) => p.activeBox.transitionFrames,
  "active-box-padding": (p) => `${p.activeBox.paddingYPx} ${p.activeBox.paddingXPx}`,

  "cue-enter": (p) => p.motion.cueEnter,
  "cue-exit": (p) => p.motion.cueExit,
  "cue-enter-frames": (p) => p.motion.cueEnterFrames,
  "cue-exit-frames": (p) => p.motion.cueExitFrames,
  "atom-enter": (p) => p.motion.atomEnter,
  "atom-enter-frames": (p) => p.motion.atomEnterFrames,
  "atom-exit": (p) => p.motion.atomExit,
  "atom-exit-frames": (p) => p.motion.atomExitFrames,
  "atom-reveal": (p) => p.motion.atomReveal,
  "active-response": (p) => p.motion.activeResponse,
  "active-response-frames": (p) => p.motion.activeResponseFrames,
  "active-scale": (p) => p.motion.activeScale,
  "slide-distance": (p) => p.motion.slideDistancePx,
  "loop": (p) => p.motion.loop,
  "loop-target": (p) => p.motion.loopTarget,
  "loop-period-frames": (p) => p.motion.loopPeriodFrames,
  "loop-intensity": (p) => p.motion.loopIntensity,
};

/** Both Paints answer the same seventeen names, one prefixed. */
function paintPlaces(
  prefix: "" | "active-",
  paint: (parameters: FineCaptionParameters) => FineCaptionGlyphPaint,
): Readonly<Record<string, (parameters: FineCaptionParameters) => CanonicalValue | undefined>> {
  return {
    [`${prefix}fill`]: (p) => paint(p).fill,
    [`${prefix}opacity`]: (p) => paint(p).opacity,
    [`${prefix}stroke-color`]: (p) => paint(p).stroke.color,
    [`${prefix}stroke-width`]: (p) => paint(p).stroke.widthPx,
    [`${prefix}shadow-color`]: (p) => paint(p).shadow.color,
    [`${prefix}shadow-opacity`]: (p) => paint(p).shadow.opacity,
    [`${prefix}shadow-x`]: (p) => paint(p).shadow.offsetXPx,
    [`${prefix}shadow-y`]: (p) => paint(p).shadow.offsetYPx,
    [`${prefix}shadow-blur`]: (p) => paint(p).shadow.blurPx,
    [`${prefix}long-shadow-color`]: (p) => paint(p).longShadow.color,
    [`${prefix}long-shadow-opacity`]: (p) => paint(p).longShadow.opacity,
    [`${prefix}long-shadow-distance`]: (p) => paint(p).longShadow.distancePx,
    [`${prefix}long-shadow-angle`]: (p) => paint(p).longShadow.angleDeg,
    [`${prefix}glow-color`]: (p) => paint(p).glow.color,
    [`${prefix}glow-opacity`]: (p) => paint(p).glow.opacity,
    [`${prefix}glow-blur`]: (p) => paint(p).glow.blurPx,
    // A Paint with no gradient has no colours to report, and naming two would
    // describe a Recipe nobody wrote.
    [`${prefix}gradient-from`]: (p) => paint(p).gradient?.from,
    [`${prefix}gradient-to`]: (p) => paint(p).gradient?.to,
    [`${prefix}gradient-angle`]: (p) => paint(p).gradient?.angleDeg,
  };
}

const PAINTS = {
  ...paintPlaces("", (p) => p.basePaint),
  ...paintPlaces("active-", (p) => p.activePaint),
};

export function fineCaptionEffective(
  properties: Readonly<Record<string, CanonicalValue>>,
): Readonly<Record<string, CanonicalValue>> {
  const written = properties;
  const parameters = buildFineCaptionParameters(
    { contract: "svml.svs-recipe@1", path: "caption.effective", properties: written } as SvsRecipe,
    [],
  );

  const reported: Record<string, CanonicalValue> = {};
  for (const [name, read] of Object.entries({ ...PLACES, ...PAINTS })) {
    const value = read(parameters);
    if (value !== undefined) reported[name] = value;
  }
  // Cue bounds are planning rather than rendering, so they never reach the
  // parameters and come back from the Recipe itself.
  for (const name of ["cue-min-words", "cue-max-words"]) {
    const value = written[name];
    if (value !== undefined) reported[name] = value;
  }
  return reported;
}
