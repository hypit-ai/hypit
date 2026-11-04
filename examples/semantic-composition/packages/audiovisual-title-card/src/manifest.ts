import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import { audiovisualHtmlDependency, audiovisualHtmlTypes } from "@hypit/audiovisual-html";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";

export const titleCardModuleRef = {
  name: "@example/audiovisual-title-card",
  version: "1",
} as const;

export const titleCardHtmlModuleRef = {
  name: "@example/audiovisual-title-card/html",
  version: "1",
} as const;

export const titleCardTypes = {
  spec: { module: titleCardModuleRef, name: "TitleCardSpec" },
} satisfies Record<string, TypeRef>;

export const titleCardProducers = {
  source: { module: titleCardModuleRef, name: "title-card-source" },
  htmlSource: { module: titleCardHtmlModuleRef, name: "title-card-html-source" },
} satisfies Record<string, ProducerRef>;

export const titleCardManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: titleCardModuleRef.name,
  version: titleCardModuleRef.version,
  dependencies: [audiovisualDependency],
  types: [titleCardTypes.spec.name],
  capabilities: [],
  producers: [{
    name: titleCardProducers.source.name,
    inputs: [{ name: "spec", type: titleCardTypes.spec }],
    result: { kind: "output", name: "source", type: audiovisualTypes.programSource },
  }],
};

export const titleCardHtmlManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: titleCardHtmlModuleRef.name,
  version: titleCardHtmlModuleRef.version,
  dependencies: [titleCardModuleRef, audiovisualHtmlDependency],
  types: [],
  capabilities: [],
  producers: [{
    name: titleCardProducers.htmlSource.name,
    inputs: [{ name: "spec", type: titleCardTypes.spec }],
    result: { kind: "output", name: "source", type: audiovisualHtmlTypes.source },
  }],
};
