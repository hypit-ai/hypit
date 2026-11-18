import type { InvocationAddress } from "@hypit/execution";
import {
  CanvasError, bindingValues, identity, number, readAddress, readBinding, readCanvas, readMediaReference, readNode, readPlacement,
  readRecipe, readSelection, record, sameAddress, text,
  type CanvasBinding, type CanvasDocument, type CanvasNode, type CanvasPlacement, type CanvasRecipe, type CanvasResults,
  type CanvasSelection, type MediaReference,
} from "./document.js";

type Subject = { readonly node: string };
type Input = Subject & { readonly input: string };
type Port = Subject & { readonly output: string };
type Address = Subject & { readonly address: InvocationAddress };

export type CanvasCommand =
  | { readonly kind: "node.add"; readonly node: CanvasNode; readonly placement: CanvasPlacement }
  | (Subject & { readonly kind: "node.remove" })
  | (Subject & { readonly kind: "node.rename"; readonly name: string })
  | (Subject & { readonly kind: "node.move"; readonly x: number; readonly y: number })
  | (Subject & { readonly kind: "node.resize"; readonly width: number; readonly height: number })
  | (Subject & { readonly kind: "node.set-recipe"; readonly recipe: CanvasRecipe })
  | (Subject & { readonly kind: "node.set-media"; readonly media: MediaReference })
  | (Input & { readonly kind: "input.set"; readonly binding: CanvasBinding })
  | (Input & { readonly kind: "input.clear" })
  | (Address & { readonly kind: "result.attach" | "result.detach" })
  | (Port & { readonly kind: "result.select"; readonly selection: CanvasSelection })
  | (Port & { readonly kind: "result.clear" });

export type CanvasTransaction = { readonly expectedRevision: string; readonly commands: readonly CanvasCommand[] };

function readCommand(value: unknown): CanvasCommand {
  const command = record(value, "Canvas command");
  const kind = command.kind;
  const exact = (...fields: string[]) => record(command, "Canvas command", ["kind", "node", ...fields]);
  if (kind === "node.add") {
    exact("placement");
    return { kind, node: readNode(command.node), placement: readPlacement(command.placement) };
  }
  const node = identity(command.node, "Node id");
  switch (kind) {
    case "node.remove": exact(); return { kind, node };
    case "node.rename": exact("name"); return { kind, node, name: text(command.name, "Node name") };
    case "node.move": exact("x", "y"); return { kind, node, x: number(command.x, "Position x"), y: number(command.y, "Position y") };
    case "node.resize": exact("width", "height"); return { kind, node, width: number(command.width, "Width"), height: number(command.height, "Height") };
    case "node.set-media": exact("media"); return { kind, node, media: readMediaReference(command.media) };
    case "node.set-recipe": exact("recipe"); return { kind, node, recipe: readRecipe(command.recipe) };
    case "input.set":
      exact("input", "binding");
      return { kind, node, input: identity(command.input, "Input name"), binding: readBinding(command.binding) };
    case "input.clear": exact("input"); return { kind, node, input: identity(command.input, "Input name") };
    case "result.attach":
    case "result.detach":
      exact("address"); return { kind, node, address: readAddress(command.address) };
    case "result.select":
      exact("output", "selection");
      return { kind, node, output: identity(command.output, "Output name"), selection: readSelection(command.selection) };
    case "result.clear": exact("output"); return { kind, node, output: identity(command.output, "Output name") };
    default: throw new CanvasError("invalid-command", "Unknown Canvas command.");
  }
}

export function readCanvasTransaction(value: unknown): CanvasTransaction {
  const transaction = record(value, "Canvas transaction", ["expectedRevision", "commands"]);
  if (!Array.isArray(transaction.commands) || transaction.commands.length === 0) {
    throw new CanvasError("invalid-command", "A Canvas transaction requires commands.");
  }
  return { expectedRevision: text(transaction.expectedRevision, "Expected revision"), commands: transaction.commands.map(readCommand) };
}

function unlink(binding: CanvasBinding, node: string): CanvasBinding | undefined {
  const values = bindingValues(binding).filter(value => !("from" in value) || value.from.node !== node);
  return "items" in binding ? { items: values } : values[0];
}

export function applyCanvasCommands(document: CanvasDocument, commands: readonly CanvasCommand[]): CanvasDocument {
  const nodes = new Map(document.nodes.map(node => [node.id, node]));
  const layout = new Map(Object.entries(document.layout));
  const results = new Map(Object.entries(document.results));
  for (const command of commands) {
    if (command.kind === "node.add") {
      const node = command.node;
      if (nodes.has(node.id)) throw new CanvasError("duplicate-node", "Node " + node.id + " already exists.", { node: node.id });
      nodes.set(node.id, node);
      layout.set(node.id, command.placement);
      continue;
    }
    const id = command.node;
    const node = nodes.get(id);
    if (node === undefined) throw new CanvasError("missing-node", "Node " + id + " does not exist.", { node: id });
    switch (command.kind) {
      case "node.remove":
        nodes.delete(id);
        layout.delete(id);
        results.delete(id);
        for (const [key, item] of nodes) {
          if (!("capability" in item)) continue;
          const inputs = Object.fromEntries(Object.entries(item.inputs).flatMap(([name, binding]) => {
            const next = unlink(binding, id);
            return next === undefined ? [] : [[name, next]];
          }));
          nodes.set(key, { ...item, inputs });
        }
        break;
      case "node.rename": nodes.set(id, { ...node, name: command.name }); break;
      case "node.move": layout.set(id, { ...layout.get(id)!, x: command.x, y: command.y }); break;
      case "node.resize": layout.set(id, { ...layout.get(id)!, width: command.width, height: command.height }); break;
      case "node.set-media":
        if (!("media" in node)) throw new CanvasError("invalid-node", "This command needs a Media node.", { node: id });
        nodes.set(id, { ...node, media: command.media });
        break;
      case "node.set-recipe":
      case "input.set":
      case "input.clear": {
        if (!("capability" in node)) throw new CanvasError("invalid-node", "This command needs a recipe node.", { node: id });
        if (command.kind === "node.set-recipe") nodes.set(id, { ...node, ...command.recipe });
        else {
          const inputs = new Map(Object.entries(node.inputs));
          if (command.kind === "input.set") inputs.set(command.input, command.binding);
          else inputs.delete(command.input);
          nodes.set(id, { ...node, inputs: Object.fromEntries(inputs) });
        }
        break;
      }
      default: {
        if (!("capability" in node)) throw new CanvasError("invalid-node", "Results belong to a recipe node.", { node: id });
        const previous: CanvasResults = results.get(id) ?? { invocations: [], selected: {} };
        const selected = new Map(Object.entries(previous.selected));
        let invocations = previous.invocations;
        if (command.kind === "result.attach" && !invocations.some(address => sameAddress(command.address, address))) {
          invocations = [...invocations, command.address];
        }
        if (command.kind === "result.detach") {
          invocations = invocations.filter(address => !sameAddress(command.address, address));
          for (const [port, item] of selected) if (sameAddress(command.address, item.address)) selected.delete(port);
        }
        if (command.kind === "result.select") selected.set(command.output, command.selection);
        if (command.kind === "result.clear") selected.delete(command.output);
        if (invocations.length === 0 && selected.size === 0) results.delete(id);
        else results.set(id, { invocations, selected: Object.fromEntries(selected) });
      }
    }
  }
  return readCanvas({ ...document, nodes: [...nodes.values()], layout: Object.fromEntries(layout), results: Object.fromEntries(results) });
}
