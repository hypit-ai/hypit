import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  InvocationIdentityConflict, type ExecutionClient, type ExecutionResourceSource, type InvocationAddress,
  type InvocationRequest, type JsonValue, type Publication, type QuoteInputs,
} from "@hypit/execution";
import type { Capability, ModelField } from "@hypit/execution/model";
import { defaultMediaSelection } from "@hypit/media";
import { NodeProjectMediaService } from "@hypit/media-asset/service/node";
import { inspectMediaFileForAdoption, mediaFileExtension } from "@hypit/media-local";
import type { ProjectHostContext } from "@hypit/project";
import { createNodeProjectResourceResolver } from "@hypit/project/node";
import {
  CanvasError, bindingValues, identity, readAddress, readMediaReference, readSelection, record, sameAddress, text,
  type CanvasBinding, type CanvasDocument, type CanvasNode, type CanvasSelection, type CanvasValue, type MediaReference,
} from "./document.js";
import type { CanvasService, CanvasSnapshot } from "./service.js";

type RecipeNode = Extract<CanvasNode, { capability: string }>;
type NodeResults = CanvasDocument["results"][string];
type BindingSource = { readonly input: string; readonly index: number; readonly binding: CanvasValue; readonly selection?: CanvasSelection };
type PrepareOptions = { readonly node: string; readonly environment?: string; readonly expectedRevision?: string; readonly endpoint?: string };
export type CanvasQuoteRequest = PrepareOptions;
export type CanvasInvokeRequest = PrepareOptions & { readonly expectedRevision: string; readonly invocation?: string };
export type CanvasAdoptionRequest = {
  readonly node: string;
  readonly selection: CanvasSelection;
  readonly target: { readonly kind: "media"; readonly path?: string };
};
export type CanvasModel = {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly ModelField[];
  readonly outputs: Readonly<Record<string, { readonly type: string; readonly media?: string }>>;
};

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function get<T>(map: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return map !== undefined && Object.hasOwn(map, key) ? map[key] : undefined;
}

function recipe(document: CanvasDocument, id: string): RecipeNode {
  const node = document.nodes.find(node => node.id === id);
  if (node === undefined || !("capability" in node)) throw new CanvasError("missing-recipe", "Recipe " + id + " does not exist.", { node: id });
  return node;
}

async function client(context: ProjectHostContext, environment?: string): Promise<ExecutionClient> {
  if (environment === undefined) {
    const available = await context.refreshExecutionClients();
    if (available.length === 1) return available[0]!.client;
    if (available.length === 0) throw new CanvasError("missing-environment", "No Execution Environment is connected to this Project.");
    throw new CanvasError("missing-environment", "Choose one Execution Environment by id.");
  }
  const found = context.executionClients.find(entry => entry.environment === environment)?.client
    ?? (await context.refreshExecutionClients()).find(entry => entry.environment === environment)?.client;
  if (found === undefined) throw new CanvasError("missing-environment", "Execution Environment " + environment + " is unavailable.");
  return found;
}

function attached(results: NodeResults | undefined, address: InvocationAddress): boolean {
  return results?.invocations.some(item => sameAddress(item, address)) === true;
}

export class CanvasOperations {
  readonly #context: ProjectHostContext;
  readonly #models = new Map<string, Capability>();
  readonly #inspectOptions: { readonly ffprobePath?: string };

  constructor(context: ProjectHostContext, inspectOptions: { readonly ffprobePath?: string } = {}) {
    this.#context = context;
    this.#inspectOptions = inspectOptions;
    for (const contribution of context.packages.contributions("canvas.model")) {
      const model = contribution.value as Capability | undefined;
      if (typeof model?.id !== "string" || !model.id.startsWith(contribution.package + "/")
        || typeof model.title !== "string" || typeof model.readRequest !== "function" || model.outputs == null
        || !Object.values(model.outputs).some(output => output?.media === "image" || output?.media === "video" || output?.media === "audio")
        || this.#models.has(model.id)) {
        throw new CanvasError("invalid-model", "Invalid Canvas Model contribution from " + contribution.package + ".");
      }
      this.#models.set(model.id, model);
    }
  }

  #model(node: RecipeNode): Capability {
    const model = this.#models.get(node.capability);
    if (model === undefined) {
      const packageName = node.capability.slice(0, node.capability.lastIndexOf("/"));
      throw new CanvasError("missing-model", `Recipe ${node.id} needs ${node.capability} from Project package ${packageName}.`, { node: node.id });
    }
    return model;
  }

  #description(model: Capability): CanvasModel {
    return { id: model.id, title: model.title, fields: model.authoring ?? [],
      outputs: Object.fromEntries(Object.entries(model.outputs).map(([name, output]) =>
        [name, { type: output.type, ...(output.media === undefined ? {} : { media: output.media }) }])) };
  }

  async catalog() {
    const palette = this.#context.packages.catalog("canvas.model").map(offering => {
      const model = typeof offering.value === "string" && this.#models.get(offering.value);
      if (!model || !model.id.startsWith(offering.package + "/")) {
        throw new CanvasError("invalid-model", "Catalog offering " + offering.package + "#" + offering.id + " has no Model.");
      }
      return this.#description(model);
    });
    return {
      palette, models: [...this.#models.values()].map(model => this.#description(model)),
      environments: (await this.#context.refreshExecutionClients()).map(({ client }) =>
        ({ id: client.environment, capabilities: client.capabilities() })),
    };
  }

  observeNode(document: CanvasDocument, id: string) {
    const node = document.nodes.find(node => node.id === id);
    if (node === undefined) throw new CanvasError("missing-node", "Node " + id + " does not exist.", { node: id });
    if ("media" in node) return { node, outputs: ["media"], issues: [] };
    const model = this.#models.get(node.capability);
    if (model === undefined) return { node, outputs: [], issues: [`Recipe ${id} needs ${node.capability}.`] };
    const mode = get(node.inputs, "mode");
    const activeMode = mode !== undefined && "value" in mode ? mode.value : model.authoring?.find(field => field.name === "mode")?.default;
    const issues = (model.authoring ?? []).flatMap(field => {
      if (field.modes !== undefined && !field.modes.some(value => value === activeMode)) return [];
      const input = get(node.inputs, field.name);
      if (input === undefined) return field.required && field.default === undefined ? [`Missing input ${field.name}.`] : [];
      const values = bindingValues(input);
      if (field.required && values.length === 0) return [`Missing input ${field.name}.`];
      if (field.personReference && values.some(value => !("value" in value) && value.personReference === undefined)) {
        return [`Indicate whether the references in ${field.name} depict a person.`];
      }
      return [];
    });
    return { node, model: this.#description(model), outputs: Object.keys(model.outputs), issues,
      selected: get(document.results, id)?.selected ?? {} };
  }

  async #output(selection: CanvasSelection) {
    const execution = await client(this.#context, selection.address.environment);
    const publication = await execution.publication(selection.address);
    if (publication === undefined) throw new CanvasError("missing-publication", "This Invocation has no completed Publication.");
    const output = get(publication.outputs, selection.output);
    if (output === undefined) throw new CanvasError("missing-output", "Publication has no output " + selection.output + ".");
    const resource = selection.resource === undefined ? undefined : get(output.resources, selection.resource);
    if (selection.resource !== undefined && resource === undefined) throw new CanvasError("missing-resource", "Publication has no resource " + selection.resource + ".");
    return { output, resource, execution };
  }

  #validateBinding(document: CanvasDocument, node: RecipeNode, field: ModelField, binding: CanvasBinding): void {
    const subject = { node: node.id, input: field.name };
    const bad = (message: string): never => { throw new CanvasError("invalid-binding", message, subject); };
    if (("items" in binding) !== (field.kind === "resources")) bad("Input " + field.name + " has the wrong binding shape.");
    const values = bindingValues(binding);
    if (field.maxItems !== undefined && values.length > field.maxItems) bad("Input " + field.name + " has too many references.");
    for (const value of values) {
      if ("value" in value) {
        const valid = field.kind === "choice" ? field.choices?.some(choice => choice === value.value)
          : typeof value.value === field.kind || (field.kind === "text" && typeof value.value === "string");
        if (!valid) bad("Input " + field.name + " has an invalid literal.");
      } else {
        if (value.personReference !== undefined && field.personReference !== true) bad("Input " + field.name + " does not accept person classification.");
        if ("media" in value && field.kind !== "resource" && field.kind !== "resources") bad("Input " + field.name + " takes a value.");
        if ("from" in value) {
          const source = document.nodes.find(candidate => candidate.id === value.from.node)!;
          if ("media" in source) {
            if (value.from.output !== "media" || (field.kind !== "resource" && field.kind !== "resources")) bad("Link requires a compatible Media output.");
          } else {
            const model = this.#models.get(source.capability);
            if (model === undefined) continue;
            const output = get(model.outputs, value.from.output);
            if (output === undefined) bad("Source does not expose output " + value.from.output + ".");
            if (field.media !== undefined && output?.media !== field.media) bad("Source output does not supply " + field.media + " media.");
          }
        }
      }
    }
  }

  async validate(before: CanvasDocument, after: CanvasDocument): Promise<void> {
    const previousNodes = new Map(before.nodes.map(node => [node.id, node]));
    for (const node of after.nodes) {
      if (!("capability" in node)) continue;
      const previous = previousNodes.get(node.id);
      const recipeChanged = previous === undefined || !("capability" in previous) || previous.capability !== node.capability;
      if (recipeChanged) this.#model(node);
      const model = this.#models.get(node.capability);
      if (model?.authoring !== undefined) {
        for (const [name, binding] of Object.entries(node.inputs)) {
          const old = previous && "capability" in previous ? get(previous.inputs, name) : undefined;
          const changedSource = bindingValues(binding).some(value => {
            if (!("from" in value)) return false;
            const prior = previousNodes.get(value.from.node);
            const next = after.nodes.find(node => node.id === value.from.node);
            return prior && next && "capability" in prior && "capability" in next && prior.capability !== next.capability;
          });
          if (!recipeChanged && !changedSource && JSON.stringify(old) === JSON.stringify(binding)) continue;
          const field = model.authoring.find(field => field.name === name);
          if (field === undefined) throw new CanvasError("invalid-input", "Model has no input " + name + ".", { node: node.id, input: name });
          this.#validateBinding(after, node, field, binding);
        }
      }
      const results = get(after.results, node.id);
      const priorResults = get(before.results, node.id);
      for (const address of results?.invocations ?? []) {
        if (attached(priorResults, address)) continue;
        const invocation = await (await client(this.#context, address.environment)).get(address);
        if (invocation?.capability !== node.capability) {
          throw new CanvasError("incompatible-invocation", "Attach an existing Invocation for this Model.", { node: node.id });
        }
      }
      for (const [port, selection] of Object.entries(results?.selected ?? {})) {
        if (!recipeChanged && JSON.stringify(get(priorResults?.selected, port)) === JSON.stringify(selection)) continue;
        const definition = model && get(model.outputs, port);
        if (definition === undefined) throw new CanvasError("missing-output", "Model has no output " + port + ".", { node: node.id });
        const { output, resource } = await this.#output(selection);
        if (output.type !== definition.type || (definition.media !== undefined && resource?.mediaType.startsWith(definition.media + "/") !== true)) {
          throw new CanvasError("incompatible-publication", "Publication does not match output " + port + ".", { node: node.id });
        }
      }
    }
  }

  async openMedia(reference: MediaReference) {
    const { resource, interpretation } = await this.#context.media.resolveMedia(reference, createNodeProjectResourceResolver(this.#context.boundary.root));
    const duration = interpretation.domain?.duration;
    const durationSeconds = duration === undefined ? undefined
      : Number(duration.ticks) * duration.timeBase.numerator / duration.timeBase.denominator;
    return { mediaType: resource.mediaType,
      ...(durationSeconds === undefined || durationSeconds <= 0 || !Number.isFinite(durationSeconds) ? {} : { durationSeconds }), ...(resource.size === undefined ? {} : { size: resource.size }),
      bytes: (async function* () { yield* createReadStream(resource.address); })() } satisfies ExecutionResourceSource & { durationSeconds?: number };
  }

  async #prepare(snapshot: CanvasSnapshot, options: PrepareOptions, execution: ExecutionClient) {
    const node = recipe(snapshot.document, options.node);
    const model = this.#model(node);
    const supported = execution.capabilities().find(value => value.capability === model.id);
    if (supported === undefined || (options.endpoint !== undefined && !supported.endpoints.includes(options.endpoint))) {
      throw new CanvasError("unavailable-capability", `Environment ${execution.environment} cannot execute ${model.id} with this Endpoint.`, { node: node.id });
    }
    const inputs = new Map<string, ExecutionResourceSource & { durationSeconds?: number }>();
    const sources: BindingSource[] = [];
    function stage(resource: ExecutionResourceSource & { durationSeconds?: number }, personReference?: boolean): JsonValue {
      const key = "input-" + (inputs.size + 1);
      inputs.set(key, resource);
      return { resource: key, ...(personReference === undefined ? {} : { personReference }) };
    }
    const entries: [string, JsonValue][] = [];
    for (const [name, binding] of Object.entries(node.inputs)) {
      const values: JsonValue[] = [];
      const field = model.authoring?.find(field => field.name === name);
      for (const [index, value] of bindingValues(binding).entries()) {
        const source = { input: name, index, binding: value };
        try {
          if (field?.personReference && !("value" in value) && value.personReference === undefined) {
            throw new CanvasError("reference-classification-required", "Indicate whether the reference in " + name + " depicts a person.");
          }
          if ("value" in value) values.push(value.value);
          else if ("media" in value) values.push(stage(await this.openMedia(value.media), value.personReference));
          else {
            const upstream = snapshot.document.nodes.find(candidate => candidate.id === value.from.node)!;
            if ("media" in upstream && value.from.output === "media") values.push(stage(await this.openMedia(upstream.media), value.personReference));
            else {
              const selection = get(get(snapshot.document.results, value.from.node)?.selected, value.from.output);
              if (selection === undefined) throw new CanvasError("missing-selection", `Select output ${value.from.output} on ${value.from.node} before using ${name}.`);
              const { output, resource, execution: origin } = await this.#output(selection);
              values.push(resource === undefined ? output.value : stage({
                mediaType: resource.mediaType, size: resource.size,
                bytes: (async function* () { yield* (await origin.openResource(selection.address, selection.output, selection.resource!)).bytes; })(),
              }, value.personReference));
              sources.push({ ...source, selection });
              continue;
            }
          }
          sources.push(source);
        } catch (error) {
          throw new CanvasError(error instanceof CanvasError ? error.code : "input-unavailable", errorMessage(error), { node: node.id, input: name });
        }
      }
      entries.push([name, "items" in binding ? values : values[0]!]);
    }
    for (const field of model.authoring ?? []) {
      if (field.default !== undefined && get(node.inputs, field.name) === undefined) entries.push([field.name, field.default]);
    }
    const metadata: QuoteInputs = Object.fromEntries([...inputs].map(([key, { mediaType, size, durationSeconds }]) =>
      [key, { mediaType, ...(size === undefined ? {} : { size }), ...(durationSeconds === undefined ? {} : { durationSeconds }) }]));
    let input: JsonValue;
    try {
      input = model.readRequest(Object.fromEntries(entries));
      model.checkInputs?.(input, metadata);
    } catch (error) { throw new CanvasError("invalid-request", errorMessage(error), { node: node.id }); }
    const request: InvocationRequest = { capability: model.id, input, ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }) };
    return { execution, request, inputs: Object.fromEntries(inputs), metadata, sources };
  }

  async quote(snapshot: CanvasSnapshot, value: unknown, signal?: AbortSignal) {
    const options = readPrepare(value);
    requireRevision(snapshot, options.expectedRevision);
    const prepared = await this.#prepare(snapshot, options, await client(this.#context, options.environment));
    return { revision: snapshot.revision, sources: prepared.sources,
      quote: await prepared.execution.quote(prepared.request, { inputs: prepared.metadata, ...(signal === undefined ? {} : { signal }) }) };
  }

  async invoke(service: CanvasService, value: unknown, signal?: AbortSignal) {
    const options = readPrepare(value, true);
    const execution = await client(this.#context, options.environment);
    const address = readAddress({ environment: execution.environment, invocation: options.invocation ?? randomUUID() });
    const snapshot = await service.refresh();
    const existing = () => execution.get(address);
    const status = (revision: string, observation: Awaited<ReturnType<typeof existing>>) => ({
      revision, address, admission: observation === undefined ? "unconfirmed" as const : "accepted" as const,
      ...(observation === undefined ? {} : { observation }),
    });
    if (attached(get(snapshot.document.results, options.node), address)) return status(snapshot.revision, await existing());
    requireRevision(snapshot, text(options.expectedRevision, "Expected revision"));
    const prepared = await this.#prepare(snapshot, options, execution);
    const observation = await existing();
    if (observation !== undefined) {
      const latest = service.snapshot();
      if (attached(get(latest.document.results, options.node), address)) return status(latest.revision, observation);
      throw new CanvasError("invocation-conflict", "This Invocation ID already exists in the Environment.");
    }
    signal?.throwIfAborted();
    const reservation = await service.reserve(options.node, address, snapshot.revision);
    if (!reservation.reserved) return status(reservation.revision, await existing());
    try {
      await execution.start(prepared.request, { invocation: address.invocation, inputs: prepared.inputs, ...(signal === undefined ? {} : { signal }) });
      return { revision: reservation.revision, address, admission: "accepted" as const };
    } catch (error) {
      const observed = await existing().catch(() => undefined);
      if (error instanceof InvocationIdentityConflict) {
        return { revision: reservation.revision, address, admission: "rejected" as const, issue: error.message };
      }
      return { ...status(reservation.revision, observed), issue: errorMessage(error) };
    }
  }

  async history(document: CanvasDocument, node: string) {
    recipe(document, node);
    const addresses = get(document.results, node)?.invocations ?? [];
    return await Promise.all(addresses.map(async address => {
      try {
        const execution = await client(this.#context, address.environment);
        const observation = await execution.get(address);
        const publication = observation?.phase === "complete" ? await execution.publication(address) : undefined;
        return { address, phase: observation?.phase ?? "unconfirmed", observation,
          ...(publication === undefined ? {} : { publication: projection(publication) }) };
      } catch (error) { return { address, phase: "unavailable" as const, issue: errorMessage(error) }; }
    }));
  }

  async cancel(document: CanvasDocument, node: string, address: InvocationAddress) {
    if (!attached(get(document.results, node), address)) throw new CanvasError("missing-attachment", "Invocation is not attached to this recipe.");
    return await (await client(this.#context, address.environment)).cancel(address);
  }

  async openOutput(document: CanvasDocument, node: string, selection: CanvasSelection) {
    if (!attached(get(document.results, node), selection.address)) throw new CanvasError("missing-attachment", "Invocation is not attached to this recipe.");
    if (selection.resource === undefined) throw new CanvasError("missing-resource", "Select a named Publication resource.");
    const { execution } = await this.#output(selection);
    return await execution.openResource(selection.address, selection.output, selection.resource);
  }

  async adopt(document: CanvasDocument, value: unknown, signal?: AbortSignal) {
    const fields = record(value, "Canvas adoption", ["node", "selection", "target"]);
    const node = identity(fields.node, "Node ID");
    const selection = readSelection(fields.selection);
    const target = record(fields.target, "Canvas adoption target", ["kind", "path"]);
    if (!attached(get(document.results, node), selection.address)) throw new CanvasError("missing-attachment", "Invocation is not attached to this recipe.");
    const { resource, execution } = await this.#output(selection);
    if (target.kind !== "media" || selection.resource === undefined || resource === undefined) {
      throw new CanvasError("missing-resource", "Media adoption requires a named Publication resource.");
    }
    const extension = mediaFileExtension(resource.mediaType);
    if (extension === undefined) throw new CanvasError("incompatible-publication", "Unsupported Media type " + resource.mediaType + ".");
    const media = this.#context.media;
    if (!(media instanceof NodeProjectMediaService)) throw new CanvasError("unavailable-owner", "Project Media file adoption is unavailable.");
    const destination = target.path === undefined ? undefined : readMediaReference({ path: target.path });
    const dir = await mkdtemp(join(tmpdir(), "hypit-canvas-"));
    const name = node + "-" + selection.resource + "." + extension;
    const file = join(dir, "output." + extension);
    try {
      const source = await execution.openResource(selection.address, selection.output, selection.resource);
      await pipeline(source.bytes, createWriteStream(file, { flags: "wx" }), signal === undefined ? {} : { signal });
      const result = await media.adoptFile({ sourcePath: file, sourceName: name, mediaType: resource.mediaType,
        ...(destination === undefined ? {} : { target: destination }) }, {
        inspect: (path, context) => inspectMediaFileForAdoption(path, resource.mediaType, {
          ...this.#inspectOptions, ...(context.signal === undefined ? {} : { signal: context.signal }),
        }),
        select: inspection => defaultMediaSelection(inspection, resource.mediaType),
      }, signal === undefined ? {} : { signal });
      return { kind: "media" as const, reference: result.reference };
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
}

function projection(publication: Publication) {
  return {
    capability: publication.capability, publishedAt: publication.publishedAt,
    outputs: Object.fromEntries(Object.entries(publication.outputs).map(([name, output]) => [name, {
      type: output.type, resources: Object.fromEntries(Object.entries(output.resources).map(([id, { mediaType, size }]) =>
        [id, { mediaType, size }])),
    }])),
  };
}

function readPrepare(value: unknown, invoke = false) {
  const fields = record(value, "Canvas action", ["node", "environment", "expectedRevision", "endpoint", ...(invoke ? ["invocation"] : [])]);
  return {
    node: identity(fields.node, "Node ID"),
    ...(fields.environment === undefined ? {} : { environment: identity(fields.environment, "Environment ID") }),
    ...(fields.expectedRevision === undefined ? {} : { expectedRevision: text(fields.expectedRevision, "Expected revision") }),
    ...(fields.endpoint === undefined ? {} : { endpoint: text(fields.endpoint, "Endpoint") }),
    ...(fields.invocation === undefined ? {} : { invocation: text(fields.invocation, "Invocation ID") }),
  };
}

function requireRevision(snapshot: CanvasSnapshot, expected?: string): void {
  if (expected !== undefined && snapshot.revision !== expected) {
    throw new CanvasError("revision-conflict", "Canvas changed. Inspect the current revision and retry.");
  }
}
