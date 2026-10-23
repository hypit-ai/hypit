import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanion, StudioTrackCompanionContext } from "@hypit/studio-companion";
import {
  artifactPreview,
  authoredItemTitle,
  childItems,
  previewLayer,
  requiredSurfaceValue,
  temporalLineageFor,
  temporalDomainMarker,
} from "@hypit/studio-companion";
import { audioClipDefaults } from "./surface.js";
import { audioTrackModuleRef, audioTrackTypes } from "./manifest.js";
import type { AudioTrackProgram } from "./types.js";

function projectAudio(context: StudioTrackCompanionContext) {
  const program = requiredSurfaceValue(context, "program") as AudioTrackProgram;
  const clips = program.clips.map((clip) => ({
    id: clip.id,
    subjectId: clip.subjectId,
    startFrame: clip.window.startFrame,
    endFrameExclusive: clip.window.endFrameExclusive,
    stackOrder: Number.MIN_SAFE_INTEGER,
    sourceTypes: [audioTrackTypes.clipSpec],
    preview: artifactPreview("audio", clip.source.artifact.resource),
  }));
  return childItems(context, clips, "audio-clip", "standard").map((item, index) => {
    const clip = clips[index]!;
    const temporal = temporalLineageFor(context, clip.id, "window");
    const marker = temporalDomainMarker(temporal);
    return {
      ...item,
      display: {
        title: authoredItemTitle(context, item.authoredId, clip.sourceTypes, ["source"]),
        layers: [previewLayer(clip.preview, "waveform")],
      },
      ...(marker === undefined ? {} : { marker }),
      ...(temporal === undefined ? {} : { temporal }),
    };
  });
}

export const audioTrackStudioTrackCompanions: readonly StudioTrackCompanion[] = [{
  id: "track",
  role: "track",
  output: { type: compositionTypes.audioTrack, surface: "track", modules: [audioTrackModuleRef] },
  family: "audio",
  tone: "green",
  icon: "waveform",
  bindings: [
    { name: "source" },
    { name: "source-time" },
    { name: "gain", writable: true, fallback: audioClipDefaults.gain },
    { name: "fade-in", writable: true, fallback: audioClipDefaults["fade-in"] },
    { name: "fade-out", writable: true, fallback: audioClipDefaults["fade-out"] },
  ],
  inspector: [
    {
      binding: "gain",
      label: "Gain",
      domain: "how",
      page: { id: "mix", label: "Mix" },
      section: { id: "mix", label: "Mix" },
      control: "number",
      unit: "%",
      number: { scale: 100, minimum: 0, step: 1 },
    },
    ...(["fade-in", "fade-out"] as const).map((binding) => ({
      binding,
      label: binding === "fade-in" ? "Fade In" : "Fade Out",
      domain: "when" as const,
      page: { id: "fade", label: "Fade" },
      section: { id: "fade", label: "Fade" },
      control: "number" as const,
      number: { suffixes: ["ms", "s", "f"], minimum: 0 },
    })),
  ],
  requiredValues: ["program"],
  project: projectAudio,
  lane: { heightPx: 48 },
}];

export const audioTrackStudioParameterCompanions = [];
