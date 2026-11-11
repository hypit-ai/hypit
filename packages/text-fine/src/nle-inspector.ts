import type { HtmlTextNode } from "@hypit/html-program";
import type { NleInspectorComponentPresentation, NleInspectorFieldDraft } from "@hypit/nle-view";

import { assertTextFineNleParameters, textFineNleComponentSymbol } from "./nle-package.js";

function plainText(nodes: readonly HtmlTextNode[]): string {
  return nodes.map((node) => node.kind === "text" ? node.text
    : node.kind === "break" ? "\n" : plainText(node.children)).join("");
}

function value(
  id: string,
  label: string,
  candidate: unknown,
  unit?: string,
  edit?: NleInspectorFieldDraft["edit"],
): NleInspectorFieldDraft[] {
  return typeof candidate === "string" || typeof candidate === "number"
    ? [{ id, label, control: typeof candidate === "number" ? "number" : edit === undefined ? "readout" : "text", value: candidate,
      ...(unit === undefined ? {} : { unit }), ...(edit === undefined ? {} : { edit }) }] : [];
}

export const textFineNleInspector: NleInspectorComponentPresentation = {
  component: textFineNleComponentSymbol,
  project: ({ item }) => {
    assertTextFineNleParameters(item.parameters);
    const parameters = item.parameters;
    const placement = parameters.placement;
    const placementFields: NleInspectorFieldDraft[] = [
      { id: "kind", label: "布局", control: "readout", value: placement.kind },
    ];
    if (placement.kind === "point") {
      placementFields.push(
        { id: "x", label: "X", control: "number", value: placement.x,
          edit: (value) => ({ kind: "set-placement", placement: { ...structuredClone(placement), x: value } }) },
        { id: "y", label: "Y", control: "number", value: placement.y,
          edit: (value) => ({ kind: "set-placement", placement: { ...structuredClone(placement), y: value } }) },
        { id: "anchor-inline", label: "水平锚点", control: "readout", value: placement.anchorInline },
        { id: "anchor-block", label: "垂直锚点", control: "readout", value: placement.anchorBlock },
      );
    } else if (placement.kind === "flow") {
      placementFields.push(
        { id: "inline-align", label: "水平对齐", control: "readout", value: placement.inlineAlign },
        { id: "block-align", label: "垂直对齐", control: "readout", value: placement.blockAlign },
        { id: "wrap", label: "换行", control: "readout", value: placement.wrap },
        { id: "overflow", label: "溢出", control: "readout", value: placement.overflow },
      );
    } else {
      placementFields.push(
        { id: "commands", label: "路径", control: "readout", value: `${placement.commands.length} 段` },
        { id: "orientation", label: "方向", control: "readout", value: placement.orientation },
      );
    }
    const singleText = parameters.children.length === 1 && parameters.children[0]?.kind === "text"
      ? parameters.children[0] : undefined;
    return [{
      id: "text-content",
      label: "文字",
      domain: "how",
      page: { id: "content", label: "内容" },
      fields: [
        { id: "content", label: "内容", control: "text", value: plainText(parameters.children),
          ...(singleText === undefined ? {} : { edit: (value: string | number | boolean) => ({
            kind: "set-document", children: [{ ...structuredClone(singleText), text: value }],
          }) }) },
        { id: "layers", label: "绘制层", control: "readout", value: `${parameters.paints.length} 层` },
        { id: "motions", label: "动作序列", control: "readout", value: `${parameters.sequences?.length ?? 0} 个` },
      ],
    }, {
      id: "text-type",
      label: "字体",
      domain: "how",
      page: { id: "typography", label: "字体" },
      fields: [
        ...value("family", "字体", parameters.typography.fontFamily, undefined, (next) => ({
          kind: "set-style", typography: { ...structuredClone(parameters.typography), fontFamily: next },
          paints: structuredClone(parameters.paints),
        })),
        ...value("size", "字号", parameters.typography.fontSizePx, "px", (next) => ({
          kind: "set-style", typography: { ...structuredClone(parameters.typography), fontSizePx: next },
          paints: structuredClone(parameters.paints),
        })),
        ...value("weight", "字重", parameters.typography.fontWeight, undefined, (next) => ({
          kind: "set-style", typography: { ...structuredClone(parameters.typography), fontWeight: next },
          paints: structuredClone(parameters.paints),
        })),
        ...value("line-height", "行高", parameters.typography.lineHeight, undefined, (next) => ({
          kind: "set-style", typography: { ...structuredClone(parameters.typography), lineHeight: next },
          paints: structuredClone(parameters.paints),
        })),
      ],
    }, {
      id: "text-placement",
      label: "排版位置",
      domain: "where",
      page: { id: "layout", label: "布局" },
      fields: placementFields,
    }];
  },
};
