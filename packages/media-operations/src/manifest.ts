import { blobDependency } from "@hypit/hypit/blob";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { timelineDependency, timelineTypes } from "@hypit/timeline";
import { recipeModuleRef, recipeType } from "@hypit/hypit/recipe";
import { compositionDependency, compositionTypes, audioSampleSpanSchema, audioGainEnvelopeSchema } from "@hypit/composition";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { blobTypes } from "@hypit/hypit/blob";
import { blobRefSchema } from "@hypit/hypit/protocol";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const mediaOperationsModuleRef = { name: "@hypit/media-operations", version: "1" } as const;
export const mediaOperationsTypes = {
  selectionRequest: { module: mediaOperationsModuleRef, name: "MediaSelectionRequest" },
  audioProgram: { module: mediaOperationsModuleRef, name: "AudioProgram" },
  transformProgram: { module: mediaOperationsModuleRef, name: "MediaTransformProgram" },
  audioExtractionRequest: { module: mediaOperationsModuleRef, name: "AudioExtractionRequest" },
  frameExtractionRequest: { module: mediaOperationsModuleRef, name: "FrameExtractionRequest" },
  stillVideoRequest: { module: mediaOperationsModuleRef, name: "StillVideoRequest" },
  stillVideoLayout: { module: mediaOperationsModuleRef, name: "StillVideoLayout" },
} satisfies Record<string, TypeRef>;
export const mediaOperationsCapabilities = {
  inspect: { module: mediaOperationsModuleRef, name: "inspect-media" },
  normalize: { module: mediaOperationsModuleRef, name: "normalize-media" },
  transform: { module: mediaOperationsModuleRef, name: "transform-media" },
  extractAudio: { module: mediaOperationsModuleRef, name: "extract-media-audio" },
  extractFrame: { module: mediaOperationsModuleRef, name: "extract-media-frame" },
  renderStill: { module: mediaOperationsModuleRef, name: "render-still-video" },
  renderAudio: { module: mediaOperationsModuleRef, name: "render-timeline-audio" },
  mux: { module: mediaOperationsModuleRef, name: "mux-program-media" },
} satisfies Record<string, CapabilityRef>;
export const mediaOperationsProducers = {
  inspect: { module: mediaOperationsModuleRef, name: "request-media-inspection" },
  select: { module: mediaOperationsModuleRef, name: "select-media-streams" },
  normalize: { module: mediaOperationsModuleRef, name: "request-media-normalization" },
  transform: { module: mediaOperationsModuleRef, name: "request-media-transform" },
  extractAudio: { module: mediaOperationsModuleRef, name: "request-audio-extraction" },
  extractFrame: { module: mediaOperationsModuleRef, name: "request-frame-extraction" },
  planStill: { module: mediaOperationsModuleRef, name: "plan-still-video" },
  renderStill: { module: mediaOperationsModuleRef, name: "request-still-video" },
  bindStill: { module: mediaOperationsModuleRef, name: "bind-still-video-source" },
  compileAudio: { module: mediaOperationsModuleRef, name: "compile-audio-program" },
  renderAudio: { module: mediaOperationsModuleRef, name: "request-audio-render" },
  renderAudioRange: { module: mediaOperationsModuleRef, name: "request-audio-range" },
  mux: { module: mediaOperationsModuleRef, name: "request-media-mux" },
  projectMuxed: { module: mediaOperationsModuleRef, name: "project-muxed-media" },
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
        source: { optional: true, schema: blobRefSchema() },
      },
    } } },
  },
};

export const stillVideoLayoutSchema: ValueSchema = {
  kind: "object",
  fields: {
    weights: { schema: { kind: "array", items: { kind: "number", minimum: 0 } } },
  },
};

const audioBlobRefSchema = blobRefSchema(["audio/wav"]);

export const audioProgramSchema: ValueSchema = {
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
        artifact: { schema: audioBlobRefSchema },
        targetStartSample: { schema: integer },
        targetEndSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
        sourceSampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
        sourceStartSample: { schema: integer },
        sourceEndSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
        sourceLoop: { schema: { kind: "boolean" } },
        sourcePhaseSample: { schema: integer },
        playbackRate: { schema: { kind: "number" } },
        mixStartSample: { schema: integer },
        mixEndSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
        gain: { schema: { kind: "number", minimum: 0 } },
        fadeInSamples: { schema: integer },
        fadeOutSamples: { schema: integer },
        gainEnvelope: { schema: audioGainEnvelopeSchema, optional: true },
        audibility: { schema: { kind: "array", items: audioSampleSpanSchema }, optional: true },
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

export const mediaOperationsMarkupSurfaces = [
    {
      name: "synchronized-media", tag: "Normalize", mode: "structured",
      outputs: [mediaOperationsTypes.selectionRequest, mediaTypes.domainSpec, mediaTypes.synchronized,
        temporalTypes.localDomain, temporalTypes.extent],
      vocabulary: {
        summary:
          "Inspects one Blob, selects its video and audio streams and normalizes them into SynchronizedMedia on one frame domain.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the selection Record and the normalized media this element publishes." },
          { name: "source", kind: "reference", required: true,
            accepts: [blobTypes.blob],
            summary: "Selects the media Artifact this element inspects and normalizes." },
          { name: "recipe", kind: "reference", required: false, accepts: [recipeType],
            summary: "Selects a Recipe containing video, audio and span-authority stream policy." },
          { name: "video", kind: "literal", required: false,
            summary: "Decides which moving-image stream is carried: `primary-moving`, `none`, or `stream:<index>`." },
          { name: "audio", kind: "literal", required: false,
            summary: "Decides which audio stream is carried: `default`, `none`, or `stream:<index>`." },
          { name: "span-authority", kind: "literal", required: false,
            values: ["video", "audio"],
            summary: "Decides which selected stream defines the extent the other is trimmed or padded to." },
          { name: "clock", kind: "reference", required: true, accepts: [timelineTypes.clock],
            summary: "Selects the authored frame clock shared with the programme." },
        ],
        ports: [
          { name: "media", type: mediaTypes.synchronized,
            summary: "The normalized SynchronizedMedia, addressed as `<id>.media`." },
          { name: "domain", type: temporalTypes.localDomain,
            summary: "Its source-local frame domain, addressed as `<id>.domain`." },
          { name: "extent", type: temporalTypes.extent,
            summary: "Its unpositioned normalized length, addressed as `<id>.extent`." },
        ],
        example: `<mediaop:Normalize id="music-media" source={music}
  recipe={recipes.media.audio} clock={clock}/>`,
        notes: [
          "Write exactly one of recipe or the direct video/audio/span-authority attributes. Clock is always an explicit reference.",
          "`primary-moving` excludes attached-picture streams, prefers one declared default and fails closed on an ambiguous container; `stream:<index>` is for a container the author genuinely knows.",
          "Selecting embedded audio is a media fact only and makes no speaker or alignment claim.",
        ],
      },
    },
    {
      name: "still-video", tag: "StillVideo", mode: "structured",
      outputs: [temporalTypes.duration, mediaOperationsTypes.stillVideoLayout, mediaOperationsTypes.stillVideoRequest, blobTypes.blob],
      vocabulary: {
        summary: "Spreads one or more authored images over an explicit duration as an ordinary video-only MP4 Blob on a frame clock.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the still-video operation and the MP4 Artifact it publishes." },
          { name: "source", kind: "reference", required: false, accepts: [blobTypes.blob],
            summary: "Selects the one authored image held for the full video; write Still children instead for several images." },
          { name: "duration", kind: "literal", required: true,
            summary: "Sets the video's exact temporal length, such as 6s or 150f; it must resolve to a whole frame on the selected clock." },
          { name: "clock", kind: "reference", required: true, accepts: [timelineTypes.clock],
            summary: "Selects the frame clock used by the generated MP4." },
        ],
        children: [
          { tag: "Still", cardinality: "many",
            summary: "One image in authored order; the duration is divided among the Still children by weight, equally unless weights say otherwise.",
            attributes: [
              { name: "source", kind: "reference", required: true, accepts: [blobTypes.blob],
                summary: "Selects the authored image whose first decoded frame is held for this share." },
              { name: "weight", kind: "literal", required: false,
                summary: "Sets this image's share of the duration relative to its siblings, such as 2; every Still weighs 1 unless written." },
            ] },
        ],
        ports: [{ name: "video", type: blobTypes.blob,
          summary: "The ordinary video-only MP4 Artifact, addressed as `<id>.video`." }],
        example: `<mediaop:StillVideo id="kitchen-stills" duration="6s" clock={clock}>
  <mediaop:Still source={counter}/>
  <mediaop:Still source={basil} weight="2"/>
  <mediaop:Still source={board}/>
</mediaop:StillVideo>`,
        notes: [
          "Write exactly one of source or Still children. Frames are whole: each image gets the floor of its share and the leftover frames go to the largest remainders, so the split is deterministic and every image holds at least one frame.",
          "Images of different sizes are fitted into the first image's frame, letterboxed on black.",
          "The result is a normal video Blob, not SynchronizedMedia or semantic evidence.",
          "Use Normalize afterward exactly as for generated or imported moving video.",
          "Encoding is a render-still-video Need fulfilled by the selected media Provider; this Surface never invokes FFmpeg itself.",
        ],
      },
    },
    {
      name: "transform-media", tag: "Transform", mode: "structured",
      outputs: [mediaOperationsTypes.transformProgram, blobTypes.blob],
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
            summary: "Changes tempo by `rate` in the range (0, 100] while preserving pitch.",
            attributes: [
              { name: "rate", kind: "literal", required: true,
                summary: "Decides the playback speed multiplier, above `0` and at most `100`." },
            ] },
        ],
        ports: [
          { name: "video", type: blobTypes.blob,
            summary: "The transformed media Artifact, addressed as `<id>.video`." },
        ],
        example: `<mediaop:Transform id="prepared" source={shot-media.media}>
  <mediaop:Trim tail="0.25s"/>
  <mediaop:Retime rate="1.05"/>
</mediaop:Transform>`,
        notes: [
          "At least one `Trim` or `Retime` child is required, and children run in the order they are written.",
          "`Trim` cannot combine `end` and `tail`, and both children are written empty.",
          "Normalization and stream selection are explicit upstream operations rather than hidden Transform policy.",
        ],
      },
    },
    {
      name: "extract-audio", tag: "ExtractAudio", mode: "structured",
      outputs: [mediaOperationsTypes.audioExtractionRequest, blobTypes.blob],
      vocabulary: {
        summary:
          "Extracts one audio stream from a Blob as a deterministic 48 kHz stereo PCM WAV Artifact.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the extraction request Record and the extracted audio this element publishes." },
          { name: "source", kind: "reference", required: true,
            accepts: [blobTypes.blob],
            summary: "Selects the media Artifact this element extracts audio from." },
          { name: "audio", kind: "literal", required: true,
            summary: "Decides which audio stream is extracted: `default` or `stream:<index>`." },
        ],
        ports: [
          { name: "audio", type: blobTypes.blob,
            summary: "The extracted WAV Artifact, addressed as `<id>.audio`." },
        ],
        example: '<mediaop:ExtractAudio id="voice-reference" source={prepared.video} audio="default"/>',
        notes: [
          "The element accepts no children and no text content, and the output container, codec, sample rate and channel count are fixed.",
          "The result makes no speaker or alignment claim, so it can feed a model reference port directly.",
        ],
      },
    },
    {
      name: "extract-frame", tag: "ExtractFrame", mode: "structured",
      outputs: [mediaOperationsTypes.frameExtractionRequest, blobTypes.blob],
      vocabulary: {
        summary: "Extracts one still frame from a Blob as a PNG Artifact.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the extraction request Record and the extracted image this element publishes." },
          { name: "source", kind: "reference", required: true,
            accepts: [blobTypes.blob],
            summary: "Selects the media Artifact this element extracts a frame from." },
          { name: "video", kind: "literal", required: true,
            summary: "Decides which moving-image stream the frame is taken from: `primary-moving` or `stream:<index>`." },
          { name: "at", kind: "literal", required: true,
            summary: "Decides which frame is taken: `first`, `last`, `frame:<index>` or `time:<seconds>`." },
        ],
        ports: [
          { name: "image", type: blobTypes.blob,
            summary: "The extracted PNG Artifact, addressed as `<id>.image`." },
        ],
        example: '<mediaop:ExtractFrame id="continuity" source={prepared.video} video="primary-moving" at="last"/>',
        notes: [
          "The element accepts no children and no text content, and the output format is fixed to PNG.",
          "`time:<seconds>` is written as a non-negative number with an optional `s`, such as `time:0.25s`.",
        ],
      },
    },
  ] as const;


export const mediaOperationsManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: mediaOperationsModuleRef.name,
  version: mediaOperationsModuleRef.version,
  dependencies: [
    blobDependency,
    mediaDependency,
    timelineDependency,
    compositionDependency,
    temporalDependency,
    recipeModuleRef,
  ],
  types: [
    mediaOperationsTypes.selectionRequest.name,
    mediaOperationsTypes.audioProgram.name,
    mediaOperationsTypes.transformProgram.name,
    mediaOperationsTypes.audioExtractionRequest.name,
    mediaOperationsTypes.frameExtractionRequest.name,
    mediaOperationsTypes.stillVideoRequest.name,
    mediaOperationsTypes.stillVideoLayout.name,
  ],
  capabilities: [
    { name: mediaOperationsCapabilities.inspect.name, returns: mediaTypes.inspection },
    { name: mediaOperationsCapabilities.normalize.name, returns: mediaTypes.synchronized },
    { name: mediaOperationsCapabilities.transform.name, returns: blobTypes.blob },
    { name: mediaOperationsCapabilities.extractAudio.name, returns: blobTypes.blob },
    { name: mediaOperationsCapabilities.extractFrame.name, returns: blobTypes.blob },
    { name: mediaOperationsCapabilities.renderStill.name, returns: blobTypes.blob },
    { name: mediaOperationsCapabilities.renderAudio.name, returns: mediaTypes.timelineAudio },
    { name: mediaOperationsCapabilities.mux.name, returns: mediaTypes.muxed },
  ],
  producers: [
    {
      name: mediaOperationsProducers.inspect.name,
      inputs: [{ name: "source", type: blobTypes.blob }],
      result: { kind: "need" as const, name: "inspection", capability: mediaOperationsCapabilities.inspect },
    },
    {
      name: mediaOperationsProducers.select.name,
      inputs: [
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaOperationsTypes.selectionRequest },
      ],
      result: { kind: "output" as const, name: "selection", type: mediaTypes.streamSelection },
    },
    {
      name: mediaOperationsProducers.normalize.name,
      inputs: [
        { name: "source", type: blobTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "selection", type: mediaTypes.streamSelection },
        { name: "request", type: mediaOperationsTypes.selectionRequest },
      ],
      result: { kind: "need" as const, name: "media", capability: mediaOperationsCapabilities.normalize },
    },
    {
      name: mediaOperationsProducers.transform.name,
      inputs: [
        { name: "media", type: mediaTypes.synchronized },
        { name: "program", type: mediaOperationsTypes.transformProgram },
      ],
      result: { kind: "need" as const, name: "video", capability: mediaOperationsCapabilities.transform },
    },
    {
      name: mediaOperationsProducers.extractAudio.name,
      inputs: [
        { name: "source", type: blobTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaOperationsTypes.audioExtractionRequest },
      ],
      result: { kind: "need" as const, name: "audio", capability: mediaOperationsCapabilities.extractAudio },
    },
    {
      name: mediaOperationsProducers.extractFrame.name,
      inputs: [
        { name: "source", type: blobTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaOperationsTypes.frameExtractionRequest },
      ],
      result: { kind: "need" as const, name: "image", capability: mediaOperationsCapabilities.extractFrame },
    },
    {
      name: mediaOperationsProducers.planStill.name,
      inputs: [
        { name: "duration", type: temporalTypes.duration },
        { name: "clock", type: timelineTypes.clock },
        { name: "layout", type: mediaOperationsTypes.stillVideoLayout },
      ],
      result: { kind: "output" as const, name: "request", type: mediaOperationsTypes.stillVideoRequest },
    },
    {
      name: mediaOperationsProducers.bindStill.name,
      inputs: [
        { name: "request", type: mediaOperationsTypes.stillVideoRequest },
        { name: "source", type: blobTypes.blob },
      ],
      result: { kind: "output" as const, name: "request", type: mediaOperationsTypes.stillVideoRequest },
    },
    {
      name: mediaOperationsProducers.renderStill.name,
      inputs: [
        { name: "request", type: mediaOperationsTypes.stillVideoRequest },
      ],
      result: { kind: "need" as const, name: "video", capability: mediaOperationsCapabilities.renderStill },
    },
    {
      name: mediaOperationsProducers.compileAudio.name,
      inputs: [
        { name: "composition", type: compositionTypes.composition },
        { name: "timeline", type: timelineTypes.timeline },
      ],
      result: { kind: "output" as const, name: "program", type: mediaOperationsTypes.audioProgram },
    },
    {
      name: mediaOperationsProducers.renderAudio.name,
      inputs: [{ name: "program", type: mediaOperationsTypes.audioProgram }],
      result: { kind: "need" as const, name: "audio", capability: mediaOperationsCapabilities.renderAudio },
    },
    {
      name: mediaOperationsProducers.renderAudioRange.name,
      inputs: [{ name: "program", type: mediaOperationsTypes.audioProgram }, { name: "range", type: mediaTypes.frameRange }],
      result: { kind: "need" as const, name: "audio", capability: mediaOperationsCapabilities.renderAudio },
    },
    {
      name: mediaOperationsProducers.mux.name,
      inputs: [
        { name: "visual", type: mediaTypes.timelineVisual },
        { name: "audio", type: mediaTypes.timelineAudio },
      ],
      result: { kind: "need" as const, name: "media", capability: mediaOperationsCapabilities.mux },
    },
    {
      name: mediaOperationsProducers.projectMuxed.name,
      inputs: [{ name: "media", type: mediaTypes.muxed }],
      result: { kind: "output" as const, name: "video", type: blobTypes.blob },
    },
  ],
};
