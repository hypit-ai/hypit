import { assertNleProject, findNlePictureLayoutSharedValue, resolveNlePictureLayout } from "./project.js";
import type { NleTransaction } from "./transaction.js";
import type { NlePictureLayout, NlePresentItem, NleProject } from "./types.js";

export type NlePictureFrame = Pick<NlePictureLayout, "x" | "y" | "width" | "height">;

/** Direct spatial intentions over inline placement facts owned by NLE. */
export type NleSpatialEdit =
  | { readonly kind: "layout.replace"; readonly layout: NlePictureLayout }
  | { readonly kind: "frame.translate"; readonly deltaX: number; readonly deltaY: number }
  | { readonly kind: "frame.resize"; readonly frame: NlePictureFrame }
  | { readonly kind: "fit.set"; readonly fit: NlePictureLayout["fit"] }
  | { readonly kind: "focus.set"; readonly contentX: number; readonly contentY: number }
  | { readonly kind: "layout.share"; readonly id: string; readonly name: string }
  | { readonly kind: "layout.link"; readonly ref: string }
  | { readonly kind: "layout.unlink" };

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function assertFrame(frame: NlePictureFrame): void {
  assertFinite(frame.x, "NLE Picture frame x");
  assertFinite(frame.y, "NLE Picture frame y");
  assertFinite(frame.width, "NLE Picture frame width");
  assertFinite(frame.height, "NLE Picture frame height");
  if (frame.width <= 0 || frame.height <= 0) {
    throw new Error("NLE Picture frame must have positive width and height.");
  }
}

function assertFocus(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0 || value > 1) throw new Error(`${label} must be between zero and one.`);
}

function pictureItem(project: NleProject, itemId: string): NlePresentItem & {
  readonly picture: NonNullable<NlePresentItem["picture"]>;
} {
  for (const composition of project.compositions) {
    for (const track of composition.tracks) {
      const item = track.items.find((candidate) => candidate.id === itemId);
      if (item === undefined) continue;
      if (item.kind !== "present" || item.picture === undefined) {
        throw new Error(`NLE Item ${itemId} has no Picture layout.`);
      }
      return item as NlePresentItem & { readonly picture: NonNullable<NlePresentItem["picture"]> };
    }
  }
  throw new Error(`Unknown NLE Item: ${itemId}.`);
}

function replaceLayout(
  item: NlePresentItem & { readonly picture: NonNullable<NlePresentItem["picture"]> },
  layout: NlePictureLayout | { readonly ref: string },
) {
  return {
    kind: "item.replace",
    item: {
      ...structuredClone(item),
      picture: { ...structuredClone(item.picture), layout: structuredClone(layout) },
    },
  } as const;
}

function replaceOwnedLayout(
  project: NleProject,
  item: NlePresentItem & { readonly picture: NonNullable<NlePresentItem["picture"]> },
  layout: NlePictureLayout,
) {
  if ("ref" in item.picture.layout) {
    const resource = findNlePictureLayoutSharedValue(project, item.picture.layout.ref);
    return { kind: "shared-value.replace" as const,
      value: { ...structuredClone(resource), value: structuredClone(layout) } };
  }
  return replaceLayout(item, layout);
}

/** Plan one spatial user or Agent intention as an ordinary pure NLE transaction. */
export function planNleSpatialEdit(
  project: NleProject,
  itemId: string,
  edit: NleSpatialEdit,
): NleTransaction {
  assertNleProject(project);
  const item = pictureItem(project, itemId);
  const current = resolveNlePictureLayout(project, item.picture.layout);
  switch (edit.kind) {
    case "layout.replace":
      assertFrame(edit.layout);
      assertFocus(edit.layout.contentX ?? 0.5, "NLE Picture contentX");
      assertFocus(edit.layout.contentY ?? 0.5, "NLE Picture contentY");
      return { commands: [replaceOwnedLayout(project, item, edit.layout)] };
    case "frame.translate":
      assertFinite(edit.deltaX, "NLE Picture translation x");
      assertFinite(edit.deltaY, "NLE Picture translation y");
      return { commands: [replaceOwnedLayout(project, item,
        { ...current, x: current.x + edit.deltaX, y: current.y + edit.deltaY })] };
    case "frame.resize":
      assertFrame(edit.frame);
      return { commands: [replaceOwnedLayout(project, item, { ...current, ...structuredClone(edit.frame) })] };
    case "fit.set":
      if (edit.fit !== "fill" && edit.fit !== "contain" && edit.fit !== "cover") {
        throw new Error(`Unknown NLE Picture fit: ${String(edit.fit)}.`);
      }
      return { commands: [replaceOwnedLayout(project, item, { ...current, fit: edit.fit })] };
    case "focus.set":
      assertFocus(edit.contentX, "NLE Picture contentX");
      assertFocus(edit.contentY, "NLE Picture contentY");
      return { commands: [replaceOwnedLayout(project, item,
        { ...current, contentX: edit.contentX, contentY: edit.contentY })] };
    case "layout.share":
      if (edit.id.trim().length === 0 || edit.name.trim().length === 0) {
        throw new Error("NLE shared Picture Layout requires an id and name.");
      }
      if (project.sharedValues.some((candidate) => candidate.id === edit.id)) {
        throw new Error(`NLE Shared Value ${edit.id} already exists.`);
      }
      if ("ref" in item.picture.layout) {
        throw new Error(`NLE Item ${itemId} already uses shared Picture Layout ${item.picture.layout.ref}.`);
      }
      return { commands: [
        {
          kind: "shared-value.add",
          value: {
            id: edit.id,
            name: edit.name,
            declaration: { kind: "nle", slot: "picture.layout" },
            value: current,
          },
        },
        replaceLayout(item, { ref: edit.id }),
      ] };
    case "layout.link":
      findNlePictureLayoutSharedValue(project, edit.ref);
      return { commands: [replaceLayout(item, { ref: edit.ref })] };
    case "layout.unlink":
      if (!("ref" in item.picture.layout)) {
        throw new Error(`NLE Item ${itemId} already owns its Picture Layout.`);
      }
      return { commands: [replaceLayout(item, current)] };
  }
}
