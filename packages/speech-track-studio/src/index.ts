import { speechTrackMarkupSurfaces, speechTrackModuleRef } from "@hypit/speech-track";
import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanion, StudioTrackCompanionContext, StudioEntityDraft, StudioInspectorFieldDeclaration, StudioSourceBindingDeclaration } from "@hypit/studio-adapter";
import { artifactPreview, previewLayer } from "@hypit/studio-adapter";

const frameParameters: readonly StudioSourceBindingDeclaration[] = [
  { name: "within" },
  ...["left", "top", "right", "bottom", "x", "y", "width", "height"].map((name) => ({ name, writable: true })),
];

const speechVisualProperties = (speechTrackMarkupSurfaces[0]
  ?.vocabulary.attributes.find((attribute) => attribute.name === "visual-appearance")?.recipe ?? [])
;

function title(name: string): string {
  return name.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function valuesFor(property: typeof speechVisualProperties[number]): readonly string[] | undefined {
  return "values" in property ? property.values : undefined;
}

const speechInspector: readonly StudioInspectorFieldDeclaration[] = [
  ...frameParameters.filter(({ writable }) => writable === true).map(({ name }) => ({
    binding: `visual-frame.${name}`, label: title(name), domain: "where" as const,
    page: { id: "frame", label: "Frame" }, section: { id: "frame", label: "Frame" }, control: "text" as const,
  })),
  ...speechVisualProperties.map((property) => ({
    binding: `visual-appearance.${property.name}`, label: title(property.name), domain: "where" as const,
    page: { id: "fit", label: "Fit" }, section: { id: "fit", label: "Fit" },
    ...(property.summary === undefined ? {} : { summary: property.summary }),
    control: valuesFor(property) !== undefined ? "select" as const : "number" as const,
    ...(valuesFor(property) === undefined ? {} : { options: valuesFor(property)! }),
  })),
  {
    binding: "visual-z", label: "Stack", domain: "where", page: { id: "stacking", label: "Stacking" },
    section: { id: "stacking", label: "Stacking" }, control: "number",
  },
];

type SpeechVisualTrack = {
  readonly presents?: readonly {
    readonly id: string;
    readonly subjectId?: string;
    readonly elements?: readonly {
      readonly kind?: string;
      readonly artifact?: { readonly resource?: string };
    }[];
  }[];
};

type SpeechAudioTrack = {
  readonly clips?: readonly {
    readonly id: string;
    readonly subjectId?: string;
    readonly artifact?: { readonly resource?: string };
  }[];
};

function projectSpeechVisual(context: StudioTrackCompanionContext): readonly StudioEntityDraft[] {
  const presents = new Map(((context.track.value as SpeechVisualTrack).presents ?? [])
    .map((present) => [present.id, present] as const));
  return context.generic().map((entity) => {
    const id = entity.presentId ?? entity.authoredId;
    const present = presents.get(id);
    const subjectId = present?.subjectId;
    const artifact = present?.elements?.find((element) =>
      (element.kind === "image" || element.kind === "video") && element.artifact?.resource !== undefined)?.artifact;
    return {
      ...entity,
      authoredId: subjectId ?? id,
      ...(context.placement === undefined ? {} : { elementRange: context.placement.range }),
      display: {
        title: subjectId ?? "Speech",
        layers: artifact?.resource === undefined ? [] : [previewLayer(artifactPreview("video", artifact.resource), "storyboard")],
      },
      presentation: { entity: "media-item", chrome: "standard" },
    };
  });
}

function projectSpeechAudio(context: StudioTrackCompanionContext): readonly StudioEntityDraft[] {
  const clips = new Map(((context.track.value as SpeechAudioTrack).clips ?? [])
    .map((clip) => [clip.id, clip] as const));
  return context.generic().map((entity) => {
    const id = entity.presentId ?? entity.authoredId;
    const clip = clips.get(id);
    const subjectId = clip?.subjectId;
    return {
      ...entity,
      authoredId: subjectId ?? id,
      display: {
        title: subjectId ?? entity.authoredId,
        layers: clip?.artifact?.resource === undefined ? [] : [previewLayer(artifactPreview("audio", clip.artifact.resource), "waveform")],
      },
      presentation: { entity: "audio-clip", chrome: "standard" },
    };
  });
}

export const speechTrackStudioTrackCompanions: readonly StudioTrackCompanion[] = [
  {
    id: "visual", role: "track",
    output: { type: compositionTypes.visualTrack, surface: "track", modules: [speechTrackModuleRef] },
    family: "speech-visual", tone: "blue", label: "Speech Visual", icon: "video",
    bindings: [
      { name: "visual-frame", referenced: frameParameters },
      {
        name: "visual-appearance",
        recipe: { bindings: speechVisualProperties.map(({ name }) => ({ name })) },
      },
      { name: "visual-z", writable: true },
    ],
    inspector: speechInspector,
    project: projectSpeechVisual,
    lane: { heightPx: 76 },
  },
  {
    id: "audio", role: "track",
    output: { type: compositionTypes.audioTrack, surface: "track", modules: [speechTrackModuleRef] },
    family: "speech-audio", tone: "green", label: "Speech Audio", icon: "waveform",
    bindings: [], inspector: [], project: projectSpeechAudio,
    lane: { heightPx: 48 },
  },
];
