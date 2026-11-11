import { assertCaptionNleComponentParameters } from "@hypit/caption-nle";
import type { NleInspectorComponentPresentation } from "@hypit/nle-view";

import { captionFineNleComponentSymbol } from "./nle-package.js";

function seconds(value: { readonly ticks: string; readonly timeBase: {
  readonly numerator: number; readonly denominator: number;
} }): number {
  return Number(BigInt(value.ticks)) * value.timeBase.numerator / value.timeBase.denominator;
}

function milliseconds(value: string | number | boolean): {
  readonly ticks: string;
  readonly timeBase: { readonly numerator: 1; readonly denominator: 1_000 };
} {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error("字幕内部时间必须是非负秒数。");
  const ticks = Math.round(numeric * 1_000);
  if (!Number.isSafeInteger(ticks)) throw new Error("字幕内部时间超出可编辑范围。");
  return { ticks: String(ticks), timeBase: { numerator: 1, denominator: 1_000 } };
}

function unitLabel(text: string, index: number): string {
  const compact = text.trim().replaceAll(/\s+/gu, " ");
  const visible = compact.length > 18 ? `${compact.slice(0, 17)}…` : compact;
  return visible.length === 0 ? `单元 ${index + 1}` : `“${visible}”`;
}

export const captionFineNleInspector: NleInspectorComponentPresentation = {
  component: captionFineNleComponentSymbol,
  project: ({ item }) => {
    assertCaptionNleComponentParameters(item.parameters, item.duration);
    const caption = item.parameters.caption;
    const text = caption.words.map((word) => `${word.separatorBefore}${word.text}`).join("");
    const words = new Map(caption.words.map((word) => [word.id, word] as const));
    const duration = seconds(item.duration);
    return [{
      id: "caption-content",
      label: "字幕内容",
      domain: "how",
      page: { id: "content", label: "内容" },
      fields: [
        { id: "text", label: "完整文本", control: "readout", value: text },
        ...caption.words.map((word, index) => ({
          id: `word-${word.id}`,
          label: `词 ${index + 1}`,
          control: "text" as const,
          value: word.text,
          edit: (value: string | number | boolean) => ({
            kind: "replace-word",
            wordId: word.id,
            text: String(value),
          }),
        })),
        { id: "role", label: "角色", control: "readout", value: caption.role ?? "—" },
        { id: "words", label: "词", control: "readout", value: `${caption.words.length} 个` },
        { id: "units", label: "时间单元", control: "readout", value: `${caption.units.length} 个` },
      ],
    }, {
      id: "caption-timing",
      label: "字幕内部时间",
      domain: "when",
      page: { id: "caption-timing", label: "字幕" },
      fields: caption.units.flatMap((unit, index) => {
        const label = unitLabel(unit.wordIds.map((id) => words.get(id)?.text ?? "").join(" "), index);
        const row = { id: unit.id, label };
        const start = seconds(unit.start);
        const end = seconds(unit.end);
        const previousStart = index === 0 ? 0 : seconds(caption.units[index - 1]!.start);
        const nextStart = index === caption.units.length - 1
          ? duration : seconds(caption.units[index + 1]!.start);
        return [{
          id: `unit-${unit.id}-start`,
          label: "开始",
          control: "number" as const,
          value: start,
          unit: "秒",
          row,
          minimum: previousStart,
          maximum: Math.min(end - .001, nextStart),
          step: .001,
          edit: (value: string | number | boolean) => ({
            kind: "retime-unit",
            unitId: unit.id,
            start: milliseconds(value),
            end: unit.end,
          }),
        }, {
          id: `unit-${unit.id}-end`,
          label: "结束",
          control: "number" as const,
          value: end,
          unit: "秒",
          row,
          minimum: start + .001,
          maximum: duration,
          step: .001,
          edit: (value: string | number | boolean) => ({
            kind: "retime-unit",
            unitId: unit.id,
            start: unit.start,
            end: milliseconds(value),
          }),
        }];
      }),
    }];
  },
};
