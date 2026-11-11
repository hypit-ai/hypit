import type { NleInspectorComponentPresentation, NleInspectorField } from "@hypit/nle-view";

import { rankingBoardComponentSymbol, verdictBurstComponentSymbol } from "./nle-package.js";

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Readonly<Record<string, unknown>>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be text.`);
  return value;
}

export const rankingBoardNleInspector: NleInspectorComponentPresentation = {
  component: rankingBoardComponentSymbol,
  project: ({ item }) => {
    const parameters = record(item.parameters, `Ranking Board ${item.id}`);
    const rows = Array.isArray(parameters.rows) ? parameters.rows : [];
    const entries = Array.isArray(parameters.entries) ? parameters.entries : [];
    const fields: NleInspectorField[] = [
      { id: "title", label: "标题", control: "text", value: requiredText(parameters.title, "Ranking Board title"),
        edit: (value) => ({ kind: "set-title", title: value }) },
      { id: "rows", label: "等级", control: "readout", value: `${rows.length} 行` },
      { id: "entries", label: "项目", control: "readout", value: `${entries.length} 个` },
    ];
    return [{ id: "ranking-board", label: "榜单", domain: "how", page: { id: "content", label: "内容" }, fields }];
  },
};

export const verdictBurstNleInspector: NleInspectorComponentPresentation = {
  component: verdictBurstComponentSymbol,
  project: ({ item }) => {
    const parameters = record(item.parameters, `Verdict ${item.id}`);
    return [{
      id: "verdict", label: "结论", domain: "how", page: { id: "content", label: "内容" }, fields: [
        { id: "kicker", label: "引题", control: "text", value: requiredText(parameters.kicker, "Verdict kicker") },
        { id: "title", label: "标题", control: "text", value: requiredText(parameters.title, "Verdict title") },
      ],
    }];
  },
};
