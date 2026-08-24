import { readFile } from "node:fs/promises";

import { artifactDependency, artifactTypes } from "@hypit/artifact";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { fontArtifactSchema, mediaDependency, mediaTypes } from "@hypit/media";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { semanticTrackDependency, semanticTrackTypes } from "@hypit/semantic-track";
import { spatialDependency, spatialFrameSchema, spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { textDependency, textTypes } from "@hypit/text";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const commentStickerModuleRef = { name: "@hypit/comment-sticker", version: "1" } as const;

export const commentStickerTypes = {
  header: { module: commentStickerModuleRef, name: "CommentStickerHeader" },
  style: { module: commentStickerModuleRef, name: "CommentStickerStyle" },
  itemSpec: { module: commentStickerModuleRef, name: "CommentStickerItemSpec" },
  content: { module: commentStickerModuleRef, name: "CommentStickerContent" },
  set: { module: commentStickerModuleRef, name: "CommentStickerSet" },
  program: { module: commentStickerModuleRef, name: "CommentStickerProgram" },
} satisfies Record<string, TypeRef>;

export const commentStickerProducers = {
  createSet: { module: commentStickerModuleRef, name: "create-comment-sticker-set" },
  appendItem: { module: commentStickerModuleRef, name: "append-comment-sticker" },
  appendItemAvatar: { module: commentStickerModuleRef, name: "append-comment-sticker-with-avatar" },
  finalize: { module: commentStickerModuleRef, name: "finalize-comment-sticker" },
  render: { module: commentStickerModuleRef, name: "render-comment-sticker" },
  createContent: { module: commentStickerModuleRef, name: "create-comment-sticker-content" },
  setContentAuthor: { module: commentStickerModuleRef, name: "set-comment-sticker-content-author" },
  setContentHeader: { module: commentStickerModuleRef, name: "set-comment-sticker-content-header" },
  setContentMeta: { module: commentStickerModuleRef, name: "set-comment-sticker-content-meta" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const nonNegative = { kind: "number", minimum: 0 } as const;
const positive = { kind: "number", minimum: 0.000001 } as const;
const integer = { kind: "number", integer: true } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const enumString = (values: readonly string[]): ValueSchema => ({ kind: "string", enum: values });
const blobRef = object({
  kind: { schema: { kind: "literal", value: "blob" } },
  digest: { schema: { kind: "string", minLength: 71, maxLength: 71 } },
  size: { schema: unsignedInteger },
  mediaType: { schema: string },
});
const duration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: integer }, denominator: { schema: positiveInteger } }),
] };
const textStyle = object({
  fonts: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema } },
  sizePx: { schema: positive }, weight: { schema: positiveInteger }, lineHeight: { schema: positive }, color: { schema: string },
});
const style = object({

  id: { schema: string }, stackingOrder: { schema: integer },
  card: { schema: object({
    background: { schema: string }, borderColor: { schema: string }, borderWidthPx: { schema: nonNegative },
    radiusPx: { schema: nonNegative }, paddingXPx: { schema: nonNegative }, paddingYPx: { schema: nonNegative },
    gapPx: { schema: nonNegative }, rotationDeg: { schema: number },
    shadow: { schema: object({ color: { schema: string }, offsetX: { schema: number }, offsetY: { schema: number }, blurPx: { schema: nonNegative }, spreadPx: { schema: number } }) },
    tail: { schema: object({ enabled: { schema: { kind: "boolean" } }, widthPx: { schema: nonNegative }, heightPx: { schema: nonNegative }, offsetXPx: { schema: nonNegative } }) },
  }) },
  avatar: { schema: object({
    fallback: { schema: enumString(["none", "initial"]) }, sizePx: { schema: positive }, borderWidthPx: { schema: nonNegative },
    borderColor: { schema: string }, background: { schema: string }, textColor: { schema: string },
  }) },
  header: { schema: textStyle },
  body: { schema: object({
    fonts: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema } },
    sizePx: { schema: positive }, weight: { schema: positiveInteger }, lineHeight: { schema: positive }, color: { schema: string },
    maxLines: { schema: positiveInteger },
  }) },
  meta: { schema: textStyle },
  motion: { schema: object({
    enter: { schema: object({
      kind: { schema: enumString(["none", "fade", "pop", "slide-pop"]) }, durationFrames: { schema: unsignedInteger },
      offsetYPx: { schema: number }, startScale: { schema: positive }, rotationDeltaDeg: { schema: number },
      easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out", "out-back"]) },
    }) },
    exit: { schema: object({
      kind: { schema: enumString(["none", "fade", "fade-up"]) }, durationFrames: { schema: unsignedInteger },
      offsetYPx: { schema: number }, easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]) },
    }) },
    hold: { schema: object({
      kind: { schema: enumString(["none", "float"]) }, amplitudeYPx: { schema: nonNegative },
      rotationAmplitudeDeg: { schema: nonNegative }, periodFrames: { schema: positiveInteger },
    }) },
  }) },
});
const content = object({

  comment: { schema: string }, author: { schema: string, optional: true },
  header: { schema: string, optional: true }, meta: { schema: string, optional: true },
});
const itemSpec = object({

  id: { schema: string },
});
const frameSpan = object({ startFrame: { schema: unsignedInteger }, endFrameExclusive: { schema: positiveInteger } });
const item = object({
  id: { schema: string }, span: { schema: frameSpan },
  frame: { schema: spatialFrameSchema }, style: { schema: style }, content: { schema: content },
  avatar: { schema: blobRef, optional: true }, tieBreak: { schema: string },
});

export const commentStickerHeaderSchema: ValueSchema = object({
  id: { schema: string },
});
export const commentStickerStyleSchema: ValueSchema = style;
export const commentStickerItemSpecSchema: ValueSchema = itemSpec;
export const commentStickerSetSchema: ValueSchema = object({
  items: { schema: { kind: "array", items: item } },
});
export const commentStickerProgramSchema: ValueSchema = object({
  id: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: item } },
});
const appendInputs = [
  { name: "set", type: commentStickerTypes.set }, { name: "header", type: commentStickerTypes.header },
  { name: "frame", type: spatialTypes.frame }, { name: "style", type: commentStickerTypes.style },
  { name: "semantic", type: semanticTrackTypes.track }, { name: "spec", type: commentStickerTypes.itemSpec },
  { name: "content", type: commentStickerTypes.content }, { name: "window", type: temporalTypes.window },
] as const;

export const commentStickerMarkupSurfaces = [
    { name: "style", tag: "Style", mode: "structured", outputs: [commentStickerTypes.style],
      vocabulary: {
        summary: "Reads one SVS Recipe and one exact Font Stack into a comment card Style that Stickers share.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the Style so a Sticker can reference it." },
          { name: "recipe", kind: "reference", required: true, accepts: [svsRecipeType],
            summary: "Chooses the Recipe that decides the card's appearance and its enter, hold and exit motion.",
            recipe: [
              { name: "stack-order", required: false, fallback: "62",
                summary: "Sets the stacking order every card drawn in this Style takes among the Program's visual Tracks." },
              { name: "background", required: false, fallback: "#ffffff",
                summary: "Fills the card body, and the tail that hangs beneath it." },
              { name: "border-color", required: false, fallback: "#0000000e",
                summary: "Colors the hairline drawn around the card body." },
              { name: "border-width", required: false, fallback: "1",
                summary: "Sets the thickness of that hairline in pixels." },
              { name: "radius", required: false, fallback: "28",
                summary: "Rounds the card's corners in pixels." },
              { name: "padding-x", required: false, fallback: "28",
                summary: "Insets the avatar and the text column from the card's left and right edges in pixels." },
              { name: "padding-y", required: false, fallback: "24",
                summary: "Insets the header row from the card's top edge and the metadata row from its bottom edge in pixels." },
              { name: "gap", required: false, fallback: "18",
                summary: "Sets the space in pixels between the avatar and the text column, and scales the smaller gaps that separate the header, body and metadata rows." },
              { name: "rotation", required: false, fallback: "-2.5",
                summary: "Tilts the whole card in degrees about its center, before any motion is added." },
              { name: "shadow-color", required: false, fallback: "#0000004d",
                summary: "Colors the shadow cast by the card body." },
              { name: "shadow-x", required: false, fallback: "0",
                summary: "Offsets that shadow horizontally in pixels." },
              { name: "shadow-y", required: false, fallback: "18",
                summary: "Offsets that shadow vertically in pixels." },
              { name: "shadow-blur", required: false, fallback: "46",
                summary: "Sets the shadow's blur radius in pixels." },
              { name: "shadow-spread", required: false, fallback: "0",
                summary: "Grows or shrinks the shadow beyond the card's outline in pixels." },
              { name: "tail", required: false, fallback: "true",
                summary: "Decides whether the card carries a speech tail below its bottom edge." },
              { name: "tail-width", required: false, fallback: "42",
                summary: "Sets the width of that tail in pixels." },
              { name: "tail-height", required: false, fallback: "28",
                summary: "Sets the height of that tail in pixels, which is taken out of the Frame's height before the card body is laid out." },
              { name: "tail-offset-x", required: false, fallback: "58",
                summary: "Places the tail's left edge that many pixels in from the card's left edge." },
              { name: "avatar-fallback", required: false, values: ["none", "initial"], fallback: "none",
                summary: "Decides what stands in for a missing avatar Artifact: nothing, or a disc bearing the author's first letter." },
              { name: "avatar-size", required: false, fallback: "58",
                summary: "Sets the avatar's diameter in pixels, which also narrows the text column beside it." },
              { name: "avatar-border-width", required: false, fallback: "3",
                summary: "Sets the thickness of the ring around the avatar in pixels." },
              { name: "avatar-border-color", required: false, fallback: "#ffffff",
                summary: "Colors that ring." },
              { name: "avatar-background", required: false, fallback: "#34313a",
                summary: "Fills the initial disc drawn when no avatar Artifact is supplied." },
              { name: "avatar-text-color", required: false, fallback: "#ffffff",
                summary: "Colors the letter on that disc." },
              { name: "header-size", required: false, fallback: "24",
                summary: "Sets the header row's type size in pixels." },
              { name: "header-weight", required: false, fallback: "680",
                summary: "Sets the header row's font weight." },
              { name: "header-line-height", required: false, fallback: "1.15",
                summary: "Sets the header row's line height as a multiple of its size, which also fixes the row's height." },
              { name: "header-color", required: false, fallback: "#8f8f8f",
                summary: "Colors the header row." },
              { name: "body-size", required: false, fallback: "42",
                summary: "Sets the comment copy's type size in pixels." },
              { name: "body-weight", required: false, fallback: "850",
                summary: "Sets the comment copy's font weight." },
              { name: "body-line-height", required: false, fallback: "1.16",
                summary: "Sets the comment copy's line height as a multiple of its size." },
              { name: "body-color", required: false, fallback: "#111111",
                summary: "Colors the comment copy." },
              { name: "body-max-lines", required: false, fallback: "3",
                summary: "Sets how many lines the comment copy wraps to before it is ellipsized." },
              { name: "meta-size", required: false, fallback: "21",
                summary: "Sets the metadata row's type size in pixels." },
              { name: "meta-weight", required: false, fallback: "650",
                summary: "Sets the metadata row's font weight." },
              { name: "meta-line-height", required: false, fallback: "1.15",
                summary: "Sets the metadata row's line height as a multiple of its size, which also fixes the row's height." },
              { name: "meta-color", required: false, fallback: "#8f8f8f",
                summary: "Colors the metadata row." },
              { name: "enter", required: false, values: ["none", "fade", "pop", "slide-pop"], fallback: "pop",
                summary: "Selects how the card arrives at the start of its window." },
              { name: "enter-frames", required: false, fallback: "17",
                summary: "Sets how many Frames the arrival takes." },
              { name: "enter-offset-y", required: false, fallback: "-180",
                summary: "Sets the vertical distance in pixels a `slide-pop` arrival travels from." },
              { name: "enter-start-scale", required: false, fallback: "0.78",
                summary: "Sets the scale a `pop` or `slide-pop` arrival grows from." },
              { name: "enter-rotation-delta", required: false, fallback: "-4.5",
                summary: "Sets the extra tilt in degrees a `pop` or `slide-pop` arrival unwinds from." },
              { name: "enter-easing", required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], fallback: "ease-out",
                summary: "Shapes the arrival's progress over its Frames." },
              { name: "exit", required: false, values: ["none", "fade", "fade-up"], fallback: "fade-up",
                summary: "Selects how the card leaves at the end of its window." },
              { name: "exit-frames", required: false, fallback: "20",
                summary: "Sets how many Frames the departure takes." },
              { name: "exit-offset-y", required: false, fallback: "-28",
                summary: "Sets the vertical distance in pixels a `fade-up` departure drifts." },
              { name: "exit-easing", required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], fallback: "ease-in",
                summary: "Shapes the departure's progress over its Frames." },
              { name: "hold", required: false, values: ["none", "float"], fallback: "float",
                summary: "Selects how the card behaves between its arrival and its departure." },
              { name: "hold-amplitude-y", required: false, fallback: "4",
                summary: "Sets how far in pixels a `float` hold rises and falls." },
              { name: "hold-rotation-amplitude", required: false, fallback: "0.35",
                summary: "Sets how far in degrees a `float` hold rocks either side of the card's tilt." },
              { name: "hold-period-frames", required: false, fallback: "84",
                summary: "Sets how many Frames one `float` cycle takes." },
            ],
          },
          { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontStack],
            summary: "Chooses the Font Stack the card's header, body and metadata rows are set in." },
        ],
        example: `<comment:Style id="social-comment" recipe={styles.comment} font={fonts.ui}/>`,
        notes: [
          "The element is empty; it accepts no children and no text.",
          "The Style is published as a Record under its own id.",
          "Every Recipe key has a default, so a Recipe states only what it changes.",
          "The Recipe refuses any property outside the set declared here.",
          "The Recipe owns appearance and local motion only; placement and size stay with the Sticker's Frame.",
        ],
      },
    },
    { name: "track", tag: "Track", mode: "structured", outputs: [textTypes.text, commentStickerTypes.header, commentStickerTypes.itemSpec, temporalTypes.windowSpec, commentStickerTypes.program, compositionTypes.visualTrack],
      vocabulary: {
        summary: "Places social comment cards over the Program and renders them as one self-contained VisualTrack.",
        appearance: "One rounded card per Sticker, tilted a couple of degrees and lifted on a soft drop shadow, drawn at the place and size its Frame gives it on the Canvas, with a small triangular speech tail hanging from the card's lower edge. Inside the card a circular avatar sits at the left — the supplied image Artifact, or a filled disc bearing the author's initial — and a text column runs beside it from top to bottom: a small faint header line such as `Reply to @viewer's comment`, then the comment copy in large heavy type wrapped to a few lines and ellipsized, then a small faint metadata row pinned to the card's bottom edge when one is supplied. Each card keeps its own window rather than a shared one: it pops in scaling up and unwinding its tilt, rises and rocks gently while it holds, then fades upward as it leaves. Cards are placed by their Frames alone, so several stand on screen at once and none reflows around another.",
        preview: previewImage("Track.png"),
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the Track and prefixes every binding it publishes." },
          { name: "canvas", kind: "reference", required: true, accepts: [spatialTypes.canvas],
            summary: "Chooses the Canvas the cards are laid out on." },
          { name: "semantic", kind: "reference", required: true, accepts: [semanticTrackTypes.track],
            summary: "Chooses the SemanticTrack that owns the Program frame domain and resolves every temporal binding." },
        ],
        children: [
          { tag: "Sticker", cardinality: "many",
            summary: "One comment card with its own copy, Frame, Style and temporal window.",
            attributes: [
              { name: "id", kind: "identifier", required: true,
                summary: "Names this card among the Track's items." },
              { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame],
                summary: "Chooses the Frame that places and sizes the card on the Canvas." },
              { name: "style", kind: "reference", required: true, accepts: [commentStickerTypes.style],
                summary: "Chooses the Comment Sticker Style the card is drawn and animated in." },
              { name: "comment", kind: "expression", required: false, accepts: [textTypes.text],
                summary: "Supplies the card's comment copy in place of the element's own text." },
              { name: "author", kind: "expression", required: false, accepts: [textTypes.text],
                summary: "Supplies the name the comment is attributed to." },
              { name: "header", kind: "expression", required: false, accepts: [textTypes.text],
                summary: "Supplies the card's header row." },
              { name: "meta", kind: "expression", required: false, accepts: [textTypes.text],
                summary: "Supplies the card's metadata row, which is not rendered when it is absent." },
              { name: "avatar", kind: "reference", required: false, accepts: [artifactTypes.blob],
                summary: "Supplies the image Artifact drawn as the commenter's avatar." },
              { name: "during", kind: "expression", required: false, values: ["program"], accepts: [narrativeTypes.selection],
                summary: "Spans the whole Program when written as `program`, or the referenced Selection." },
              { name: "at", kind: "reference", required: false, accepts: [narrativeTypes.moment],
                summary: "Opens the card's window at the referenced Moment's cue." },
              { name: "for", kind: "literal", required: false,
                summary: "Sets the length of a Moment window as an exact duration such as `48f`, `240ms` or `2.5s`." },
              { name: "start", kind: "literal", required: false,
                summary: "Opens the window at `program.start`, `program.end`, `selection.start`, `selection.end` or `moment.cue` with an optional `+` or `-` duration offset, or at a bare duration measured from the start of the Program." },
              { name: "end", kind: "literal", required: false,
                summary: "Closes the window at `program.start`, `program.end`, `selection.start`, `selection.end` or `moment.cue` with an optional `+` or `-` duration offset, or at a bare duration measured from the start of the Program." },
              { name: "selection", kind: "reference", required: false, accepts: [narrativeTypes.selection],
                summary: "Resolves `selection.start` and `selection.end` in an explicit start and end window." },
              { name: "moment", kind: "reference", required: false, accepts: [narrativeTypes.moment],
                summary: "Resolves `moment.cue` in an explicit start and end window." },
            ],
            text: "The card's comment copy, read when `comment` is absent.",
          },
        ],
        ports: [
          { name: "program", type: commentStickerTypes.program,
            summary: "Every placed card, finalized as one Comment Sticker Program." },
          { name: "track", type: compositionTypes.visualTrack,
            summary: "That Program rendered as one VisualTrack." },
        ],
        example: `
<comment:Track id="comments" canvas={vertical} semantic={speech.semantic}>
  <comment:Sticker id="one" frame={comment-frame} style={social} avatar={viewer-avatar}
    author="@viewer" meta="Featured" during={story.selection.reaction}>
    Wait, it pinned the caption to the word, not the second.
  </comment:Sticker>
</comment:Track>
        `,
        notes: [
          "A Track requires at least one Sticker.",
          "A Sticker states exactly one temporal form: `during`, `at` with `for`, or `start` with `end`.",
          "With `start` and `end`, `selection` or `moment` binds the point of reference; both together are refused.",
          "A Sticker's copy is either `comment` or the element's own text; stating both is refused, and one of the two is required.",
          "Stacking order comes from the Style's Recipe, so a Sticker has no `z`.",
        ],
      },
    },
  ] as const;


export const commentStickerManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: commentStickerModuleRef.name,
  version: commentStickerModuleRef.version,
  dependencies: [artifactDependency, narrativeDependency, semanticTrackDependency, spatialDependency, temporalDependency, mediaDependency, compositionDependency, textDependency],
  types: [
    { name: commentStickerTypes.header.name },
    { name: commentStickerTypes.style.name },
    { name: commentStickerTypes.itemSpec.name },
    { name: commentStickerTypes.content.name },
    { name: commentStickerTypes.set.name },
    { name: commentStickerTypes.program.name },
  ],
  capabilities: [],
  producers: [
    { name: commentStickerProducers.createContent.name, inputs: [{ name: "comment", type: textTypes.text }], outputs: [{ name: "content", type: commentStickerTypes.content }], needs: [] },
    ...([
      [commentStickerProducers.setContentAuthor, "author"],
      [commentStickerProducers.setContentHeader, "header"],
      [commentStickerProducers.setContentMeta, "meta"],
    ] as const).map(([producer, field]) => ({
      name: producer.name,
      inputs: [{ name: "content", type: commentStickerTypes.content }, { name: field, type: textTypes.text }],
      outputs: [{ name: "content", type: commentStickerTypes.content }], needs: [],
    })),
    { name: commentStickerProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: commentStickerTypes.set }], needs: [] },
    ...([
      [commentStickerProducers.appendItem, []],
      [commentStickerProducers.appendItemAvatar, [{ name: "avatar", type: artifactTypes.blob }]],
    ] as const).map(([producer, extra]) => ({
      name: producer.name,
      inputs: [...appendInputs, ...extra],
      outputs: [{ name: "set", type: commentStickerTypes.set }],
      needs: [],
    })),
    { name: commentStickerProducers.finalize.name, inputs: [{ name: "set", type: commentStickerTypes.set }, { name: "header", type: commentStickerTypes.header }], outputs: [{ name: "program", type: commentStickerTypes.program }], needs: [] },
    { name: commentStickerProducers.render.name, inputs: [{ name: "canvas", type: spatialTypes.canvas }, { name: "semantic", type: semanticTrackTypes.track }, { name: "program", type: commentStickerTypes.program }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
  ],
};

export const commentStickerDependency = { module: commentStickerModuleRef } as const;
