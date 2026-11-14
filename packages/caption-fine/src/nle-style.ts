import {
  nlePackageSymbolKey,
  type NleComponentValueAuthoring,
  type NleProject,
} from "@hypit/nle";
import type {
  NleInspectorComponentValuePresentation,
  NleInspectorControl,
  NleInspectorSectionDraft,
} from "@hypit/nle-view";
import { canonicalize, type CanonicalValue } from "@hypit/protocol";

import { captionFineNleComponentSymbol, captionFineNleResolver } from "./nle-package.js";

type Primitive = string | number | boolean;
type SectionId = "flow" | "typography" | "paint" | "active-paint" | "cue-box" | "decoration" | "motion";

type StyleField = {
  readonly id: string;
  readonly section: SectionId;
  readonly label: string;
  readonly path: readonly string[];
  readonly control: Exclude<NleInspectorControl, "readout" | "boolean">;
  readonly fallback: Primitive | ((style: Readonly<Record<string, unknown>>) => Primitive);
  readonly unit?: string;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
  readonly integer?: true;
};

const option = (...values: readonly string[]) => values.map((value) => ({ value, label: value }));
const motions = option(
  "none", "fade", "pop", "scale", "spring", "bounce", "elastic", "stamp", "tilt", "zoom-blur",
  "flip-x", "flip-y", "spin", "squash", "stretch", "slide-left", "slide-right", "slide-up",
  "slide-down", "blur-in", "wipe-left", "wipe-right", "wipe-up", "wipe-down",
);

const fields: readonly StyleField[] = [
  { id: "text-align", section: "flow", label: "横向对齐", path: ["textAlign"], control: "select", fallback: "center", options: option("left", "center", "right") },
  { id: "block-align", section: "flow", label: "纵向对齐", path: ["blockAlign"], control: "select", fallback: "center", options: option("start", "center", "end") },
  { id: "inline-size", section: "flow", label: "行宽", path: ["inlineSize"], control: "select", fallback: "hug", options: option("hug", "fixed") },
  { id: "wrap", section: "flow", label: "换行", path: ["wrap"], control: "select", fallback: "word", options: option("none", "word", "grapheme") },
  { id: "max-words-per-line", section: "flow", label: "每行最多词数（0 为不限）", path: ["maxWordsPerLine"], control: "number", fallback: 0, minimum: 0, maximum: 10_000, step: 1, integer: true },
  { id: "max-lines", section: "flow", label: "最多行数（0 为不限）", path: ["maxLines"], control: "number", fallback: 0, minimum: 0, maximum: 1_000, step: 1, integer: true },
  { id: "overflow", section: "flow", label: "溢出", path: ["overflow"], control: "select", fallback: "visible", options: option("visible", "clip", "ellipsis", "shrink") },
  { id: "minimum-scale", section: "flow", label: "最小缩放", path: ["minimumScale"], control: "number", fallback: .5, minimum: .01, maximum: 1, step: .01 },
  { id: "direction", section: "flow", label: "文字方向", path: ["direction"], control: "select", fallback: "ltr", options: option("auto", "ltr", "rtl") },
  { id: "writing-mode", section: "flow", label: "书写方向", path: ["writingMode"], control: "select", fallback: "horizontal-tb", options: option("horizontal-tb", "vertical-rl", "vertical-lr") },

  { id: "font-family", section: "typography", label: "字体", path: ["fontFamily"], control: "text", fallback: "system-ui, sans-serif" },
  { id: "font-size", section: "typography", label: "字号", path: ["fontSize"], control: "number", fallback: 58, unit: "px", minimum: 1, maximum: 500, step: 1 },
  { id: "font-weight", section: "typography", label: "字重", path: ["fontWeight"], control: "number", fallback: 800, minimum: 100, maximum: 900, step: 100, integer: true },
  { id: "line-height", section: "typography", label: "行高", path: ["lineHeight"], control: "number", fallback: 1.05, minimum: .5, maximum: 4, step: .05 },
  { id: "letter-spacing", section: "typography", label: "字距", path: ["letterSpacing"], control: "number", fallback: 0, unit: "px", minimum: -20, maximum: 100, step: .5 },
  { id: "word-gap", section: "typography", label: "词距", path: ["wordGap"], control: "number", fallback: (style) => numberAt(style, ["fontSize"], 58) * .25, unit: "px", minimum: 0, maximum: 100, step: .5 },
  { id: "language", section: "typography", label: "语言", path: ["language"], control: "text", fallback: "und" },
  { id: "text-transform", section: "typography", label: "大小写", path: ["textTransform"], control: "select", fallback: "none", options: option("none", "uppercase", "lowercase", "capitalize") },
  { id: "variant-caps", section: "typography", label: "字母变体", path: ["variantCaps"], control: "select", fallback: "normal", options: option("normal", "small-caps", "all-small-caps") },
  { id: "kerning", section: "typography", label: "字偶距", path: ["kerning"], control: "select", fallback: "auto", options: option("auto", "normal", "none") },

  { id: "color", section: "paint", label: "文字颜色", path: ["color"], control: "color", fallback: "#ffffff" },
  { id: "opacity", section: "paint", label: "不透明度", path: ["opacity"], control: "number", fallback: 1, minimum: 0, maximum: 1, step: .01 },
  { id: "outline-color", section: "paint", label: "描边颜色", path: ["outlineColor"], control: "color", fallback: "#000000" },
  { id: "outline-width", section: "paint", label: "描边宽度", path: ["outlineWidth"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 40, step: .5 },
  { id: "shadow-color", section: "paint", label: "阴影颜色", path: ["shadowColor"], control: "color", fallback: "#00000000" },
  { id: "shadow-blur", section: "paint", label: "阴影模糊", path: ["shadowBlur"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 100, step: 1 },
  { id: "shadow-x", section: "paint", label: "阴影 X", path: ["shadowOffsetX"], control: "number", fallback: 0, unit: "px", minimum: -100, maximum: 100, step: 1 },
  { id: "shadow-y", section: "paint", label: "阴影 Y", path: ["shadowOffsetY"], control: "number", fallback: 0, unit: "px", minimum: -100, maximum: 100, step: 1 },
  { id: "shadow-spread", section: "paint", label: "阴影扩张", path: ["shadowSpread"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 100, step: 1 },
  { id: "gradient-from", section: "paint", label: "渐变起色", path: ["gradient", "from"], control: "color", fallback: (style) => stringAt(style, ["color"], "#ffffff") },
  { id: "gradient-to", section: "paint", label: "渐变止色", path: ["gradient", "to"], control: "color", fallback: (style) => stringAt(style, ["color"], "#ffffff") },
  { id: "gradient-angle", section: "paint", label: "渐变角度", path: ["gradient", "angleDeg"], control: "number", fallback: 90, unit: "°", minimum: -3600, maximum: 3600, step: 1 },
  { id: "glow-color", section: "paint", label: "辉光颜色", path: ["glow", "color"], control: "color", fallback: (style) => stringAt(style, ["color"], "#ffffff") },
  { id: "glow-opacity", section: "paint", label: "辉光强度", path: ["glow", "opacity"], control: "number", fallback: 0, minimum: 0, maximum: 1, step: .01 },
  { id: "glow-blur", section: "paint", label: "辉光模糊", path: ["glow", "blur"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 200, step: 1 },
  { id: "glow-spread", section: "paint", label: "辉光扩张", path: ["glow", "spread"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 100, step: 1 },
  { id: "long-shadow-color", section: "paint", label: "长阴影颜色", path: ["longShadow", "color"], control: "color", fallback: "#000000" },
  { id: "long-shadow-opacity", section: "paint", label: "长阴影强度", path: ["longShadow", "opacity"], control: "number", fallback: 0, minimum: 0, maximum: 1, step: .01 },
  { id: "long-shadow-distance", section: "paint", label: "长阴影距离", path: ["longShadow", "distance"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 500, step: 1 },
  { id: "long-shadow-angle", section: "paint", label: "长阴影角度", path: ["longShadow", "angleDeg"], control: "number", fallback: 45, unit: "°", minimum: -3600, maximum: 3600, step: 1 },
  { id: "long-shadow-steps", section: "paint", label: "长阴影层数", path: ["longShadow", "steps"], control: "number", fallback: (style) => Math.min(32, Math.max(1, Math.ceil(numberAt(style, ["longShadow", "distance"], 0)))), minimum: 1, maximum: 128, step: 1, integer: true },

  { id: "active-color", section: "active-paint", label: "激活颜色", path: ["activePaint", "color"], control: "color", fallback: (style) => stringAt(style, ["karaoke", "activeColor"], "#ffd54a") },
  { id: "active-opacity", section: "active-paint", label: "激活不透明度", path: ["activePaint", "opacity"], control: "number", fallback: (style) => numberAt(style, ["opacity"], 1), minimum: 0, maximum: 1, step: .01 },
  { id: "active-outline-color", section: "active-paint", label: "激活描边颜色", path: ["activePaint", "outlineColor"], control: "color", fallback: (style) => stringAt(style, ["outlineColor"], "#000000") },
  { id: "active-outline-width", section: "active-paint", label: "激活描边宽度", path: ["activePaint", "outlineWidth"], control: "number", fallback: (style) => numberAt(style, ["outlineWidth"], 0), unit: "px", minimum: 0, maximum: 40, step: .5 },
  { id: "active-gradient-from", section: "active-paint", label: "激活渐变起色", path: ["activePaint", "gradient", "from"], control: "color", fallback: (style) => stringAt(style, ["activePaint", "color"], stringAt(style, ["karaoke", "activeColor"], "#ffd54a")) },
  { id: "active-gradient-to", section: "active-paint", label: "激活渐变止色", path: ["activePaint", "gradient", "to"], control: "color", fallback: (style) => stringAt(style, ["activePaint", "color"], stringAt(style, ["karaoke", "activeColor"], "#ffd54a")) },
  { id: "active-gradient-angle", section: "active-paint", label: "激活渐变角度", path: ["activePaint", "gradient", "angleDeg"], control: "number", fallback: 90, unit: "°", minimum: -3600, maximum: 3600, step: 1 },
  { id: "active-shadow-color", section: "active-paint", label: "激活阴影颜色", path: ["activePaint", "shadowColor"], control: "color", fallback: (style) => stringAt(style, ["shadowColor"], "#00000000") },
  { id: "active-shadow-blur", section: "active-paint", label: "激活阴影模糊", path: ["activePaint", "shadowBlur"], control: "number", fallback: (style) => numberAt(style, ["shadowBlur"], 0), unit: "px", minimum: 0, maximum: 100, step: 1 },
  { id: "active-shadow-x", section: "active-paint", label: "激活阴影 X", path: ["activePaint", "shadowOffsetX"], control: "number", fallback: (style) => numberAt(style, ["shadowOffsetX"], 0), unit: "px", minimum: -100, maximum: 100, step: 1 },
  { id: "active-shadow-y", section: "active-paint", label: "激活阴影 Y", path: ["activePaint", "shadowOffsetY"], control: "number", fallback: (style) => numberAt(style, ["shadowOffsetY"], 0), unit: "px", minimum: -100, maximum: 100, step: 1 },
  { id: "active-shadow-spread", section: "active-paint", label: "激活阴影扩张", path: ["activePaint", "shadowSpread"], control: "number", fallback: (style) => numberAt(style, ["shadowSpread"], 0), unit: "px", minimum: 0, maximum: 100, step: 1 },
  { id: "active-glow-color", section: "active-paint", label: "激活辉光颜色", path: ["activePaint", "glow", "color"], control: "color", fallback: (style) => stringAt(style, ["glow", "color"], stringAt(style, ["color"], "#ffffff")) },
  { id: "active-glow-opacity", section: "active-paint", label: "激活辉光强度", path: ["activePaint", "glow", "opacity"], control: "number", fallback: (style) => numberAt(style, ["glow", "opacity"], 0), minimum: 0, maximum: 1, step: .01 },
  { id: "active-glow-blur", section: "active-paint", label: "激活辉光模糊", path: ["activePaint", "glow", "blur"], control: "number", fallback: (style) => numberAt(style, ["glow", "blur"], 0), unit: "px", minimum: 0, maximum: 200, step: 1 },
  { id: "active-glow-spread", section: "active-paint", label: "激活辉光扩张", path: ["activePaint", "glow", "spread"], control: "number", fallback: (style) => numberAt(style, ["glow", "spread"], 0), unit: "px", minimum: 0, maximum: 100, step: 1 },
  { id: "active-long-shadow-color", section: "active-paint", label: "激活长阴影颜色", path: ["activePaint", "longShadow", "color"], control: "color", fallback: (style) => stringAt(style, ["longShadow", "color"], "#000000") },
  { id: "active-long-shadow-opacity", section: "active-paint", label: "激活长阴影强度", path: ["activePaint", "longShadow", "opacity"], control: "number", fallback: (style) => numberAt(style, ["longShadow", "opacity"], 0), minimum: 0, maximum: 1, step: .01 },
  { id: "active-long-shadow-distance", section: "active-paint", label: "激活长阴影距离", path: ["activePaint", "longShadow", "distance"], control: "number", fallback: (style) => numberAt(style, ["longShadow", "distance"], 0), unit: "px", minimum: 0, maximum: 500, step: 1 },
  { id: "active-long-shadow-angle", section: "active-paint", label: "激活长阴影角度", path: ["activePaint", "longShadow", "angleDeg"], control: "number", fallback: (style) => numberAt(style, ["longShadow", "angleDeg"], 45), unit: "°", minimum: -3600, maximum: 3600, step: 1 },
  { id: "active-long-shadow-steps", section: "active-paint", label: "激活长阴影层数", path: ["activePaint", "longShadow", "steps"], control: "number", fallback: (style) => Math.min(32, Math.max(1, Math.ceil(numberAt(style, ["activePaint", "longShadow", "distance"], numberAt(style, ["longShadow", "distance"], 0))))), minimum: 1, maximum: 128, step: 1, integer: true },
  { id: "karaoke-mode", section: "active-paint", label: "卡拉 OK", path: ["karaoke", "mode"], control: "select", fallback: "off", options: option("off", "current", "trail") },
  { id: "karaoke-transition", section: "active-paint", label: "激活过渡", path: ["karaoke", "transition"], control: "select", fallback: "step", options: option("step", "wipe") },
  { id: "karaoke-color", section: "active-paint", label: "卡拉 OK 颜色", path: ["karaoke", "activeColor"], control: "color", fallback: "#ffd54a" },

  { id: "cue-continuity", section: "cue-box", label: "字幕框连接", path: ["cueBox", "continuity"], control: "select", fallback: "isolated", options: option("isolated", "joined") },
  { id: "cue-background", section: "cue-box", label: "字幕框底色", path: ["cueBox", "background"], control: "color", fallback: "#00000000" },
  { id: "cue-border-color", section: "cue-box", label: "字幕框边色", path: ["cueBox", "borderColor"], control: "color", fallback: "#00000000" },
  { id: "cue-border-width", section: "cue-box", label: "字幕框边宽", path: ["cueBox", "borderWidth"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 40, step: .5 },
  { id: "cue-radius", section: "cue-box", label: "字幕框圆角", path: ["cueBox", "borderRadius"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 200, step: 1 },
  { id: "cue-padding-x", section: "cue-box", label: "字幕框横向留白", path: ["cueBox", "paddingX"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 200, step: 1 },
  { id: "cue-padding-y", section: "cue-box", label: "字幕框纵向留白", path: ["cueBox", "paddingY"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 200, step: 1 },
  { id: "cue-shadow-color", section: "cue-box", label: "字幕框阴影颜色", path: ["cueBox", "shadow", "color"], control: "color", fallback: "#000000" },
  { id: "cue-shadow-opacity", section: "cue-box", label: "字幕框阴影强度", path: ["cueBox", "shadow", "opacity"], control: "number", fallback: 0, minimum: 0, maximum: 1, step: .01 },
  { id: "cue-shadow-blur", section: "cue-box", label: "字幕框阴影模糊", path: ["cueBox", "shadow", "blur"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 200, step: 1 },
  { id: "cue-shadow-x", section: "cue-box", label: "字幕框阴影 X", path: ["cueBox", "shadow", "offsetX"], control: "number", fallback: 0, unit: "px", minimum: -200, maximum: 200, step: 1 },
  { id: "cue-shadow-y", section: "cue-box", label: "字幕框阴影 Y", path: ["cueBox", "shadow", "offsetY"], control: "number", fallback: 0, unit: "px", minimum: -200, maximum: 200, step: 1 },
  { id: "cue-shadow-spread", section: "cue-box", label: "字幕框阴影扩张", path: ["cueBox", "shadow", "spread"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 100, step: 1 },
  { id: "active-box-mode", section: "cue-box", label: "激活框", path: ["activeBox", "mode"], control: "select", fallback: "off", options: option("off", "current", "trail") },
  { id: "active-box-continuity", section: "cue-box", label: "激活框连接", path: ["activeBox", "continuity"], control: "select", fallback: "isolated", options: option("isolated", "joined") },
  { id: "active-box-background", section: "cue-box", label: "激活框底色", path: ["activeBox", "background"], control: "color", fallback: "#ffd54a" },
  { id: "active-box-border-color", section: "cue-box", label: "激活框边色", path: ["activeBox", "borderColor"], control: "color", fallback: "#00000000" },
  { id: "active-box-border-width", section: "cue-box", label: "激活框边宽", path: ["activeBox", "borderWidth"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 40, step: .5 },
  { id: "active-box-radius", section: "cue-box", label: "激活框圆角", path: ["activeBox", "borderRadius"], control: "number", fallback: 8, unit: "px", minimum: 0, maximum: 200, step: 1 },
  { id: "active-box-padding-x", section: "cue-box", label: "激活框横向留白", path: ["activeBox", "paddingX"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 200, step: 1 },
  { id: "active-box-padding-y", section: "cue-box", label: "激活框纵向留白", path: ["activeBox", "paddingY"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 200, step: 1 },
  { id: "active-box-enter", section: "cue-box", label: "激活框入场", path: ["activeBox", "enter"], control: "select", fallback: "none", options: motions },
  { id: "active-box-exit", section: "cue-box", label: "激活框退场", path: ["activeBox", "exit"], control: "select", fallback: "none", options: motions },
  { id: "active-box-transition", section: "cue-box", label: "激活框过渡", path: ["activeBox", "transitionFrames"], control: "number", fallback: 0, unit: "帧", minimum: 0, maximum: 120, step: 1, integer: true },
  { id: "active-box-shadow-color", section: "cue-box", label: "激活框阴影颜色", path: ["activeBox", "shadow", "color"], control: "color", fallback: "#000000" },
  { id: "active-box-shadow-opacity", section: "cue-box", label: "激活框阴影强度", path: ["activeBox", "shadow", "opacity"], control: "number", fallback: 0, minimum: 0, maximum: 1, step: .01 },
  { id: "active-box-shadow-blur", section: "cue-box", label: "激活框阴影模糊", path: ["activeBox", "shadow", "blur"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 200, step: 1 },
  { id: "active-box-shadow-x", section: "cue-box", label: "激活框阴影 X", path: ["activeBox", "shadow", "offsetX"], control: "number", fallback: 0, unit: "px", minimum: -200, maximum: 200, step: 1 },
  { id: "active-box-shadow-y", section: "cue-box", label: "激活框阴影 Y", path: ["activeBox", "shadow", "offsetY"], control: "number", fallback: 0, unit: "px", minimum: -200, maximum: 200, step: 1 },
  { id: "active-box-shadow-spread", section: "cue-box", label: "激活框阴影扩张", path: ["activeBox", "shadow", "spread"], control: "number", fallback: 0, unit: "px", minimum: 0, maximum: 100, step: 1 },

  { id: "underline-mode", section: "decoration", label: "下划线", path: ["underline", "mode"], control: "select", fallback: "off", options: option("off", "always") },
  { id: "underline-color", section: "decoration", label: "下划线颜色", path: ["underline", "color"], control: "color", fallback: (style) => stringAt(style, ["color"], "#ffffff") },
  { id: "underline-thickness", section: "decoration", label: "下划线粗细", path: ["underline", "thickness"], control: "number", fallback: 2, unit: "px", minimum: 0, maximum: 40, step: .5 },
  { id: "underline-offset", section: "decoration", label: "下划线偏移", path: ["underline", "offset"], control: "number", fallback: 4, unit: "px", minimum: -100, maximum: 100, step: 1 },
  { id: "underline-style", section: "decoration", label: "下划线样式", path: ["underline", "style"], control: "select", fallback: "solid", options: option("solid", "double", "dotted", "dashed", "wavy") },
  { id: "active-underline-mode", section: "decoration", label: "激活下划线", path: ["activeUnderline", "mode"], control: "select", fallback: "off", options: option("off", "current", "trail") },
  { id: "active-underline-color", section: "decoration", label: "激活下划线颜色", path: ["activeUnderline", "color"], control: "color", fallback: (style) => stringAt(style, ["karaoke", "activeColor"], "#ffd54a") },
  { id: "active-underline-thickness", section: "decoration", label: "激活下划线粗细", path: ["activeUnderline", "thickness"], control: "number", fallback: 3, unit: "px", minimum: 0, maximum: 40, step: .5 },
  { id: "active-underline-offset", section: "decoration", label: "激活下划线偏移", path: ["activeUnderline", "offset"], control: "number", fallback: 4, unit: "px", minimum: -100, maximum: 100, step: 1 },
  { id: "active-underline-style", section: "decoration", label: "激活下划线样式", path: ["activeUnderline", "style"], control: "select", fallback: "solid", options: option("solid", "double", "dotted", "dashed", "wavy") },

  { id: "entry-kind", section: "motion", label: "字幕入场", path: ["entry", "kind"], control: "select", fallback: "none", options: motions },
  { id: "entry-frames", section: "motion", label: "入场帧数", path: ["entry", "frames"], control: "number", fallback: 0, unit: "帧", minimum: 0, maximum: 120, step: 1, integer: true },
  { id: "entry-scale", section: "motion", label: "入场起始缩放", path: ["entry", "startScale"], control: "number", fallback: 1, minimum: .01, maximum: 10, step: .01 },
  { id: "exit-kind", section: "motion", label: "字幕退场", path: ["exit", "kind"], control: "select", fallback: "none", options: motions },
  { id: "exit-frames", section: "motion", label: "退场帧数", path: ["exit", "frames"], control: "number", fallback: 0, unit: "帧", minimum: 0, maximum: 120, step: 1, integer: true },
  { id: "atom-enter", section: "motion", label: "词入场", path: ["atom", "enter"], control: "select", fallback: "none", options: motions },
  { id: "atom-enter-frames", section: "motion", label: "词入场帧数", path: ["atom", "enterFrames"], control: "number", fallback: 0, unit: "帧", minimum: 0, maximum: 120, step: 1, integer: true },
  { id: "atom-exit", section: "motion", label: "词退场", path: ["atom", "exit"], control: "select", fallback: "none", options: motions },
  { id: "atom-exit-frames", section: "motion", label: "词退场帧数", path: ["atom", "exitFrames"], control: "number", fallback: 0, unit: "帧", minimum: 0, maximum: 120, step: 1, integer: true },
  { id: "atom-reveal", section: "motion", label: "词揭示", path: ["atom", "reveal"], control: "select", fallback: "all", options: option("all", "on-start", "typewriter") },
  { id: "active-response", section: "motion", label: "激活响应", path: ["activeResponse", "kind"], control: "select", fallback: "none", options: motions },
  { id: "active-response-frames", section: "motion", label: "响应帧数", path: ["activeResponse", "frames"], control: "number", fallback: 6, unit: "帧", minimum: 0, maximum: 120, step: 1, integer: true },
  { id: "active-scale", section: "motion", label: "激活缩放", path: ["activeResponse", "scale"], control: "number", fallback: 1.08, minimum: .01, maximum: 10, step: .01 },
  { id: "loop-kind", section: "motion", label: "循环动效", path: ["loop", "kind"], control: "select", fallback: "none", options: option("none", "shake", "wobble", "glow-pulse", "breathe", "float", "pulse", "flicker") },
  { id: "loop-target", section: "motion", label: "循环目标", path: ["loop", "target"], control: "select", fallback: "cue", options: option("cue", "active-atom") },
  { id: "loop-period", section: "motion", label: "循环周期", path: ["loop", "periodFrames"], control: "number", fallback: 12, unit: "帧", minimum: 1, maximum: 600, step: 1, integer: true },
  { id: "loop-intensity", section: "motion", label: "循环强度", path: ["loop", "intensity"], control: "number", fallback: 1, minimum: 0, maximum: 100, step: .1 },
  { id: "slide-distance", section: "motion", label: "滑动距离", path: ["slideDistance"], control: "number", fallback: 24, unit: "px", minimum: 0, maximum: 1000, step: 1 },
];

const sections: readonly {
  readonly id: SectionId;
  readonly label: string;
  readonly domain: "where" | "how" | "when";
  readonly page: { readonly id: string; readonly label: string };
}[] = [
  { id: "flow", label: "字幕排布", domain: "where", page: { id: "layout", label: "布局" } },
  { id: "typography", label: "字体排版", domain: "how", page: { id: "typography", label: "字体" } },
  { id: "paint", label: "基础绘制", domain: "how", page: { id: "appearance", label: "外观" } },
  { id: "active-paint", label: "激活绘制", domain: "how", page: { id: "appearance", label: "外观" } },
  { id: "cue-box", label: "字幕框", domain: "how", page: { id: "box", label: "字幕框" } },
  { id: "decoration", label: "文字装饰", domain: "how", page: { id: "appearance", label: "外观" } },
  { id: "motion", label: "字幕动效", domain: "when", page: { id: "motion", label: "动效" } },
];

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a record.`);
  return value as Readonly<Record<string, unknown>>;
}

function at(value: Readonly<Record<string, unknown>>, path: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Readonly<Record<string, unknown>>)[key];
  }
  return current;
}

function stringAt(value: Readonly<Record<string, unknown>>, path: readonly string[], fallback: string): string {
  const found = at(value, path);
  return typeof found === "string" ? found : fallback;
}

function numberAt(value: Readonly<Record<string, unknown>>, path: readonly string[], fallback: number): number {
  const found = at(value, path);
  return typeof found === "number" && Number.isFinite(found) ? found : fallback;
}

function displayed(style: Readonly<Record<string, unknown>>, field: StyleField): Primitive {
  const found = at(style, field.path);
  if (typeof found === "string" || typeof found === "number" || typeof found === "boolean") return found;
  return typeof field.fallback === "function" ? field.fallback(style) : field.fallback;
}

function setAt(value: Readonly<Record<string, unknown>>, path: readonly string[], next: Primitive): CanonicalValue {
  const root = structuredClone(value) as Record<string, unknown>;
  let current = root;
  for (const key of path.slice(0, -1)) {
    const child = current[key];
    current[key] = child !== null && typeof child === "object" && !Array.isArray(child)
      ? structuredClone(child) : {};
    current = current[key] as Record<string, unknown>;
  }
  current[path.at(-1)!] = next;
  return canonicalize(root);
}

function validate(field: StyleField, value: Primitive): void {
  if (field.control === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)
      || field.minimum !== undefined && value < field.minimum
      || field.maximum !== undefined && value > field.maximum
      || field.integer && !Number.isSafeInteger(value)) throw new Error(`Fine Caption field ${field.id} is invalid.`);
  } else if (typeof value !== "string") throw new Error(`Fine Caption field ${field.id} requires text.`);
  if (field.control === "select" && !field.options?.some((candidate) => candidate.value === value)) {
    throw new Error(`Fine Caption field ${field.id} value is not an option.`);
  }
  if (field.control === "color" && (typeof value !== "string" || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value))) {
    throw new Error(`Fine Caption field ${field.id} color is invalid.`);
  }
}

function coupled(style: CanonicalValue, field: StyleField, value: Primitive): CanonicalValue {
  const input = record(style, "Fine Caption style edit");
  const next = structuredClone(input) as Record<string, unknown>;
  if ((field.id === "max-words-per-line" || field.id === "max-lines") && value === 0) {
    delete next[field.path[0]!];
    if (field.id === "max-lines" && next.overflow === "ellipsis") next.overflow = "visible";
  }
  if (field.id === "minimum-scale") next.overflow = "shrink";
  if (field.id === "overflow" && typeof value === "string") {
    if (value === "shrink" && next.minimumScale === undefined) next.minimumScale = .5;
    if (value !== "shrink") delete next.minimumScale;
    if (value === "ellipsis" && next.maxLines === undefined) next.maxLines = 2;
  }
  return canonicalize(next);
}

function validateUsers(project: NleProject, ref: string, value: CanonicalValue): void {
  const candidate = {
    ...structuredClone(project),
    componentValues: project.componentValues.map((resource) => resource.id === ref
      ? { ...structuredClone(resource), value } : structuredClone(resource)),
  };
  for (const track of candidate.tracks) {
    for (const item of track.items) {
      if (item.kind !== "present" || item.source !== "component"
        || nlePackageSymbolKey(item.component) !== nlePackageSymbolKey(captionFineNleComponentSymbol)
        || !item.sharedValues?.some((reference) => reference.ref === ref)) continue;
      captionFineNleResolver.resolve(item, { project: candidate, track, media: {} });
    }
  }
}

function projectSections(style: Readonly<Record<string, unknown>>): readonly NleInspectorSectionDraft[] {
  return sections.map((section) => ({
    id: `caption-style-${section.id}`,
    label: section.label,
    domain: section.domain,
    page: section.page,
    fields: fields.filter((field) => field.section === section.id).map((field) => ({
      id: field.id,
      label: field.label,
      control: field.control,
      value: displayed(style, field),
      ...(field.unit === undefined ? {} : { unit: field.unit }),
      ...(field.options === undefined ? {} : { options: field.options }),
      ...(field.minimum === undefined ? {} : { minimum: field.minimum }),
      ...(field.maximum === undefined ? {} : { maximum: field.maximum }),
      ...(field.step === undefined ? {} : { step: field.step }),
      edit: (value) => ({ kind: "field.set", field: field.id, value }),
    })),
  }));
}

export const captionFineStyleNleInspector: NleInspectorComponentValuePresentation = {
  component: captionFineNleComponentSymbol,
  slot: "style",
  project: ({ value }) => projectSections(record(value.value, `Fine Caption Style ${value.id}`)),
};

export const captionFineStyleNleAuthoring: NleComponentValueAuthoring = {
  component: captionFineNleComponentSymbol,
  slot: "style",
  inspect: ({ value }) => canonicalize(value.value),
  edit: (operation, context) => {
    const input = record(operation, "Fine Caption Style edit");
    if (Object.keys(input).sort().join("\u0000") !== ["field", "kind", "value"].sort().join("\u0000")
      || input.kind !== "field.set" || typeof input.field !== "string"
      || !(typeof input.value === "string" || typeof input.value === "number" || typeof input.value === "boolean")) {
      throw new Error("Fine Caption Style edit is invalid.");
    }
    const field = fields.find((candidate) => candidate.id === input.field);
    if (field === undefined) throw new Error(`Fine Caption Style field ${input.field} is unknown.`);
    validate(field, input.value);
    const edited = coupled(setAt(record(context.value.value, "Fine Caption Style"), field.path, input.value), field, input.value);
    validateUsers(context.project, context.value.id, edited);
    return edited;
  },
};
