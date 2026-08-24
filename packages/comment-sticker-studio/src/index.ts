import { commentStickerMarkupSurfaces } from "@hypit/comment-sticker";
import type { CommentStickerProgram } from "@hypit/comment-sticker";
import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft, StudioParameterDeclaration, StudioRecipeParameterDeclaration } from "@hypit/studio-adapter";
import { artifactPreview, childEntities, previewLayer, projectedWindowTimelineEdits, requiredSurfaceValue, temporalLineageFor, textLayer } from "@hypit/studio-adapter";

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

const commentRecipe: readonly StudioRecipeParameterDeclaration[] = (commentStickerMarkupSurfaces
  .find((surface) => surface.name === "style")?.vocabulary.attributes
  .find((attribute) => attribute.name === "recipe")?.recipe ?? []).map((property) => {
    const when = property.name.startsWith("enter") || property.name.startsWith("exit");
    const where = /(?:width|height|padding|offset|size|gap|stack)/u.test(property.name);
    return {
      name: property.name,
      group: when ? "when" : where ? "where" : "how",
      section: when ? "motion" : where ? "layout" : "appearance",
    };
  });

function projectComments(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = requiredSurfaceValue(context, "program") as CommentStickerProgram;
  const items = program.items.map((item) => ({
    id: item.id,
    subjectId: item.subjectId,
    startFrame: item.span.startFrame,
    endFrameExclusive: item.span.endFrameExclusive,
    stackOrder: item.style.stackingOrder,
  }));
  return childEntities(context, items, "comment-sticker", "standard").map((entity, index) => {
    const item = program.items[index];
    if (item === undefined) return entity;
    const temporal = temporalLineageFor(context, item.id, "window");
    return {
      ...entity,
      display: {
        title: entity.display.title,
        layers: [
          ...(item.avatar === undefined ? [] : [previewLayer(artifactPreview("image", item.avatar.digest), "contain", "decoration")]),
          textLayer(item.content.comment),
        ],
      },
      ...(temporal?.source.kind === "program" || temporal?.source.id === undefined
        ? {}
        : { markerId: temporal.source.id }),
      ...(temporal === undefined ? {} : { temporal }),
    };
  });
}

export const commentStickerStudioAdapters: readonly StudioAdapter[] = [
  {
    id: "track", role: "track",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/comment-sticker"] },
    family: "comment-sticker", tone: "orange", icon: "component",
    timelineEdits: projectedWindowTimelineEdits({ start: "start", end: "end", duration: "for" }),
    parameters: [
      { name: "frame", label: "Frame", writable: false, referenced: frameParameters },
      {
        name: "style", label: "Style", writable: false,
        recipe: { through: ["recipe"], parameters: commentRecipe },
      },
      { name: "comment", label: "Comment", writable: true },
      { name: "author", label: "Author", writable: true },
      { name: "header", label: "Header", writable: true },
      { name: "meta", label: "Meta", writable: true },
      { name: "avatar", label: "Avatar", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "for", label: "For", writable: true },
    ],
    requiredValues: ["program"], project: projectComments,
    poster: { source: "surface-preview" },
    lane: { heightPx: 52 },
  },
];
