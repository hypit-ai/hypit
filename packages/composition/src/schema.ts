import { compositableSurfaceSchema, fontArtifactSchema, mediaArtifactSchema, mediaDependency } from "@narratage/media";
import { programSpaceDependency } from "@narratage/program-space";
import type { ValueSchema } from "@narratage/protocol";
import { VISUAL_IR_V1, VISUAL_STYLE_ENUM_VALUES_V1, VISUAL_STYLE_NAMES_V1 } from "@narratage/visual-ir";
export { mediaDependency, programSpaceDependency };
const string = { kind: "string", minLength: 1 } as const; const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const; const signedInteger = { kind: "number", integer: true } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const audioBlobRef = object({
  kind: { schema: { kind: "literal", value: "blob" } },
  digest: { schema: { kind: "string", minLength: 71, maxLength: 71 } },
  size: { schema: integer },
  mediaType: { schema: { kind: "literal", value: "audio/wav" } },
});
const styleDeclaration: ValueSchema = { kind: "oneOf", variants: VISUAL_STYLE_NAMES_V1.map((name) => object({
  name: { schema: { kind: "literal", value: name } }, value: { schema: Object.hasOwn(VISUAL_STYLE_ENUM_VALUES_V1, name)
    ? { kind: "string", enum: VISUAL_STYLE_ENUM_VALUES_V1[name as keyof typeof VISUAL_STYLE_ENUM_VALUES_V1] }
    : { kind: "oneOf", variants: [{ kind: "string" }, { kind: "number" }] } },
})) };
const attribute = object({ name: { schema: string }, value: { schema: { kind: "string" } } });
const keyframe = object({ atFrame: { schema: integer }, easing: { schema: { kind: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] }, optional: true }, style: { schema: { kind: "array", minItems: 1, items: styleDeclaration } } });
const animation = object({ keyframes: { schema: { kind: "array", minItems: 2, items: keyframe } } });
const base = { id: { schema: string }, parent: { schema: string, optional: true }, order: { schema: integer }, style: { schema: { kind: "array", items: styleDeclaration } }, attributes: { schema: { kind: "array", items: attribute }, optional: true }, animation: { schema: animation, optional: true } } as const;
const box = object({ ...base, kind: { schema: { kind: "literal", value: "box" } } });
const text = object({ ...base, kind: { schema: { kind: "literal", value: "text" } }, text: { schema: { kind: "string" } }, fonts: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema }, optional: true } });
const media = (kind: "image" | "video") => object({ ...base, kind: { schema: { kind: "literal", value: kind } }, artifact: { schema: mediaArtifactSchema }, mediaStartSec: { schema: number, optional: true }, playbackRate: { schema: number, optional: true }, loop: { schema: { kind: "boolean" }, optional: true }, muted: { schema: { kind: "boolean" }, optional: true } });
const surface = object({ ...base, kind: { schema: { kind: "literal", value: "surface" } }, surface: { schema: compositableSurfaceSchema } });
const element: ValueSchema = { kind: "oneOf", variants: [box, text, media("image"), media("video"), surface] };
const span = object({ startFrame: { schema: integer }, endFrameExclusive: { schema: integer } });
const present = object({ id: { schema: string }, span: { schema: span }, stacking: { schema: object({ order: { schema: signedInteger }, tieBreak: { schema: string } }) }, elements: { schema: { kind: "array", minItems: 1, items: element } } });
export const visualTrackSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.visual-track@1" } }, visualIr: { schema: { kind: "literal", value: VISUAL_IR_V1 } }, id: { schema: string }, presents: { schema: { kind: "array", items: present } } });
const audioSampleSpan = object({ startSample: { schema: integer }, endSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } } });
const audioClip = object({
  id: { schema: string },
  artifact: { schema: audioBlobRef },
  target: { schema: audioSampleSpan },
  source: { schema: object({
    sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
    startSample: { schema: integer },
    endSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
    loop: { schema: { kind: "boolean" } },
    phaseSample: { schema: integer },
  }) },
  playbackRate: { schema: { kind: "number", minimum: 0.000001, maximum: 100 } },
  pitch: { schema: { kind: "literal", value: "preserve" } },
  gain: { schema: { kind: "number", minimum: 0, maximum: 64 } },
  fadeInSamples: { schema: integer },
  fadeOutSamples: { schema: integer },
});
export const audioTrackSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.audio-track@1" } }, id: { schema: string }, clips: { schema: { kind: "array", items: audioClip } } });
export const compositionSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.composition@1" } }, id: { schema: string }, canvas: { schema: object({ width: { schema: integer }, height: { schema: integer }, clearColor: { schema: string } }) }, tracks: { schema: { kind: "array", items: { kind: "oneOf", variants: [visualTrackSchema, audioTrackSchema] } } } });
