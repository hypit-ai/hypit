import type { NleInspectorAdjustmentPresentation } from "@hypit/nle-view";

import { pictureFrameNleAuthoring, pictureFrameNleSymbol, type PictureFrameNleParameters } from "./nle.js";

export const pictureFrameNleInspector: NleInspectorAdjustmentPresentation = {
  component: pictureFrameNleSymbol,
  project: ({ project, item }) => {
    const parameters = pictureFrameNleAuthoring.inspect({ project, item, medium: "picture" }) as PictureFrameNleParameters;
    const treatment = parameters.treatment;
    const padding = (side: keyof typeof treatment.padding, value: string | number | boolean) => ({
      kind: "set-treatment",
      treatment: {
        ...structuredClone(treatment),
        padding: { ...structuredClone(treatment.padding), [side]: value },
      },
    });
    return [{
      id: "picture-frame", label: "边框与裁切", domain: "how", page: { id: "appearance", label: "外观" }, fields: [
        { id: "clip", label: "裁切", control: "readout", value: treatment.clip.kind },
        { id: "padding-top", label: "上内边距", control: "number", value: treatment.padding.topPx, unit: "px",
          edit: (value) => padding("topPx", value) },
        { id: "padding-right", label: "右内边距", control: "number", value: treatment.padding.rightPx, unit: "px",
          edit: (value) => padding("rightPx", value) },
        { id: "padding-bottom", label: "下内边距", control: "number", value: treatment.padding.bottomPx, unit: "px",
          edit: (value) => padding("bottomPx", value) },
        { id: "padding-left", label: "左内边距", control: "number", value: treatment.padding.leftPx, unit: "px",
          edit: (value) => padding("leftPx", value) },
        { id: "border", label: "描边", control: "readout", value: treatment.border === undefined
          ? "无" : `${treatment.border.widthPx}px ${treatment.border.style}` },
        { id: "shadows", label: "阴影", control: "readout", value: `${treatment.shadows.length} 层` },
      ],
    }];
  },
};
