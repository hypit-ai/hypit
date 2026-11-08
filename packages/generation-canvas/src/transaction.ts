import { assertGenerationCanvasView } from "./project.js";
import type { GenerationCanvasItem, GenerationCanvasView } from "./types.js";

export type GenerationCanvasCommand =
  | { readonly kind: "view.rename"; readonly name: string }
  | { readonly kind: "item.add"; readonly item: GenerationCanvasItem }
  | { readonly kind: "item.replace"; readonly item: GenerationCanvasItem }
  | { readonly kind: "item.move"; readonly id: string; readonly x: number; readonly y: number }
  | { readonly kind: "item.remove"; readonly id: string };

export type GenerationCanvasTransaction = {
  readonly revision: number;
  readonly commands: readonly GenerationCanvasCommand[];
};

export class GenerationCanvasRevisionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`Generation Canvas View changed: expected revision ${expected}, found ${actual}.`);
    this.name = "GenerationCanvasRevisionConflict";
  }
}

type MutableView = Omit<GenerationCanvasView, "revision" | "name" | "items"> & {
  revision: number;
  name: string;
  items: GenerationCanvasItem[];
};

function itemIndex(view: MutableView, id: string): number {
  const index = view.items.findIndex((candidate) => candidate.id === id);
  if (index < 0) throw new Error(`Unknown Generation Canvas Item: ${id}`);
  return index;
}

/** One Canvas gesture becomes one validated View revision without changing its Generation Graph. */
export function applyGenerationCanvasTransaction(
  view: GenerationCanvasView,
  transaction: GenerationCanvasTransaction,
): GenerationCanvasView {
  assertGenerationCanvasView(view);
  if (transaction.revision !== view.revision) {
    throw new GenerationCanvasRevisionConflict(transaction.revision, view.revision);
  }
  const next = structuredClone(view) as MutableView;
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "view.rename":
        next.name = command.name;
        break;
      case "item.add":
        if (next.items.some((candidate) => candidate.id === command.item.id)) {
          throw new Error(`Generation Canvas Item ${command.item.id} already exists.`);
        }
        next.items.push(structuredClone(command.item));
        break;
      case "item.replace":
        next.items.splice(itemIndex(next, command.item.id), 1, structuredClone(command.item));
        break;
      case "item.move": {
        const index = itemIndex(next, command.id);
        next.items.splice(index, 1, { ...next.items[index]!, x: command.x, y: command.y });
        break;
      }
      case "item.remove":
        next.items.splice(itemIndex(next, command.id), 1);
        break;
    }
  }
  next.revision += 1;
  assertGenerationCanvasView(next);
  return structuredClone(next);
}
