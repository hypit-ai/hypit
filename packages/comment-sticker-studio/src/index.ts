import { commentStickerMarkupSurfaces, commentStickerModuleRef, commentStickerTypes } from "@hypit/comment-sticker";
import type { CommentStickerProgram } from "@hypit/comment-sticker";
import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanion, StudioTrackCompanionContext, StudioEntityDraft, StudioInspectorFieldDeclaration, StudioSourceBindingDeclaration } from "@hypit/studio-adapter";
import { artifactPreview, childEntities, previewLayer, requiredSurfaceValue, temporalLineageFor, temporalSemanticSource, textLayer } from "@hypit/studio-adapter";

const frameParameters: readonly StudioSourceBindingDeclaration[] = [
  { name: "within" },
  ...["left", "top", "right", "bottom", "x", "y", "width", "height"].map((name) => ({ name, writable: true })),
];

const commentProperties = (commentStickerMarkupSurfaces
  .find((surface) => surface.name === "style")?.vocabulary.attributes
  .find((attribute) => attribute.name === "recipe")?.recipe ?? []);

function title(name: string): string {
  return name.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function valuesFor(property: typeof commentProperties[number]): readonly string[] | undefined {
  return "values" in property ? property.values : undefined;
}

type CommentPlacement = Pick<StudioInspectorFieldDeclaration, "domain" | "page" | "section">;

function commentPlace(domain: "where" | "how" | "when", page: string, section: string): CommentPlacement {
  const id = section.toLowerCase().replaceAll(" ", "-");
  return { domain, page: { id: page.toLowerCase(), label: page }, section: { id, label: section } };
}

const commentPlacement = new Map<string, CommentPlacement>();
function placeComment(names: readonly string[], domain: "where" | "how" | "when", page: string, section: string): void {
  for (const name of names) commentPlacement.set(name, commentPlace(domain, page, section));
}

placeComment(["stack-order"], "where", "Layout", "Stacking");
placeComment(["padding-x", "padding-y", "gap", "radius"], "where", "Layout", "Card");
placeComment(["tail-width", "tail-height", "tail-offset-x"], "where", "Layout", "Tail");
placeComment(["avatar-size", "avatar-border-width"], "where", "Layout", "Avatar");
placeComment([
  "header-size", "header-line-height", "body-size", "body-line-height", "body-max-lines", "meta-size", "meta-line-height",
], "where", "Layout", "Copy");
placeComment([
  "background", "border-color", "border-width", "rotation", "shadow-color", "shadow-x", "shadow-y", "shadow-blur",
  "shadow-spread", "tail", "avatar-fallback", "avatar-border-color", "avatar-background", "avatar-text-color",
], "how", "Appearance", "Card");
placeComment(["header-weight", "header-color", "body-weight", "body-color", "meta-weight", "meta-color"], "how", "Appearance", "Copy");
placeComment([
  "enter", "enter-frames", "enter-offset-y", "enter-start-scale", "enter-rotation-delta", "enter-easing",
], "when", "Motion", "Enter");
placeComment(["exit", "exit-frames", "exit-offset-y", "exit-easing"], "when", "Motion", "Exit");
placeComment(["hold", "hold-amplitude-y", "hold-rotation-amplitude", "hold-period-frames"], "when", "Motion", "Hold");

const commentColorProperties = new Set([
  "background", "border-color", "shadow-color", "avatar-border-color", "avatar-background", "avatar-text-color",
  "header-color", "body-color", "meta-color",
]);

const commentInspector: readonly StudioInspectorFieldDeclaration[] = commentProperties.map((property) => {
  const placement = commentPlacement.get(property.name);
  if (placement === undefined) throw new Error(`Comment Sticker Studio has no explicit Inspector declaration for ${property.name}.`);
  const options = valuesFor(property);
  return {
    binding: `style.${property.name}`, label: title(property.name), ...placement,
    ...(property.summary === undefined ? {} : { summary: property.summary }),
    control: options !== undefined ? "select" : commentColorProperties.has(property.name) ? "color" : "number",
    ...(options === undefined ? {} : { options }),
  };
});

function projectComments(context: StudioTrackCompanionContext): readonly StudioEntityDraft[] {
  const program = requiredSurfaceValue(context, "program") as CommentStickerProgram;
  const items = program.items.map((item) => ({
    id: item.id,
    subjectId: item.subjectId,
    startFrame: item.span.startFrame,
    endFrameExclusive: item.span.endFrameExclusive,
    stackOrder: item.style.stackingOrder,
    sourceTypes: [commentStickerTypes.itemSpec],
  }));
  return childEntities(context, items, "comment-sticker", "standard").map((entity, index) => {
    const item = program.items[index];
    if (item === undefined) return entity;
    const temporal = temporalLineageFor(context, item.id, "window");
    const semanticSource = temporalSemanticSource(temporal);
    return {
      ...entity,
      display: {
        title: entity.display.title,
        layers: [
          ...(item.avatar === undefined ? [] : [previewLayer(artifactPreview("image", item.avatar.digest), "contain", "decoration")]),
          textLayer(item.content.comment),
        ],
      },
      ...(semanticSource?.id === undefined
        ? {}
        : { markerId: semanticSource.id }),
      ...(temporal === undefined ? {} : { temporal }),
    };
  });
}

export const commentStickerStudioTrackCompanions: readonly StudioTrackCompanion[] = [
  {
    id: "track", role: "track",
    output: { type: compositionTypes.visualTrack, surface: "track", modules: [commentStickerModuleRef] },
    family: "comment-sticker", tone: "orange", icon: "component",
    bindings: [
      { name: "frame", referenced: frameParameters },
      {
        name: "style",
        recipe: { through: ["recipe"], bindings: commentProperties.map(({ name }) => ({ name })) },
      },
      ...["comment", "author", "header", "meta"].map((name) => ({ name, writable: true })),
      { name: "avatar" },
    ],
    inspector: [
      ...frameParameters.filter(({ writable }) => writable === true).map(({ name }) => ({
        binding: `frame.${name}`, label: title(name), domain: "where" as const,
        page: { id: "frame", label: "Frame" }, section: { id: "frame", label: "Frame" }, control: "text" as const,
      })),
      ...commentInspector,
      ...["comment", "author", "header", "meta"].map((binding) => ({
        binding, label: title(binding), domain: "how" as const,
        page: { id: "copy", label: "Copy" }, section: { id: "copy", label: "Copy" }, control: "text" as const,
      })),
    ],
    requiredValues: ["program"], project: projectComments,
    poster: { source: "surface-preview" },
    lane: { heightPx: 52 },
  },
];
