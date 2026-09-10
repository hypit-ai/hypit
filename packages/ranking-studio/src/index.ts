import { openFontStudioFields } from "@hypit/fonts-open/studio";
import { rankingMarkupSurfaces, rankingModuleRef, rankingTypes } from "@hypit/ranking";
import type { RankingProgram, RankingSchedule } from "@hypit/ranking";
import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanion, StudioTrackCompanionContext, StudioEntityDraft, StudioInspectorFieldDeclaration, StudioSourceBindingDeclaration } from "@hypit/studio-adapter";
import { artifactPreview, authoredChildFor, previewLayer, requiredSurfaceValue, temporalLineageFor, temporalSemanticSource } from "@hypit/studio-adapter";


const fontInspector = openFontStudioFields("style");

const frameParameters: readonly StudioSourceBindingDeclaration[] = [
  { name: "within" },
  ...["left", "top", "right", "bottom", "x", "y", "width", "height"].map((name) => ({ name, writable: true })),
];

function rankingProperties(surface: "column-style" | "tier-style" | "top-three-style") {
  return rankingMarkupSurfaces.find((candidate) => candidate.name === surface)
    ?.vocabulary.attributes.find((attribute) => attribute.name === "recipe")?.recipe ?? [];
}

function title(name: string): string {
  return name.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

type RankingInspectorPlacement = Pick<StudioInspectorFieldDeclaration, "domain" | "page" | "section">;

function place(domain: "where" | "how" | "when", page: string, section: string): RankingInspectorPlacement {
  return {
    domain,
    page: { id: page.toLowerCase().replaceAll(" ", "-"), label: page },
    section: { id: section.toLowerCase().replaceAll(" ", "-"), label: section },
  };
}

const rankingInspectorPlacement = {
  rows: place("how", "Board", "Tier Rows"),
  "rank-colors": place("how", "Board", "Rank Badges"),
  "slot-colors": place("how", "Board", "Podium Slots"),
  "font-size": place("how", "Text", "Typography"),
  "font-weight": place("how", "Text", "Typography"),
  "text-color": place("how", "Text", "Typography"),
  "label-text-color": place("how", "Labels", "Typography"),
  "label-size": place("how", "Labels", "Typography"),
  "line-height": place("how", "Text", "Typography"),
  "board-background": place("how", "Board", "Board Paint"),
  "board-border-color": place("how", "Board", "Board Paint"),
  "board-border-width": place("how", "Board", "Board Paint"),
  "board-radius": place("how", "Board", "Board Paint"),
  "board-shadow-x": place("how", "Board", "Board Shadow"),
  "board-shadow-y": place("how", "Board", "Board Shadow"),
  "board-shadow-blur": place("how", "Board", "Board Shadow"),
  "board-shadow-spread": place("how", "Board", "Board Shadow"),
  "board-shadow-color": place("how", "Board", "Board Shadow"),
  "appear-frames": place("when", "Motion", "Entrance"),
  "move-frames": place("when", "Motion", "Movement"),
  "motion-easing": place("when", "Motion", "Movement"),
  "label-width": place("where", "Layout", "Rows"),
  padding: place("where", "Layout", "Board"),
  "row-height": place("where", "Layout", "Rows"),
  "row-gap": place("where", "Layout", "Rows"),
  "cell-gap": place("where", "Layout", "Rows"),
  "icon-size": place("where", "Layout", "Items"),
  "icon-radius": place("how", "Board", "Items"),
  "icon-radius-ratio": place("how", "Board", "Items"),
  "icon-fit": place("how", "Board", "Items"),
  "stage-x": place("where", "Stage", "Position"),
  "stage-y": place("where", "Stage", "Position"),
  "stage-size": place("where", "Stage", "Size"),
  "center-x": place("where", "Layout", "Podium"),
  "baseline-y": place("where", "Layout", "Podium"),
  "slot-gap": place("where", "Layout", "Podium"),
  "ring-width": place("how", "Board", "Podium Slots"),
  "label-gap": place("where", "Layout", "Podium"),
  "board-stack": place("where", "Stacking", "Layers"),
  "stage-stack": place("where", "Stacking", "Layers"),
  "item-stack": place("where", "Stacking", "Layers"),
  "appear-gain": place("how", "Sound", "Levels"),
  "move-gain": place("how", "Sound", "Levels"),
  "sound-fade-frames": place("when", "Sound", "Envelope"),
} as const satisfies Readonly<Record<string, RankingInspectorPlacement>>;

function rankingInspector(surface: "column-style" | "tier-style" | "top-three-style"): readonly StudioInspectorFieldDeclaration[] {
  return [...fontInspector.fields, ...rankingProperties(surface).map((property) => {
    const placement = rankingInspectorPlacement[property.name as keyof typeof rankingInspectorPlacement];
    if (placement === undefined) throw new Error(`Ranking Studio has no explicit placement for ${property.name}.`);
    return {
      binding: `style.${property.name}`,
      label: title(property.name),
      ...placement,
      ...(property.summary === undefined ? {} : { summary: property.summary }),
    };
  })];
}

function rankingStyle(surface: "column-style" | "tier-style" | "top-three-style"): StudioSourceBindingDeclaration {
  return {
    name: "style",
    referenced: [fontInspector.binding],
    recipe: { through: ["recipe"], bindings: rankingProperties(surface).map(({ name, schema, fallback }) => ({
      name,
      schema,
      ...(fallback === undefined ? {} : { fallback }),
    })) },
  };
}

function projectRanking(context: StudioTrackCompanionContext): readonly StudioEntityDraft[] {
  const placement = context.placement;
  const schedule = requiredSurfaceValue(context, "schedule") as RankingSchedule;
  const program = requiredSurfaceValue(context, "program") as RankingProgram;
  if (placement === undefined) return context.generic();
  const boardId = placement.id ?? context.track.outputRef;
  const outerTemporal = temporalLineageFor(context, boardId, "outer");
  const outerSemanticSource = temporalSemanticSource(outerTemporal);
  const group: StudioEntityDraft = {
    id: `${context.track.outputRef}:entity:${boardId}`,
    authoredId: boardId,
    ...(outerSemanticSource?.id === undefined ? {} : { markerId: outerSemanticSource.id }),
    display: { title: boardId, layers: [] },
    startFrame: schedule.outer.startFrame,
    endFrameExclusive: schedule.outer.endFrameExclusive,
    stackOrder: Math.max(...context.spans.map((span) => span.stackOrder), 0),
    elementRange: placement.range,
    renderIds: context.spans.map((span) => span.id),
    presentation: { entity: "ranking", chrome: "group" },
    ...(outerTemporal === undefined ? {} : { temporal: outerTemporal }),
  };
  const programItems = new Map(program?.items.map((item) => [item.id, item] as const) ?? []);
  const reveals = schedule.entries.flatMap((entry): readonly StudioEntityDraft[] => {
    if ("mode" in entry && entry.mode !== "reveal") return [];
    const child = authoredChildFor(context, entry.itemId, [rankingTypes.itemSpec, rankingTypes.textItemShell]);
    const item = programItems.get(entry.itemId);
    const temporal = temporalLineageFor(context, entry.itemId, "mode" in entry ? "window" : "activation");
    const semanticSource = temporalSemanticSource(temporal);
    const visible = "mode" in entry ? entry.window : entry.cumulative;
    const icon = item?.icon;
    const label = item !== undefined && "label" in item ? item.label : child?.attributes.label ?? entry.itemId;
    return [{
      id: `${context.track.outputRef}:entity:${entry.itemId}`,
      authoredId: entry.itemId,
      renderIds: context.spans.filter((span) => span.subjectId === entry.itemId).map((span) => span.id),
      ...(semanticSource?.id === undefined ? {} : { markerId: semanticSource.id }),
      display: {
        title: label,
        layers: icon === undefined ? [] : [previewLayer(artifactPreview("image", icon.resource), "repeat-x")],
      },
      startFrame: visible.startFrame,
      endFrameExclusive: visible.endFrameExclusive,
      stackOrder: group.stackOrder + 1,
      ...(child === undefined ? {} : { elementRange: child.range }),
      lane: "mode" in entry ? "reveal" : "activation",
      presentation: { entity: "ranking-reveal", chrome: "standard" },
      ...(temporal === undefined ? {} : { temporal }),
    }];
  }).sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
  const childRenderIds = new Set(reveals.flatMap((entity) => entity.renderIds ?? []));
  return [{ ...group, renderIds: group.renderIds!.filter((id) => !childRenderIds.has(id)) }, ...reveals];
}

const commonBindings: readonly StudioSourceBindingDeclaration[] = [
  { name: "frame", referenced: frameParameters },
  { name: "appear-sound" },
  { name: "move-sound" },
];

const frameInspector: readonly StudioInspectorFieldDeclaration[] = frameParameters
  .filter(({ writable }) => writable === true)
  .map(({ name }) => ({
    binding: `frame.${name}`, label: title(name), domain: "where",
    page: { id: "frame", label: "Frame" }, section: { id: "frame", label: "Frame" }, control: "number", number: { suffixes: ["%", "px"], step: 1 },
  }));

export const rankingStudioTrackCompanions: readonly StudioTrackCompanion[] = [
  {
    id: "column", role: "track",
    output: { type: compositionTypes.visualTrack, surface: "column", modules: [rankingModuleRef] },
    family: "ranking", tone: "orange", label: "Ranking", icon: "ranking", requiredValues: ["schedule", "program"],
    bindings: [
      ...commonBindings,
      rankingStyle("column-style"),
    ],
    inspector: [...frameInspector, ...rankingInspector("column-style")],
    poster: { source: "surface-preview" },
    lane: {
      heightPx: 80, groupId: "ranking-reveals",
    },
    attachments: [{
      id: "reveal", family: "ranking-reveal", tone: "orange-muted", label: "Reveals", icon: "ranking", facet: "visual",
      lane: { heightPx: 40 },
      bindings: [
        { name: "label", writable: true },
        { name: "icon" },
        { name: "rank", writable: true },
        { name: "stack", writable: true },
      ],
      inspector: [
        { binding: "label", label: "Label", domain: "how", page: { id: "item", label: "Item" }, section: { id: "item", label: "Item" }, control: "text" },
        { binding: "rank", label: "Rank", domain: "how", page: { id: "item", label: "Item" }, section: { id: "item", label: "Item" }, control: "number" },
        { binding: "stack", label: "Stack", domain: "where", page: { id: "stacking", label: "Stacking" }, section: { id: "stacking", label: "Stacking" }, control: "number" },
      ],
    }],
    project: projectRanking,
  },
  {
    id: "tier", role: "track",
    output: { type: compositionTypes.visualTrack, surface: "tier", modules: [rankingModuleRef] },
    family: "ranking", tone: "orange", label: "Tier Board", icon: "ranking", requiredValues: ["schedule", "program"],
    bindings: [
      ...commonBindings,
      rankingStyle("tier-style"),
    ],
    inspector: [
      ...frameInspector,
      ...rankingInspector("tier-style"),
    ],
    poster: { source: "surface-preview" },
    lane: { heightPx: 80, groupId: "tier-reveals" },
    attachments: [{
      id: "reveal", family: "ranking-reveal", tone: "orange-muted", label: "Reveals", icon: "ranking", facet: "visual",
      lane: { heightPx: 40 },
      bindings: [
        { name: "tier", writable: true },
        { name: "entry", writable: true },
        { name: "icon" },
        { name: "stack", writable: true },
      ],
      inspector: [
        { binding: "tier", label: "Tier", domain: "how", page: { id: "item", label: "Item" }, section: { id: "item", label: "Item" }, control: "text" },
        { binding: "entry", label: "Entry", domain: "when", page: { id: "entrance", label: "Entrance" }, section: { id: "entrance", label: "Entrance" }, control: "select", options: ["direct", "drop"] },
        { binding: "stack", label: "Stack", domain: "where", page: { id: "stacking", label: "Stacking" }, section: { id: "stacking", label: "Stacking" }, control: "number" },
      ],
    }],
    project: projectRanking,
  },
  {
    id: "top-three", role: "track",
    output: { type: compositionTypes.visualTrack, surface: "top-three", modules: [rankingModuleRef] },
    family: "ranking", tone: "orange", label: "Top Three", icon: "ranking", requiredValues: ["schedule", "program"],
    bindings: [
      ...commonBindings,
      rankingStyle("top-three-style"),
      { name: "terminal" },
    ],
    inspector: [...frameInspector, ...rankingInspector("top-three-style")],
    poster: { source: "surface-preview" },
    lane: { heightPx: 80, groupId: "top-three-activations" },
    attachments: [{
      id: "activation", family: "ranking-reveal", tone: "orange-muted", label: "Activations", icon: "ranking", facet: "visual",
      lane: { heightPx: 40 },
      bindings: [
        { name: "label", writable: true },
        { name: "icon" },
        { name: "stack", writable: true },
      ],
      inspector: [
        { binding: "label", label: "Label", domain: "how", page: { id: "item", label: "Item" }, section: { id: "item", label: "Item" }, control: "text" },
        { binding: "stack", label: "Stack", domain: "where", page: { id: "stacking", label: "Stacking" }, section: { id: "stacking", label: "Stacking" }, control: "number" },
      ],
    }],
    project: projectRanking,
  },
];
