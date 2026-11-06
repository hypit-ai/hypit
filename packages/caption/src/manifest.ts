import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import { audiovisualHtmlDependency, audiovisualHtmlTypes } from "@hypit/audiovisual-html";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { spatialDependency } from "@hypit/spatial";
import { temporalDependency, temporalTypes } from "@hypit/temporal";

export const captionModuleRef = { name: "@hypit/caption", version: "1" } as const;
export const captionHtmlModuleRef = { name: "@hypit/caption/html", version: "1" } as const;

export const captionTypes = {
  document: { module: captionModuleRef, name: "CaptionDocument" },
  timing: { module: captionModuleRef, name: "LocalCaptionTiming" },
  selection: { module: captionModuleRef, name: "CaptionSelection" },
  style: { module: captionModuleRef, name: "CaptionStyle" },
  presentationOverrideSpec: { module: captionModuleRef, name: "CaptionPresentationOverrideSpec" },
  presentation: { module: captionModuleRef, name: "CaptionPresentation" },
  schedule: { module: captionModuleRef, name: "CaptionPresentationSchedule" },
  componentSpec: { module: captionModuleRef, name: "CaptionComponentSpec" },
  unitEventSpec: { module: captionModuleRef, name: "CaptionUnitEventSpec" },
} satisfies Record<string, TypeRef>;

export const captionProducers = {
  createPresentation: { module: captionModuleRef, name: "create-presentation" },
  appendStyleOverride: { module: captionModuleRef, name: "append-style-override" },
  appendHiddenOverride: { module: captionModuleRef, name: "append-hidden-override" },
  schedule: { module: captionModuleRef, name: "schedule-presentation" },
  source: { module: captionModuleRef, name: "caption-source" },
  unitEvent: { module: captionModuleRef, name: "caption-unit-event" },
  htmlSource: { module: captionHtmlModuleRef, name: "caption-html-source" },
} satisfies Record<string, ProducerRef>;

export const captionManifest: ModuleManifest = {
  format: "hypit.module@1", ...captionModuleRef,
  dependencies: [audiovisualDependency, temporalDependency, spatialDependency],
  types: Object.values(captionTypes).map((type) => type.name), capabilities: [],
  producers: [{
    name: captionProducers.createPresentation.name,
    inputs: [{ name: "style", type: captionTypes.style }],
    result: { kind: "output", name: "presentation", type: captionTypes.presentation },
  }, {
    name: captionProducers.appendStyleOverride.name,
    inputs: [
      { name: "presentation", type: captionTypes.presentation },
      { name: "spec", type: captionTypes.presentationOverrideSpec },
      { name: "style", type: captionTypes.style },
    ],
    result: { kind: "output", name: "presentation", type: captionTypes.presentation },
  }, {
    name: captionProducers.appendHiddenOverride.name,
    inputs: [
      { name: "presentation", type: captionTypes.presentation },
      { name: "spec", type: captionTypes.presentationOverrideSpec },
    ],
    result: { kind: "output", name: "presentation", type: captionTypes.presentation },
  }, {
    name: captionProducers.schedule.name,
    inputs: [
      { name: "spec", type: captionTypes.componentSpec },
      { name: "document", type: captionTypes.document },
      { name: "timing", type: captionTypes.timing },
      { name: "presentation", type: captionTypes.presentation },
    ],
    result: { kind: "output", name: "schedule", type: captionTypes.schedule },
  }, {
    name: captionProducers.source.name,
    inputs: [
      { name: "spec", type: captionTypes.componentSpec },
      { name: "document", type: captionTypes.document },
      { name: "timing", type: captionTypes.timing },
      { name: "presentation", type: captionTypes.presentation },
    ],
    result: { kind: "output", name: "source", type: audiovisualTypes.programSource },
  }, {
    name: captionProducers.unitEvent.name,
    inputs: [{ name: "timing", type: captionTypes.timing },
      { name: "spec", type: captionTypes.unitEventSpec }],
    result: { kind: "output", name: "event", type: temporalTypes.regionSet },
  }],
};

export const captionHtmlManifest: ModuleManifest = {
  format: "hypit.module@1", ...captionHtmlModuleRef,
  dependencies: [captionModuleRef, audiovisualHtmlDependency], types: [], capabilities: [],
  producers: [{
    name: captionProducers.htmlSource.name,
    inputs: [
      { name: "spec", type: captionTypes.componentSpec },
      { name: "document", type: captionTypes.document },
      { name: "timing", type: captionTypes.timing },
      { name: "presentation", type: captionTypes.presentation },
    ],
    result: { kind: "output", name: "source", type: audiovisualHtmlTypes.source },
  }],
};

export const captionDependency = captionModuleRef;
