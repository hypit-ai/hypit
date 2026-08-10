import type {
  CanonicalValue,
  ModuleManifest,
  ProducerDeclaration,
  TypeRef,
  ValueSchema,
} from "../svml.js";

/**
 * What the compiler already says about itself.
 *
 * Nothing here lists components. A module is previewable because it declares a
 * Producer that outputs a VisualTrack — that is what "puts pixels on the frame"
 * means, and the manifests already say it. A module added tomorrow appears here
 * without this file changing, and one that stops emitting a VisualTrack
 * disappears without anybody remembering to remove it.
 */

const VISUAL_TRACK = { module: "@narratage/composition", name: "VisualTrack" } as const;

type BoundProducer = {
  readonly producer: { readonly name: string };
  readonly handler: (invocation: {
    readonly inputs: Readonly<Record<string, { readonly value: unknown } | undefined>>;
  }) => { readonly outputs: Readonly<Record<string, { readonly value: unknown }>> };
};

/**
 * What a module says an author may write, and what writing it does.
 *
 * Nothing here reads a Recipe or knows one's shape: the module states both, so
 * a form can be built and a frame drawn without this file learning what a
 * caption or a card is.
 */
export type BoundRecipe = {
  readonly surface: string;
  readonly schema: ValueSchema;
  readonly apply: (
    properties: Readonly<Record<string, CanonicalValue>>,
    current: Readonly<Record<string, CanonicalValue>>,
  ) => Readonly<Record<string, CanonicalValue>>;
};

type ComponentModule = {
  readonly name: string;
  readonly producers: readonly BoundProducer[];
  readonly recipes?: readonly BoundRecipe[];
};

export type PreviewInput = {
  readonly name: string;
  readonly type: TypeRef;
  readonly schema: ValueSchema | undefined;
  /** The declaring module's own default, where it has one it can honestly give. */
  readonly initial: CanonicalValue | undefined;
};

export type PreviewProducer = {
  readonly id: string;
  readonly label: string;
  readonly moduleName: string;
  readonly inputs: readonly PreviewInput[];
  readonly outputName: string;
  readonly invoke: (values: Readonly<Record<string, CanonicalValue>>) => unknown;
  /** Empty where the module publishes no Recipe, which is a fact about it. */
  readonly recipes: readonly BoundRecipe[];
};

function typeKey(ref: TypeRef): string {
  return `${ref.module.name}::${ref.name}`;
}

function outputsVisualTrack(producer: ProducerDeclaration): boolean {
  return producer.outputs.some((port) =>
    port.type.name === VISUAL_TRACK.name && port.type.module.name === VISUAL_TRACK.module);
}

/**
 * Names a producer by its module, and by itself only when its module offers a
 * choice.
 *
 * A producer name alone is often meaningless out of context — `project-visual`
 * says nothing — while a module name alone is ambiguous where one module emits
 * more than one Track.
 */
function label(moduleName: string, producer: ProducerDeclaration, siblings: number): string {
  const short = moduleName.replace(/^@narratage\//u, "");
  if (siblings < 2) return short;
  const rest = producer.name
    .replace(/^(?:render|project|compile)-/u, "")
    .replace(new RegExp(`^${short}-`, "u"), "");
  return `${short} ${rest}`;
}

/**
 * Loads every workspace module and keeps the ones a browser can run.
 *
 * A module whose manifest or component cannot be imported here — because it
 * reaches for a filesystem, a process or a network — is simply not previewable.
 * That is a fact about the module, not a list to maintain, so it is discovered
 * rather than declared.
 */
export type ModuleLoader = () => Promise<unknown>;

export type PreviewSources = {
  readonly manifests: Readonly<Record<string, ModuleLoader>>;
  readonly components: Readonly<Record<string, ModuleLoader>>;
};

export async function discoverPreviewProducers(
  sources: PreviewSources,
): Promise<readonly PreviewProducer[]> {
  // Keyed by module name: an entry file re-exports its own manifest, so the
  // same module arrives more than once and must be counted once.
  const byName = new Map<string, ModuleManifest>();
  for (const load of Object.values(sources.manifests)) {
    try {
      const module = await load() as Record<string, unknown>;
      for (const value of Object.values(module)) {
        if (isManifest(value) && !byName.has(value.name)) byName.set(value.name, value);
      }
    } catch {
      /* Not loadable here, therefore not previewable here. */
    }
  }
  const manifests = [...byName.values()];

  // Input types belong to whichever module declares them, which is often not
  // the module that produces the Track — a ProgramSpace comes from elsewhere.
  const types = new Map<string, { schema: ValueSchema; default?: CanonicalValue }>();
  for (const manifest of manifests) {
    for (const declaration of manifest.types) {
      types.set(`${manifest.name}::${declaration.name}`, declaration);
    }
  }

  const components = new Map<string, ComponentModule>();
  for (const load of Object.values(sources.components)) {
    try {
      const module = await load() as Record<string, unknown>;
      for (const value of Object.values(module)) {
        if (isComponent(value) && !components.has(value.name)) components.set(value.name, value);
      }
    } catch {
      /* Same: a component that cannot load here cannot be previewed here. */
    }
  }

  const found: PreviewProducer[] = [];
  for (const manifest of manifests) {
    const visual = manifest.producers.filter(outputsVisualTrack);
    const component = components.get(manifest.name);
    for (const declaration of visual) {
      const bound = component?.producers.find((entry) => entry.producer.name === declaration.name);
      // A declared Producer with no bound handler is declared but not runnable.
      if (bound === undefined) continue;
      const outputName = declaration.outputs.find((port) =>
        port.type.name === VISUAL_TRACK.name)!.name;

      found.push({
        id: `${manifest.name}#${declaration.name}`,
        label: label(manifest.name, declaration, visual.length),
        moduleName: manifest.name,
        outputName,
        recipes: component?.recipes ?? [],
        inputs: declaration.inputs.map((port) => {
          const declared = types.get(typeKey(port.type));
          return {
            name: port.name,
            type: port.type,
            schema: declared?.schema,
            initial: declared?.default,
          };
        }),
        invoke: (values) => bound.handler({
          inputs: Object.fromEntries(Object.entries(values)
            .map(([name, value]) => [name, { value: { kind: "inline", value } }])),
        }).outputs[outputName]?.value,
      });
    }
  }
  return found.sort((left, right) => left.label.localeCompare(right.label));
}

function isManifest(value: unknown): value is ModuleManifest {
  return value !== null && typeof value === "object"
    && (value as { format?: unknown }).format === "svml.module@1";
}

function isComponent(value: unknown): value is ComponentModule {
  return value !== null && typeof value === "object"
    && typeof (value as { name?: unknown }).name === "string"
    && Array.isArray((value as { producers?: unknown }).producers);
}
