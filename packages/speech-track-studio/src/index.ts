import { speechTrackMarkupSurfaces } from "@hypit/speech-track";
import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft, StudioParameterDeclaration, StudioRecipeParameterDeclaration } from "@hypit/studio-adapter";
import { artifactPreview, previewLayer } from "@hypit/studio-adapter";

const frameParameters: readonly StudioParameterDeclaration[] = [
  { name: "within", label: "Within", writable: false },
  { name: "left", label: "Left", writable: true },
  { name: "top", label: "Top", writable: true },
  { name: "right", label: "Right", writable: true },
  { name: "bottom", label: "Bottom", writable: true },
  { name: "x", label: "X", writable: true },
  { name: "y", label: "Y", writable: true },
  { name: "width", label: "Width", writable: true },
  { name: "height", label: "Height", writable: true },
];

const speechVisualRecipe: readonly StudioRecipeParameterDeclaration[] = (speechTrackMarkupSurfaces[0]
  ?.vocabulary.attributes.find((attribute) => attribute.name === "visual-appearance")?.recipe ?? [])
  .map((property) => ({ name: property.name, group: "where", section: "fit" }));

type SpeechVisualTrack = {
  readonly presents?: readonly {
    readonly id: string;
    readonly subjectId?: string;
    readonly elements?: readonly {
      readonly kind?: string;
      readonly artifact?: { readonly digest?: string };
    }[];
  }[];
};

type SpeechAudioTrack = {
  readonly clips?: readonly {
    readonly id: string;
    readonly subjectId?: string;
    readonly artifact?: { readonly digest?: string };
  }[];
};

function projectSpeechVisual(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const presents = new Map(((context.track.value as SpeechVisualTrack).presents ?? [])
    .map((present) => [present.id, present] as const));
  return context.generic().map((entity) => {
    const id = entity.presentId ?? entity.authoredId;
    const present = presents.get(id);
    const subjectId = present?.subjectId;
    const artifact = present?.elements?.find((element) =>
      (element.kind === "image" || element.kind === "video") && element.artifact?.digest !== undefined)?.artifact;
    return {
      ...entity,
      authoredId: subjectId ?? id,
      ...(context.placement === undefined ? {} : { elementRange: context.placement.range }),
      display: {
        title: subjectId ?? "Speech",
        layers: artifact?.digest === undefined ? [] : [previewLayer(artifactPreview("video", artifact.digest), "storyboard")],
      },
      presentation: { entity: "media-item", chrome: "standard" },
    };
  });
}

function projectSpeechAudio(context: StudioAdapterContext): readonly StudioEntityDraft[] {
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
        layers: clip?.artifact?.digest === undefined ? [] : [previewLayer(artifactPreview("audio", clip.artifact.digest), "waveform")],
      },
      presentation: { entity: "audio-clip", chrome: "standard" },
    };
  });
}

export const speechTrackStudioAdapters: readonly StudioAdapter[] = [
  {
    id: "visual", role: "track",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/speech-track"] },
    family: "speech-visual", tone: "blue", label: "Speech Visual", icon: "video",
    parameters: [
      { name: "visual-frame", label: "Frame", writable: false, referenced: frameParameters },
      {
        name: "visual-appearance", label: "Appearance", writable: false,
        recipe: { parameters: speechVisualRecipe },
      },
      { name: "visual-z", label: "Z", control: "number", writable: true },
    ],
    project: projectSpeechVisual,
    lane: { heightPx: 76 },
  },
  {
    id: "audio", role: "track",
    output: { type: "AudioTrack", surface: "track", modules: ["@hypit/speech-track"] },
    family: "speech-audio", tone: "green", label: "Speech Audio", icon: "waveform",
    parameters: [], project: projectSpeechAudio,
    lane: { heightPx: 48 },
  },
];
