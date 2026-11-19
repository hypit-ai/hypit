import type { CanvasBinding, CanvasCommand, CanvasDocument, CanvasNode, CanvasSelection, CanvasValue } from "@hypit/canvas";
import type { InvocationAddress, JsonValue } from "@hypit/execution";
import type {
  CanvasAdoptionRequest, CanvasModel, CanvasObservation, CanvasPreviewRequest, CanvasQuoteReceipt,
} from "../protocol.js";
import { activeFields, nodeTitle, supplies } from "./wiring.js";
import { cardSize } from "./placement.js";
import { button, element, field, filename, option, titleFor } from "./dom.js";

type Catalog = Extract<CanvasObservation, { kind: "catalog" }>;
type Recipe = Extract<CanvasNode, { capability: string }>;
type History = Extract<CanvasObservation, { kind: "history" }>;
type ModelField = CanvasModel["fields"][number];
const renderedHistories = new WeakMap<HTMLElement, string>();

export type InspectorActions = {
  commit(commands: CanvasCommand[]): void;
  preview(request: CanvasPreviewRequest): Promise<{ url: string; mediaType: string }>;
  quote(node: string, environment: string, endpoint: string): Promise<CanvasQuoteReceipt>;
  invoke(node: string, environment: string, endpoint: string): void;
  adopt(request: CanvasAdoptionRequest): void;
  cancel(node: string, address: InvocationAddress): void;
};

function setInput(node: string, input: string, binding?: CanvasBinding): CanvasCommand {
  return binding === undefined ? { kind: "input.clear", node, input } : { kind: "input.set", node, input, binding };
}

function fieldChoices(nodes: CanvasDocument["nodes"], recipe: Recipe, model: ModelField, catalog: Catalog) {
  const outputChoices: { value: CanvasValue; label: string }[] = [];
  for (const node of nodes) {
    if (node.id === recipe.id) continue;
    if ("media" in node) {
      if (supplies(node, "media", model, catalog)) {
        outputChoices.push({ value: { from: { node: node.id, output: "media" } }, label: nodeTitle(node, catalog.models) + " · Media card" });
      }
      continue;
    }
    const definition = catalog.models.find(item => item.id === node.capability);
    for (const name of Object.keys(definition?.outputs ?? {})) {
      if (!supplies(node, name, model, catalog)) continue;
      outputChoices.push({ value: { from: { node: node.id, output: name } }, label: nodeTitle(node, catalog.models) + " · " + name });
    }
  }
  for (const media of catalog.media.entries) {
    if (media.state === "available" && (model.media === undefined || media.mediaType.startsWith(model.media + "/"))) {
      outputChoices.push({ value: { media: media.reference }, label: filename(media.reference.path) + " · Project Media" });
    }
  }
  return outputChoices;
}

function bindingOrigin(value: CanvasValue) {
  return "from" in value ? JSON.stringify(value.from) : "media" in value ? value.media.path : JSON.stringify(value.value);
}

function renderResource(
  node: Recipe, descriptor: ModelField, binding: CanvasBinding | undefined, document: CanvasDocument, catalog: Catalog, actions: InspectorActions,
) {
  const list = descriptor.kind === "resources";
  const values = binding === undefined ? [] : "items" in binding ? binding.items : [binding];
  const choices = fieldChoices(document.nodes, node, descriptor, catalog);
  const group = element("fieldset", "resource-field");
  group.append(element("legend", "", titleFor(descriptor.name)));
  const change = (items: CanvasValue[]) => actions.commit([setInput(node.id, descriptor.name,
    items.length === 0 ? undefined : list ? { items } : items[0])]);
  const row = (value?: CanvasValue, index = values.length) => {
    const wrapper = element("div", "resource-row");
    const select = element("select");
    select.setAttribute("aria-label", titleFor(descriptor.name) + (list ? " " + (index + 1) : ""));
    select.append(option("", value === undefined ? "Choose a source" : "Disconnect"));
    const current = value === undefined ? -1 : choices.findIndex(choice => bindingOrigin(choice.value) === bindingOrigin(value));
    choices.forEach((choice, id) => select.append(option(String(id), choice.label)));
    if (current < 0 && value !== undefined) {
      select.append(option("unavailable", "Current source unavailable"));
      select.value = "unavailable";
    } else if (current >= 0) select.value = String(current);
    select.onchange = () => {
      const next = [...values];
      if (select.value === "unavailable") return;
      if (select.value === "") next.splice(index, 1);
      else next[index] = choices[Number(select.value)]!.value;
      change(next);
    };
    wrapper.append(select);
    if (value !== undefined && !("value" in value) && descriptor.personReference) {
      const person = element("select");
      person.append(option("", "Choose Yes or No"), option("true", "Yes"), option("false", "No"));
      person.options[0]!.disabled = true;
      person.value = value.personReference === undefined ? "" : String(value.personReference);
      person.onchange = () => change(values.map((entry, item) => item === index ? { ...value, personReference: person.value === "true" } : entry));
      wrapper.append(field("Depicts a person", person));
    }
    return wrapper;
  };
  values.forEach((value, index) => group.append(row(value, index)));
  if (values.length === 0 || (list && values.length < (descriptor.maxItems ?? Infinity))) group.append(row());
  return group;
}

function renderValue(node: Recipe, descriptor: ModelField, model: CanvasModel, actions: InspectorActions) {
  const binding = Object.hasOwn(node.inputs, descriptor.name) ? node.inputs[descriptor.name] : undefined;
  const value = binding !== undefined && "value" in binding ? binding.value : undefined;
  const edit = (value?: JsonValue) => {
    const commands = [setInput(node.id, descriptor.name, value === undefined ? undefined : { value })];
    if (descriptor.name === "mode") {
      for (const item of model.fields) {
        if (item.modes !== undefined && !item.modes.some(mode => mode === (value ?? descriptor.default))
          && Object.hasOwn(node.inputs, item.name)) commands.push(setInput(node.id, item.name));
      }
    }
    actions.commit(commands);
  };
  const name = titleFor(descriptor.name);
  if (descriptor.kind === "choice" || descriptor.kind === "boolean") {
    const select = element("select");
    const choices = descriptor.kind === "boolean" ? ["true", "false"] : descriptor.choices ?? [];
    select.append(option("", descriptor.default === undefined ? "Select…" : String(descriptor.default) + " (default)"));
    choices.forEach(choice => select.append(option(choice, descriptor.kind === "boolean" ? (choice === "true" ? "Yes" : "No") : titleFor(choice))));
    select.value = value === undefined ? "" : String(value);
    select.onchange = () => edit(select.value === "" ? undefined : (descriptor.kind === "boolean" ? select.value === "true" : select.value));
    return field(name, select);
  }
  const input = descriptor.kind === "text" && ["prompt", "description", "text"].includes(descriptor.name)
    ? element("textarea") : element("input");
  if (input instanceof HTMLInputElement && descriptor.kind === "number") { input.type = "number"; input.step = "any"; }
  if (input instanceof HTMLTextAreaElement) input.rows = 3;
  input.value = value === undefined ? "" : String(value);
  if (descriptor.default !== undefined) input.placeholder = String(descriptor.default);
  input.onchange = () => edit(input.value.trim() === "" ? undefined : descriptor.kind === "number" ? Number(input.value) : input.value);
  return field(name, input);
}

function showPreview(target: HTMLElement, request: CanvasPreviewRequest, actions: InspectorActions) {
  target.replaceChildren(element("p", "muted", "Opening preview…"));
  const pending = target.firstChild;
  void actions.preview(request).then(({ url, mediaType }) => {
    if (target.firstChild !== pending) return;
    if (mediaType.startsWith("image/")) {
      const image = element("img");
      image.alt = "Card output";
      image.src = url;
      target.replaceChildren(image);
      return;
    }
    const media = element(mediaType.startsWith("audio/") ? "audio" : "video");
    media.controls = true;
    media.preload = "metadata";
    media.src = url;
    target.replaceChildren(media);
  }).catch(error => {
    if (target.firstChild === pending) target.replaceChildren(element("p", "muted", error instanceof Error ? error.message : String(error)));
  });
}

export function renderInspector(root: HTMLElement, node: CanvasNode, document: CanvasDocument, catalog: Catalog, actions: InspectorActions) {
  const panel = root.dataset.node === node.id && root.dataset.panel === "results" ? "results" : "parameters";
  root.dataset.node = node.id;
  root.replaceChildren();
  const name = element("input");
  name.value = nodeTitle(node, catalog.models);
  name.onchange = () => {
    if (name.value.trim() !== "") actions.commit([{ kind: "node.rename", node: node.id, name: name.value.trim() }]);
  };
  const header = element("div", "inspect-header");
  header.append(element("p", "eyebrow", "media" in node ? "Project Media" : "Generation recipe"), field("Card name", name));
  root.append(header);
  const placement = document.layout[node.id]!;
  const position = element("details", "placement");
  position.append(element("summary", "", "Placement"));
  const coordinates = element("div", "coordinates");
  for (const key of ["x", "y", "width", "height"] as const) {
    const input = element("input");
    input.type = "number";
    input.step = "any";
    if (key === "width" || key === "height") input.min = "1";
    input.value = String(placement[key] ?? (key === "width" ? cardSize.width : cardSize.height));
    input.onchange = () => {
      if (input.value === "" || !input.checkValidity()) return;
      const value = Number(input.value);
      actions.commit(key === "x" || key === "y" ? [{ kind: "node.move", node: node.id, x: key === "x" ? value : placement.x,
        y: key === "y" ? value : placement.y }] : [{ kind: "node.resize", node: node.id,
        width: key === "width" ? value : placement.width ?? cardSize.width, height: key === "height" ? value : placement.height ?? cardSize.height }]);
    };
    coordinates.append(field(titleFor(key), input));
  }
  position.append(coordinates);
  root.append(position);
  const preview = element("div", "preview");
  if ("media" in node) {
    const select = element("select");
    select.append(option(node.media.path, node.media.path));
    for (const entry of catalog.media.entries) {
      if (entry.state === "available" && entry.reference.path !== node.media.path) select.append(option(entry.reference.path));
    }
    select.onchange = () => actions.commit([{ kind: "node.set-media", node: node.id, media: { path: select.value } }]);
    root.append(field("Media asset", select), preview);
    showPreview(preview, { node: node.id }, actions);
  } else {
    const tabs = element("div", "inspector-tabs");
    const parameters = element("section", "inspector-panel");
    const historyPanel = element("section", "inspector-panel");
    const parametersTab = button("Parameters", () => showPanel("parameters"));
    const resultsTab = button("Results", () => showPanel("results"));
    function showPanel(name: "parameters" | "results") {
      root.dataset.panel = name;
      parameters.hidden = name !== "parameters";
      historyPanel.hidden = name !== "results";
      parametersTab.setAttribute("aria-pressed", String(!parameters.hidden));
      resultsTab.setAttribute("aria-pressed", String(!historyPanel.hidden));
    }
    tabs.append(parametersTab, resultsTab);
    root.append(tabs, parameters, historyPanel);
    showPanel(panel);
    const model = catalog.models.find(model => model.id === node.capability);
    const results = Object.hasOwn(document.results, node.id) ? document.results[node.id] : undefined;
    const modelPicker = element("select");
    modelPicker.append(option(node.capability, model?.title ?? node.capability));
    for (const model of catalog.palette) if (model.id !== node.capability) modelPicker.append(option(model.id, model.title));
    modelPicker.onchange = () => {
      const next = catalog.palette.find(model => model.id === modelPicker.value);
      if (next === undefined) return;
      const commands: CanvasCommand[] = [{ kind: "node.set-recipe", node: node.id, recipe: { capability: next.id, inputs: {} } }];
      for (const output of Object.keys(results?.selected ?? {})) {
        if (model?.outputs[output]?.type !== next.outputs[output]?.type || !Object.hasOwn(next.outputs, output)) {
          commands.push({ kind: "result.clear", node: node.id, output });
        }
      }
      actions.commit(commands);
    };
    parameters.append(field("Model", modelPicker));
    if (model === undefined) parameters.append(element("p", "muted", "Select the Model package in the Project manifest."));
    else renderRecipe(parameters, node, model, document, catalog, actions);
    const selected = Object.values(results?.selected ?? {}).find(item => item.resource !== undefined);
    historyPanel.append(element("h2", "section-title", "Generation history"), preview);
    if (selected !== undefined) showPreview(preview, { node: node.id, selection: selected }, actions);
    const history = element("div", "history");
    history.id = "history-entries";
    historyPanel.append(history);
  }
  root.append(button("Remove card", () => {
    if (window.confirm("Remove this card and its links?")) actions.commit([{ kind: "node.remove", node: node.id }]);
  }, "danger"));
  return preview;
}

function renderRecipe(
  root: HTMLElement, node: Recipe, model: CanvasModel, document: CanvasDocument, catalog: Catalog, actions: InspectorActions,
) {
  const parameters = element("div", "fields");
  for (const descriptor of activeFields(node, model)) {
    if (descriptor.kind === "resource" || descriptor.kind === "resources") {
      parameters.append(renderResource(node, descriptor, node.inputs[descriptor.name], document, catalog, actions));
    } else parameters.append(renderValue(node, descriptor, model, actions));
  }
  root.append(parameters);
  const environments = catalog.environments.filter(environment => environment.capabilities.some(capability => capability.capability === model.id));
  if (environments.length === 0) {
    root.append(element("p", "muted", "No Project Execution Environment offers this model."));
    return;
  }
  const environment = element("select");
  const endpoint = element("select");
  environment.append(...environments.map(env => option(env.id)));
  const endpoints = () => {
    const available = environments.find(env => env.id === environment.value)?.capabilities.find(capability => capability.capability === model.id)?.endpoints ?? [];
    endpoint.replaceChildren(option("", "Default endpoint"), ...available.map(value => option(value)));
  };
  environment.onchange = endpoints;
  endpoints();
  const pricing = element("p", "pricing");
  pricing.hidden = true;
  pricing.setAttribute("aria-live", "polite");
  root.append(field("Execution Environment", environment), field("Endpoint", endpoint));
  const actionsRow = element("div", "action-row");
  actionsRow.append(button("Quote", () => {
    const target = environment.value;
    pricing.hidden = false;
    pricing.textContent = "Getting quote…";
    void actions.quote(node.id, target, endpoint.value).then(({ quote }) => {
      pricing.textContent = quote.kind === "estimate"
        ? `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(quote.estimatedUSD)} estimated · ${quote.estimatedCredits} credits`
        : quote.kind === "pricing" ? "Pricing available · Missing " + quote.missing.join(", ") : quote.reason;
    }).catch(error => { pricing.textContent = error instanceof Error ? error.message : String(error); });
  }), button("Generate", () => actions.invoke(node.id, environment.value, endpoint.value), "primary"));
  root.append(actionsRow, pricing);
}

function selectionIs(a: CanvasSelection | undefined, b: CanvasSelection) {
  return a !== undefined && a.address.environment === b.address.environment && a.address.invocation === b.address.invocation
    && a.output === b.output && a.resource === b.resource;
}

export function renderHistory(
  root: HTMLElement, preview: HTMLElement, node: Recipe, model: CanvasModel | undefined, board: CanvasDocument,
  entries: History["entries"], actions: InspectorActions,
) {
  const focused = window.document.activeElement;
  if (focused instanceof HTMLElement && root.contains(focused)) return;
  const signature = JSON.stringify(entries);
  if (renderedHistories.get(root) === signature) return;
  renderedHistories.set(root, signature);
  root.replaceChildren();
  const results = Object.hasOwn(board.results, node.id) ? board.results[node.id] : undefined;
  if (entries.length === 0) {
    root.append(element("p", "muted", "Results appear here after you generate."));
    return;
  }
  for (const item of [...entries].reverse()) {
    const card = element("section", "result");
    const heading = element("div", "result-heading");
    heading.append(element("strong", "", titleFor(item.phase)), element("span", "", item.address.environment + " · " + item.address.invocation.slice(0, 8)));
    card.append(heading);
    if ("observation" in item && item.observation?.progress !== undefined) card.append(element("p", "muted", item.observation.progress));
    const issue = "issue" in item ? item.issue : item.observation?.failure?.message;
    if (issue !== undefined) card.append(element("p", "muted", issue));
    const cancel = ["queued", "submitting", "running", "collecting", "received"].includes(item.phase);
    if (cancel) card.append(button("Cancel", () => actions.cancel(node.id, item.address)));
    if ("publication" in item && item.publication !== undefined) {
      for (const [port, output] of Object.entries(item.publication.outputs)) {
        const resources = Object.keys(output.resources);
        for (const resource of resources.length === 0 ? [undefined] : resources) {
          const selection = { address: item.address, output: port, ...(resource === undefined ? {} : { resource }) };
          const row = element("div", "result-output");
          row.append(element("span", "", resource === undefined ? port : port + " · " + resource));
          const buttons = element("div", "action-row");
          const matching = Object.entries(model?.outputs ?? {}).find(([, expected]) => expected.type === output.type);
          if (matching !== undefined) {
            const [name] = matching;
            if (selectionIs(results?.selected[name], selection)) buttons.append(button("Clear choice", () => actions.commit([{ kind: "result.clear", node: node.id, output: name }])));
            else buttons.append(button("Use output", () => actions.commit([{ kind: "result.select", node: node.id, output: name, selection }])));
          }
          if (resource !== undefined) {
            buttons.append(button("Preview", () => showPreview(preview, { node: node.id, selection }, actions)));
            buttons.append(button("Adopt media", () => actions.adopt({ node: node.id, selection, target: { kind: "media" } })));
          } else if (output.type === "@hypit/timed-transcript/transcript") {
            buttons.append(button("Save transcript", () => {
              const path = window.prompt("Project-relative transcript path", `transcripts/${node.id}.transcript.json`);
              if (path) actions.adopt({ node: node.id, selection, target: { kind: "transcript", path } });
            }));
          }
          row.append(buttons);
          card.append(row);
        }
      }
    }
    root.append(card);
  }
}
