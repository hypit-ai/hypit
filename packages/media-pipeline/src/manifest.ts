import { artifactDependency } from "@hypit/artifact";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import { svsModuleRef, svsRecipeType } from "@hypit/svs";
import { speechDependency, speechTypes } from "@hypit/speech";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { artifactTypes } from "@hypit/artifact";
import type {
  CapabilityRef,
  ModuleManifest,
  ProducerRef,
  TypeRef,
  ValueSchema,
} from "@hypit/protocol";

export const mediaPipelineModuleRef = { name: "@hypit/media-pipeline", version: "1" } as const;
export const mediaPipelineTypes = {
  selectionRequest: { module: mediaPipelineModuleRef, name: "MediaSelectionRequest" },
  audioProgramPlan: { module: mediaPipelineModuleRef, name: "AudioProgramPlan" },
  transformProgram: { module: mediaPipelineModuleRef, name: "MediaTransformProgram" },
  audioExtractionRequest: { module: mediaPipelineModuleRef, name: "AudioExtractionRequest" },
  frameExtractionRequest: { module: mediaPipelineModuleRef, name: "FrameExtractionRequest" },
  stillVideoRequest: { module: mediaPipelineModuleRef, name: "StillVideoRequest" },
  stillVideoLayout: { module: mediaPipelineModuleRef, name: "StillVideoLayout" },
} satisfies Record<string, TypeRef>;
export const mediaPipelineCapabilities = {
  inspect: { module: mediaPipelineModuleRef, name: "inspect-media" },
  normalize: { module: mediaPipelineModuleRef, name: "normalize-media" },
  transform: { module: mediaPipelineModuleRef, name: "transform-media" },
  extractAudio: { module: mediaPipelineModuleRef, name: "extract-media-audio" },
  extractFrame: { module: mediaPipelineModuleRef, name: "extract-media-frame" },
  renderStill: { module: mediaPipelineModuleRef, name: "render-still-video" },
  projectSpeechEvidenceAudio: { module: mediaPipelineModuleRef, name: "project-speech-evidence-audio" },
  renderAudio: { module: mediaPipelineModuleRef, name: "render-timeline-audio" },
  mux: { module: mediaPipelineModuleRef, name: "mux-program-media" },
} satisfies Record<string, CapabilityRef>;
export const mediaPipelineProducers = {
  inspect: { module: mediaPipelineModuleRef, name: "request-media-inspection" },
  select: { module: mediaPipelineModuleRef, name: "select-media-streams" },
  normalize: { module: mediaPipelineModuleRef, name: "request-media-normalization" },
  transform: { module: mediaPipelineModuleRef, name: "request-media-transform" },
  extractAudio: { module: mediaPipelineModuleRef, name: "request-audio-extraction" },
  extractFrame: { module: mediaPipelineModuleRef, name: "request-frame-extraction" },
  clipTimeLayout: { module: mediaPipelineModuleRef, name: "clip-time-still-layout" },
  planStill: { module: mediaPipelineModuleRef, name: "plan-still-video" },
  renderStill: { module: mediaPipelineModuleRef, name: "request-still-video" },
  bindStill: { module: mediaPipelineModuleRef, name: "bind-still-video-source" },
  projectSpeechEvidenceAudio: { module: mediaPipelineModuleRef, name: "request-speech-evidence-audio" },
  planAudio: { module: mediaPipelineModuleRef, name: "compile-audio-program" },
  renderAudio: { module: mediaPipelineModuleRef, name: "request-audio-render" },
  renderAudioRange: { module: mediaPipelineModuleRef, name: "request-audio-range" },
  mux: { module: mediaPipelineModuleRef, name: "request-media-mux" },
  projectMuxed: { module: mediaPipelineModuleRef, name: "project-muxed-media" },
} satisfies Record<string, ProducerRef>;

const integer = { kind: "number", integer: true, minimum: 0 } as const;
const mode = (name: string): ValueSchema => ({
  kind: "object",
  fields: { mode: { schema: { kind: "literal", value: name } } },
});
const streamMode: ValueSchema = {
  kind: "object",
  fields: {
    mode: { schema: { kind: "literal", value: "stream-index" } },
    streamIndex: { schema: integer },
  },
};
export const mediaSelectionRequestSchema: ValueSchema = {
  kind: "object",
  fields: {
    video: { schema: { kind: "oneOf", variants: [mode("primary-moving"), streamMode, mode("none")] } },
    audio: { schema: { kind: "oneOf", variants: [mode("default"), streamMode, mode("none")] } },
    spanAuthority: { schema: { kind: "string", enum: ["video", "audio"] } },
    frameRate: { schema: {
      kind: "object",
      fields: {
        numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
        denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
      },
    } },
  },
};

const videoSelectorSchema: ValueSchema = {
  kind: "oneOf",
  variants: [mode("primary-moving"), streamMode],
};
const audioSelectorSchema: ValueSchema = {
  kind: "oneOf",
  variants: [mode("default"), streamMode],
};
const nonNegativeNumber = { kind: "number", minimum: 0 } as const;
const trimOperationSchema: ValueSchema = {
  kind: "object",
  fields: {
    kind: { schema: { kind: "literal", value: "trim" } },
    startSec: { schema: nonNegativeNumber, optional: true },
    endSec: { schema: nonNegativeNumber, optional: true },
    tailSec: { schema: nonNegativeNumber, optional: true },
  },
};
const retimeOperationSchema: ValueSchema = {
  kind: "object",
  fields: {
    kind: { schema: { kind: "literal", value: "retime" } },
    rate: { schema: { kind: "number", minimum: 0.000001, maximum: 100 } },
    pitch: { schema: { kind: "literal", value: "preserve" } },
  },
};
export const mediaTransformProgramSchema: ValueSchema = {
  kind: "object",
  fields: {
    operations: { schema: { kind: "array", minItems: 1, items: {
      kind: "oneOf", variants: [trimOperationSchema, retimeOperationSchema],
    } } },
  },
};
export const audioExtractionRequestSchema: ValueSchema = {
  kind: "object",
  fields: {
    audio: { schema: audioSelectorSchema },
    output: { schema: {
      kind: "object",
      fields: {
        container: { schema: { kind: "literal", value: "wav" } },
        codec: { schema: { kind: "literal", value: "pcm_s16le" } },
        sampleRate: { schema: { kind: "literal", value: 48_000 } },
        channels: { schema: { kind: "literal", value: 2 } },
      },
    } },
  },
};
export const frameExtractionRequestSchema: ValueSchema = {
  kind: "object",
  fields: {
    video: { schema: videoSelectorSchema },
    at: { schema: { kind: "oneOf", variants: [
      { kind: "object", fields: { kind: { schema: { kind: "literal", value: "first" } } } },
      { kind: "object", fields: { kind: { schema: { kind: "literal", value: "last" } } } },
      { kind: "object", fields: {
        kind: { schema: { kind: "literal", value: "frame" } },
        index: { schema: integer },
      } },
      { kind: "object", fields: {
        kind: { schema: { kind: "literal", value: "time" } },
        seconds: { schema: nonNegativeNumber },
      } },
    ] } },
    output: { schema: {
      kind: "object",
      fields: { format: { schema: { kind: "literal", value: "png" } } },
    } },
  },
};

export const stillVideoRequestSchema: ValueSchema = {
  kind: "object",
  fields: {
    frameRate: { schema: {
      kind: "object",
      fields: {
        numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
        denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
      },
    } },
    frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
    guide: { optional: true, schema: { kind: "literal", value: "clip-time" } },
    output: { schema: {
      kind: "object",
      fields: {
        container: { schema: { kind: "literal", value: "mp4" } },
        codec: { schema: { kind: "literal", value: "h264" } },
        pixelFormat: { schema: { kind: "literal", value: "yuv420p" } },
      },
    } },
    segments: { schema: { kind: "array", items: {
      kind: "object",
      fields: {
        startFrame: { schema: { kind: "number", integer: true, minimum: 0 } },
        endFrameExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
        source: { optional: true, schema: {
          kind: "object",
          fields: {
            kind: { schema: { kind: "literal", value: "blob" } },
            resource: { schema: { kind: "string", minLength: 5, maxLength: 256 } },
            size: { schema: { kind: "number", integer: true, minimum: 0 } },
            mediaType: { schema: { kind: "string", minLength: 6 } },
          },
        } },
      },
    } } },
  },
};

export const stillVideoLayoutSchema: ValueSchema = {
  kind: "object",
  fields: {
    weights: { schema: { kind: "array", items: { kind: "number", minimum: 0 } } },
    guide: { optional: true, schema: { kind: "literal", value: "clip-time" } },
  },
};

const blobRefSchema: ValueSchema = {
  kind: "object",
  fields: {
    kind: { schema: { kind: "literal", value: "blob" } },
    resource: { schema: { kind: "string", minLength: 5, maxLength: 256 } },
    size: { schema: { kind: "number", integer: true, minimum: 0 } },
    mediaType: { schema: { kind: "literal", value: "audio/wav" } },
  },
};

export const audioProgramPlanSchema: ValueSchema = {
  kind: "object",
  fields: {
    frameRate: { schema: {
      kind: "object",
      fields: {
        numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
        denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
      },
    } },
    frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
    sampleRate: { schema: { kind: "literal", value: 48_000 } },
    sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
    clips: { schema: { kind: "array", items: {
      kind: "object",
      fields: {
        id: { schema: { kind: "string", minLength: 1 } },
        artifact: { schema: blobRefSchema },
        targetStartSample: { schema: integer },
        targetEndSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
        sourceSampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
        sourceStartSample: { schema: integer },
        sourceEndSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
        sourceLoop: { schema: { kind: "boolean" } },
        sourcePhaseSample: { schema: integer },
        playbackRate: { schema: { kind: "number", minimum: 0.000001, maximum: 100 } },
        pitch: { schema: { kind: "literal", value: "preserve" } },
        gain: { schema: { kind: "number", minimum: 0, maximum: 64 } },
        fadeInSamples: { schema: integer },
        fadeOutSamples: { schema: integer },
      },
    } } },
    mix: { schema: {
      kind: "object",
      fields: {
        normalize: { schema: { kind: "literal", value: false } },
        limiter: { schema: { kind: "literal", value: "none" } },
      },
    } },
  },
};

export const mediaPipelineMarkupSurfaces = [
    {
      name: "synchronized-media", tag: "Normalize", mode: "structured",
      outputs: [mediaPipelineTypes.selectionRequest, mediaTypes.synchronized],
      vocabulary: {
        summary:
          "Inspects one BlobArtifact, selects its video and audio streams and normalizes them into SynchronizedMedia on one frame domain.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the selection Record and the normalized media this element publishes." },
          { name: "source", kind: "reference", required: true,
            accepts: [artifactTypes.blob],
            summary: "Selects the media Artifact this element inspects and normalizes." },
          { name: "recipe", kind: "reference", required: false, accepts: [svsRecipeType],
            summary: "Selects a Recipe containing video, audio and span-authority stream policy." },
          { name: "video", kind: "literal", required: false,
            summary: "Decides which moving-image stream is carried: `primary-moving`, `none`, or `stream:<index>`." },
          { name: "audio", kind: "literal", required: false,
            summary: "Decides which audio stream is carried: `default`, `none`, or `stream:<index>`." },
          { name: "span-authority", kind: "literal", required: false,
            values: ["video", "audio"],
            summary: "Decides which selected stream defines the extent the other is trimmed or padded to." },
          { name: "clock", kind: "reference", required: false, accepts: [programSpaceTypes.clock],
            summary: "Selects the authored frame clock shared with the programme." },
          { name: "frame-rate", kind: "literal", required: false,
            summary: "Legacy inline frame rate; write exactly one of clock or frame-rate." },
        ],
        ports: [
          { name: "media", type: mediaTypes.synchronized,
            summary: "The normalized SynchronizedMedia, addressed as `<id>.media`." },
        ],
        example: `<pipeline:Normalize id="music-media" source={music}
  recipe={recipes.media.audio} clock={clock}/>`,
        notes: [
          "Write exactly one of recipe or the direct video/audio/span-authority attributes, and exactly one of clock or frame-rate.",
          "`primary-moving` excludes attached-picture streams, prefers one declared default and fails closed on an ambiguous container; `stream:<index>` is for a container the author genuinely knows.",
          "Selecting embedded audio is a media fact only and makes no SemanticTake, speaker or alignment claim.",
        ],
      },
    },
    {
      name: "still-video", tag: "StillVideo", mode: "structured",
      outputs: [speechTypes.duration, mediaPipelineTypes.stillVideoLayout, mediaPipelineTypes.stillVideoRequest, artifactTypes.blob],
      vocabulary: {
        summary: "Spreads one or more authored images over an explicit duration as an ordinary video-only MP4 Blob on a frame clock.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the still-video operation and the MP4 Artifact it publishes." },
          { name: "source", kind: "reference", required: false, accepts: [artifactTypes.blob],
            summary: "Selects the one authored image held for the full video; write Still children instead for several images." },
          { name: "duration", kind: "literal", required: true,
            summary: "Sets the video's length in seconds, such as 6 or 2.5s; choose it from the visual passage this held image is meant to carry." },
          { name: "clock", kind: "reference", required: true, accepts: [programSpaceTypes.clock],
            summary: "Selects the frame clock used by the generated MP4." },
          { name: "guide", kind: "literal", required: false, values: ["clip-time"],
            summary: "Burns one clip-local diagnostic band with timecode, frame count and a progress ruler into the held video." },
        ],
        children: [
          { tag: "Still", cardinality: "many",
            summary: "One image in authored order; the duration is divided among the Still children by weight, equally unless weights say otherwise.",
            attributes: [
              { name: "source", kind: "reference", required: true, accepts: [artifactTypes.blob],
                summary: "Selects the authored image whose first decoded frame is held for this share." },
              { name: "weight", kind: "literal", required: false,
                summary: "Sets this image's share of the duration relative to its siblings, such as 2; every Still weighs 1 unless written." },
            ] },
        ],
        ports: [{ name: "video", type: artifactTypes.blob,
          summary: "The ordinary video-only MP4 Artifact, addressed as `<id>.video`." }],
        example: `<media:StillVideo id="kitchen-stills" duration="6" clock={clock}>
  <media:Still source={counter}/>
  <media:Still source={basil} weight="2"/>
  <media:Still source={board}/>
</media:StillVideo>`,
        notes: [
          "Write exactly one of source or Still children. Frames are whole: each image gets the floor of its share and the leftover frames go to the largest remainders, so the split is deterministic and every image holds at least one frame.",
          "Images of different sizes are fitted into the first image's frame, letterboxed on black.",
          "The result is a normal video Blob, not SynchronizedMedia and not a SemanticTake.",
          "The optional clip-time guide describes this clip's local frame domain, not its later position in a Film.",
          "Use Normalize afterward exactly as for generated or imported moving video.",
          "Encoding is a render-still-video Need fulfilled by the selected media Provider; this Surface never invokes FFmpeg itself.",
        ],
      },
    },
    {
      name: "transform-media", tag: "Transform", mode: "structured",
      outputs: [mediaPipelineTypes.transformProgram, artifactTypes.blob],
      vocabulary: {
        summary:
          "Runs an ordered trim and retime program over one already normalized SynchronizedMedia value.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the transform program Record and the transformed video this element publishes." },
          { name: "source", kind: "reference", required: true,
            accepts: [mediaTypes.synchronized],
            summary: "Selects the prepared SynchronizedMedia this element transforms." },
        ],
        children: [
          { tag: "Trim", cardinality: "many",
            summary: "Removes time from the head or the tail, taking at least one of `start`, `end` or `tail` in seconds.",
            attributes: [
              { name: "start", kind: "literal", required: false,
                summary: "Decides where the kept span begins, as seconds from the current start, such as `0.25s` or `2`." },
              { name: "end", kind: "literal", required: false,
                summary: "Decides where the kept span ends, as positive seconds from the current start." },
              { name: "tail", kind: "literal", required: false,
                summary: "Decides how many seconds are removed from the current end." },
            ] },
          { tag: "Retime", cardinality: "many",
            summary: "Changes playback speed by `rate` in the range (0, 100] while `pitch` holds the original pitch.",
            attributes: [
              { name: "rate", kind: "literal", required: true,
                summary: "Decides the playback speed multiplier, above `0` and at most `100`." },
              { name: "pitch", kind: "literal", required: true,
                values: ["preserve"],
                summary: "Decides how pitch follows the speed change, and the one spelling keeps the original pitch." },
            ] },
        ],
        ports: [
          { name: "video", type: artifactTypes.blob,
            summary: "The transformed media Artifact, addressed as `<id>.video`." },
        ],
        example: `<media:Transform id="prepared" source={shot-media.media}>
  <media:Trim tail="0.25s"/>
  <media:Retime rate="1.05" pitch="preserve"/>
</media:Transform>`,
        notes: [
          "At least one `Trim` or `Retime` child is required, and children run in the order they are written.",
          "`Trim` cannot combine `end` and `tail`, and both children are written empty.",
          "Normalization and stream selection are explicit upstream operations rather than hidden Transform policy.",
        ],
      },
    },
    {
      name: "extract-audio", tag: "ExtractAudio", mode: "structured",
      outputs: [mediaPipelineTypes.audioExtractionRequest, artifactTypes.blob],
      vocabulary: {
        summary:
          "Extracts one audio stream from a BlobArtifact as a deterministic 48 kHz stereo PCM WAV Artifact.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the extraction request Record and the extracted audio this element publishes." },
          { name: "source", kind: "reference", required: true,
            accepts: [artifactTypes.blob],
            summary: "Selects the media Artifact this element extracts audio from." },
          { name: "audio", kind: "literal", required: true,
            summary: "Decides which audio stream is extracted: `default` or `stream:<index>`." },
        ],
        ports: [
          { name: "audio", type: artifactTypes.blob,
            summary: "The extracted WAV Artifact, addressed as `<id>.audio`." },
        ],
        example: '<media:ExtractAudio id="voice-reference" source={prepared.video} audio="default"/>',
        notes: [
          "The element accepts no children and no text content, and the output container, codec, sample rate and channel count are fixed.",
          "The result makes no SemanticTake, speaker or alignment claim, so it can feed a model reference port directly.",
        ],
      },
    },
    {
      name: "extract-frame", tag: "ExtractFrame", mode: "structured",
      outputs: [mediaPipelineTypes.frameExtractionRequest, artifactTypes.blob],
      vocabulary: {
        summary: "Extracts one still frame from a BlobArtifact as a PNG Artifact.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the extraction request Record and the extracted image this element publishes." },
          { name: "source", kind: "reference", required: true,
            accepts: [artifactTypes.blob],
            summary: "Selects the media Artifact this element extracts a frame from." },
          { name: "video", kind: "literal", required: true,
            summary: "Decides which moving-image stream the frame is taken from: `primary-moving` or `stream:<index>`." },
          { name: "at", kind: "literal", required: true,
            summary: "Decides which frame is taken: `first`, `last`, `frame:<index>` or `time:<seconds>`." },
        ],
        ports: [
          { name: "image", type: artifactTypes.blob,
            summary: "The extracted PNG Artifact, addressed as `<id>.image`." },
        ],
        example: '<media:ExtractFrame id="continuity" source={prepared.video} video="primary-moving" at="last"/>',
        notes: [
          "The element accepts no children and no text content, and the output format is fixed to PNG.",
          "`time:<seconds>` is written as a non-negative number with an optional `s`, such as `time:0.25s`.",
        ],
      },
    },
  ] as const;


export const mediaPipelineManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: mediaPipelineModuleRef.name,
  version: mediaPipelineModuleRef.version,
  dependencies: [
    artifactDependency,
    mediaDependency,
    speechDependency,
    programSpaceDependency,
    compositionDependency,
    { module: svsModuleRef },
  ],
  types: [
    {
      name: mediaPipelineTypes.selectionRequest.name,
    },
    {
      name: mediaPipelineTypes.audioProgramPlan.name,
    },
    {
      name: mediaPipelineTypes.transformProgram.name,
    },
    {
      name: mediaPipelineTypes.audioExtractionRequest.name,
    },
    {
      name: mediaPipelineTypes.frameExtractionRequest.name,
    },
    {
      name: mediaPipelineTypes.stillVideoRequest.name,
    },
    {
      name: mediaPipelineTypes.stillVideoLayout.name,
    },
  ],
  capabilities: [
    { name: mediaPipelineCapabilities.inspect.name, returns: mediaTypes.inspection },
    { name: mediaPipelineCapabilities.normalize.name, returns: mediaTypes.synchronized },
    { name: mediaPipelineCapabilities.transform.name, returns: artifactTypes.blob },
    { name: mediaPipelineCapabilities.extractAudio.name, returns: artifactTypes.blob },
    { name: mediaPipelineCapabilities.extractFrame.name, returns: artifactTypes.blob },
    { name: mediaPipelineCapabilities.renderStill.name, returns: artifactTypes.blob },
    { name: mediaPipelineCapabilities.projectSpeechEvidenceAudio.name, returns: speechTypes.evidenceAudio },
    { name: mediaPipelineCapabilities.renderAudio.name, returns: mediaTypes.timelineAudio },
    { name: mediaPipelineCapabilities.mux.name, returns: mediaTypes.muxed },
  ],
  producers: [
    {
      name: mediaPipelineProducers.inspect.name,
      inputs: [{ name: "source", type: artifactTypes.blob }],
      outputs: [],
      needs: [{
        name: "inspection",
        capability: mediaPipelineCapabilities.inspect,
        returns: mediaTypes.inspection,
      }],
    },
    {
      name: mediaPipelineProducers.select.name,
      inputs: [
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaPipelineTypes.selectionRequest },
      ],
      outputs: [{
        name: "selection",
        type: mediaTypes.streamSelection,
      }],
      needs: [],
    },
    {
      name: mediaPipelineProducers.normalize.name,
      inputs: [
        { name: "source", type: artifactTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "selection", type: mediaTypes.streamSelection },
        { name: "request", type: mediaPipelineTypes.selectionRequest },
      ],
      outputs: [],
      needs: [{
        name: "media",
        capability: mediaPipelineCapabilities.normalize,
        returns: mediaTypes.synchronized,
      }],
    },
    {
      name: mediaPipelineProducers.transform.name,
      inputs: [
        { name: "media", type: mediaTypes.synchronized },
        { name: "program", type: mediaPipelineTypes.transformProgram },
      ],
      outputs: [],
      needs: [{
        name: "video",
        capability: mediaPipelineCapabilities.transform,
        returns: artifactTypes.blob,
      }],
    },
    {
      name: mediaPipelineProducers.extractAudio.name,
      inputs: [
        { name: "source", type: artifactTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaPipelineTypes.audioExtractionRequest },
      ],
      outputs: [],
      needs: [{
        name: "audio",
        capability: mediaPipelineCapabilities.extractAudio,
        returns: artifactTypes.blob,
      }],
    },
    {
      name: mediaPipelineProducers.extractFrame.name,
      inputs: [
        { name: "source", type: artifactTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaPipelineTypes.frameExtractionRequest },
      ],
      outputs: [],
      needs: [{
        name: "image",
        capability: mediaPipelineCapabilities.extractFrame,
        returns: artifactTypes.blob,
      }],
    },
    {
      name: mediaPipelineProducers.clipTimeLayout.name,
      inputs: [],
      outputs: [{ name: "layout", type: mediaPipelineTypes.stillVideoLayout }],
      needs: [],
    },
    {
      name: mediaPipelineProducers.planStill.name,
      inputs: [
        { name: "duration", type: speechTypes.duration },
        { name: "clock", type: programSpaceTypes.clock },
        { name: "layout", type: mediaPipelineTypes.stillVideoLayout },
      ],
      outputs: [{ name: "request", type: mediaPipelineTypes.stillVideoRequest }],
      needs: [],
    },
    {
      name: mediaPipelineProducers.bindStill.name,
      inputs: [
        { name: "request", type: mediaPipelineTypes.stillVideoRequest },
        { name: "source", type: artifactTypes.blob },
      ],
      outputs: [{ name: "request", type: mediaPipelineTypes.stillVideoRequest }],
      needs: [],
    },
    {
      name: mediaPipelineProducers.renderStill.name,
      inputs: [
        { name: "request", type: mediaPipelineTypes.stillVideoRequest },
      ],
      outputs: [],
      needs: [{
        name: "video",
        capability: mediaPipelineCapabilities.renderStill,
        returns: artifactTypes.blob,
      }],
    },
    {
      name: mediaPipelineProducers.projectSpeechEvidenceAudio.name,
      inputs: [{ name: "media", type: mediaTypes.synchronized }],
      outputs: [],
      needs: [{
        name: "evidenceAudio",
        capability: mediaPipelineCapabilities.projectSpeechEvidenceAudio,
        returns: speechTypes.evidenceAudio,
      }],
    },
    {
      name: mediaPipelineProducers.planAudio.name,
      inputs: [
        { name: "composition", type: compositionTypes.composition },
        { name: "space", type: programSpaceTypes.programSpace },
      ],
      outputs: [{ name: "plan", type: mediaPipelineTypes.audioProgramPlan }],
      needs: [],
    },
    {
      name: mediaPipelineProducers.renderAudio.name,
      inputs: [{ name: "plan", type: mediaPipelineTypes.audioProgramPlan }],
      outputs: [],
      needs: [{
        name: "audio",
        capability: mediaPipelineCapabilities.renderAudio,
        returns: mediaTypes.timelineAudio,
      }],
    },
    {
      name: mediaPipelineProducers.renderAudioRange.name,
      inputs: [{ name: "plan", type: mediaPipelineTypes.audioProgramPlan }, { name: "range", type: mediaTypes.frameRange }],
      outputs: [],
      needs: [{
        name: "audio",
        capability: mediaPipelineCapabilities.renderAudio,
        returns: mediaTypes.timelineAudio,
      }],
    },
    {
      name: mediaPipelineProducers.mux.name,
      inputs: [
        { name: "visual", type: mediaTypes.renderedVisual },
        { name: "audio", type: mediaTypes.timelineAudio },
      ],
      outputs: [],
      needs: [{
        name: "media",
        capability: mediaPipelineCapabilities.mux,
        returns: mediaTypes.muxed,
      }],
    },
    {
      name: mediaPipelineProducers.projectMuxed.name,
      inputs: [{ name: "media", type: mediaTypes.muxed }],
      outputs: [{ name: "video", type: artifactTypes.blob }],
      needs: [],
    },
  ],
};
