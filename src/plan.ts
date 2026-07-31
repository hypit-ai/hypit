import { fail } from "./diagnostics.js";
import type {
  AttributeValue,
  PlanIR,
  PlanInstance,
  PlanValue,
  NarrativeIR,
  Reference,
  SourceDocument,
  SourceElement,
  SourceNode,
} from "./model.js";
import type {
  KernelChildSchema,
  KernelManifest,
  KernelPort,
  KernelRegistry,
} from "./kernel.js";
import { childElements, textContent, walkElements } from "./source/query.js";
import { portableFileIdentity, sha256 } from "./util.js";

const VALUE_TYPES: Record<string, PlanValue["type"]> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  text: "Text",
  alignment: "AlignmentEvidence",
};

function idOf(element: SourceElement): string {
  const id = element.attributes.id;
  if (typeof id !== "string" || !/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(id)) {
    fail("plan_declaration_id", `<${element.name}> requires a stable id.`);
  }
  return id;
}

function referencesIn(nodes: SourceNode[], attributes: SourceElement["attributes"]): Array<{
  path: string;
  via: string;
}> {
  const output: Array<{ path: string; via: string }> = [];
  for (const [name, value] of Object.entries(attributes)) {
    if (value && typeof value === "object" && value.kind === "reference") {
      output.push({ path: value.path, via: name });
    }
  }
  for (const element of walkElements(nodes)) {
    for (const [name, value] of Object.entries(element.attributes)) {
      if (value && typeof value === "object" && value.kind === "reference") {
        output.push({ path: value.path, via: `${element.name}.${name}` });
      }
    }
  }
  return output;
}

function dependencyOf(path: string, declarationIds: Set<string>): string | undefined {
  if (path.startsWith("script.")) return undefined;
  const candidates = [...declarationIds].filter(
    (id) => path === id || path.startsWith(`${id}.`),
  );
  return candidates.sort((left, right) => right.length - left.length)[0];
}

function cardinalityAccepts(cardinality: string, count: number): boolean {
  if (cardinality === "one") return count === 1;
  if (cardinality === "zero-or-one") return count <= 1;
  if (cardinality === "one-or-more") return count >= 1;
  if (cardinality === "zero-or-more") return true;
  fail("kernel_cardinality", `Unknown cardinality "${cardinality}".`);
}

function scalarAccepts(type: string, value: AttributeValue): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "id") {
    return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(value);
  }
  if (type === "ProgramSpan" || type === "ProgramPoint") return typeof value === "string";
  if (type === "duration") {
    return typeof value === "string" && /^[+-]?\d+(?:\.\d+)?(?:ms|s)$/u.test(value);
  }
  if (type === "SourceRange") {
    return typeof value === "string" && /^\s*\d+(?:\.\d+)?(?:ms|s)\s*\.\.\s*\d+(?:\.\d+)?(?:ms|s)\s*$/u.test(value);
  }
  const enumValues = /^enum\((.+)\)$/u.exec(type)?.[1]?.split(",");
  if (enumValues) return typeof value === "string" && enumValues.includes(value);
  return false;
}

function validateTypedValue(
  value: AttributeValue,
  type: string,
  source: string,
): void {
  if (value && typeof value === "object" && value.kind === "reference") return;
  if (type.split("|").some((candidate) => scalarAccepts(candidate, value))) return;
  fail("kernel_field_type", `${source} expects ${type}.`);
}

function validateChild(
  element: SourceElement,
  schema: KernelChildSchema,
  owner: string,
): void {
  const allowed = new Set(["class", ...schema.fields.map((field) => field.name)]);
  for (const [name, value] of Object.entries(element.attributes)) {
    if (!allowed.has(name)) {
      fail(
        "kernel_field_unknown",
        `<${owner}> child <${element.name}> has unknown field "${name}".`,
      );
    }
    const field = schema.fields.find((candidate) => candidate.name === name);
    if (field) validateTypedValue(value, field.type, `<${owner}> <${element.name}>.${name}`);
  }
  for (const field of schema.fields) {
    if (field.required && element.attributes[field.name] === undefined) {
      fail(
        "kernel_field_required",
        `<${owner}> child <${element.name}> requires field "${field.name}".`,
      );
    }
  }
  const children = childElements(element);
  const text = element.children
    .filter((child) => child.kind === "text")
    .map((child) => child.value)
    .join("");
  if (!schema.text && text.trim()) {
    fail("kernel_child_text", `<${owner}> child <${element.name}> does not accept text content.`);
  }
  for (const child of children) {
    const childSchema = schema.children.find((candidate) => candidate.name === child.name);
    if (!childSchema) {
      fail(
        "kernel_child_unknown",
        `<${owner}> child <${element.name}> does not accept <${child.name}>.`,
      );
    }
    validateChild(child, childSchema, owner);
  }
  for (const childSchema of schema.children) {
    const count = children.filter((child) => child.name === childSchema.name).length;
    if (!cardinalityAccepts(childSchema.cardinality, count)) {
      fail(
        "kernel_child_cardinality",
        `<${owner}> <${element.name}> requires ${childSchema.cardinality} <${childSchema.name}> children; received ${count}.`,
      );
    }
  }
}

export function validateKernelShape(element: SourceElement, manifest: KernelManifest): void {
  const inputPorts = manifest.ports.filter((port) => port.direction === "input");
  const allowed = new Set([
    "id",
    "class",
    ...manifest.parameters.map((parameter) => parameter.name),
    ...inputPorts.map((port) => port.name),
  ]);
  for (const [name, value] of Object.entries(element.attributes)) {
    if (!allowed.has(name)) {
      fail("kernel_parameter_unknown", `<${manifest.name}> has unknown parameter or port "${name}".`);
    }
    const parameter = manifest.parameters.find((candidate) => candidate.name === name);
    if (parameter) validateTypedValue(value, parameter.type, `<${manifest.name}>.${name}`);
  }
  const children = childElements(element);
  const text = element.children
    .filter((child) => child.kind === "text")
    .map((child) => child.value)
    .join("");
  if (text.trim()) {
    fail("kernel_root_text", `<${manifest.name}> does not accept direct text content.`);
  }
  for (const child of children) {
    const schema = manifest.children.find((candidate) => candidate.name === child.name);
    if (!schema) {
      fail("kernel_child_unknown", `<${manifest.name}> does not accept <${child.name}>.`);
    }
    validateChild(child, schema, manifest.name);
  }
  for (const schema of manifest.children) {
    const count = children.filter((child) => child.name === schema.name).length;
    if (!cardinalityAccepts(schema.cardinality, count)) {
      fail(
        "kernel_child_cardinality",
        `<${manifest.name}> requires ${schema.cardinality} <${schema.name}> children; received ${count}.`,
      );
    }
  }
  for (const port of inputPorts) {
    const count = manifest.children.some((schema) => schema.name === port.name)
      ? children.filter((child) => child.name === port.name).length
      : element.attributes[port.name] === undefined ? 0 : 1;
    if (!cardinalityAccepts(port.cardinality, count)) {
      fail(
        "kernel_port_cardinality",
        `<${manifest.name}> input "${port.name}" requires ${port.cardinality}; received ${count}.`,
      );
    }
  }
}

function outputPortForPath(
  manifest: KernelManifest | undefined,
  tail: string,
): KernelPort | undefined {
  if (!manifest || !tail) return undefined;
  const target = tail.split(".");
  return manifest.ports
    .filter((port) => port.direction === "output")
    .filter((port) => {
      const pattern = port.name.split(".");
      return pattern.length === target.length
        && pattern.every((part, index) => part === "*" || part === target[index]);
    })
    .sort((left, right) => {
      const leftWildcards = left.name.split(".").filter((part) => part === "*").length;
      const rightWildcards = right.name.split(".").filter((part) => part === "*").length;
      return leftWildcards - rightWildcards;
    })[0];
}

function childField(
  schemas: KernelChildSchema[],
  elementName: string,
  fieldName: string,
): KernelChildSchema["fields"][number] | undefined {
  for (const schema of schemas) {
    if (schema.name === elementName) {
      const field = schema.fields.find((candidate) => candidate.name === fieldName);
      if (field) return field;
    }
    const nested = childField(schema.children, elementName, fieldName);
    if (nested) return nested;
  }
  return undefined;
}

function expectedReferenceType(
  manifest: KernelManifest | undefined,
  via: string,
): { name: string; type: string } | undefined {
  if (!manifest) return undefined;
  if (!via.includes(".")) {
    const port = manifest.ports.find(
      (candidate) => candidate.direction === "input" && candidate.name === via,
    );
    return port ? { name: port.name, type: port.type } : undefined;
  }
  const [elementName, fieldName] = via.split(".");
  if (!elementName || !fieldName) return undefined;
  const field = childField(manifest.children, elementName, fieldName);
  return field ? { name: via, type: field.type } : undefined;
}

function compatibleType(actual: string, expected: string): boolean {
  return expected.split("|").includes(actual);
}

export function buildPlan(
  document: SourceDocument,
  kernels: KernelRegistry,
  narrative: NarrativeIR,
): PlanIR {
  const declarations = childElements(document.root).filter(
    (element) => !["import", "script"].includes(element.name),
  );
  const ids = declarations.map(idOf);
  const unique = new Set(ids);
  if (unique.size !== ids.length) fail("plan_duplicate_id", "Declaration ids must be unique.");

  const values: PlanValue[] = [];
  const instances: PlanInstance[] = [];
  for (const element of declarations) {
    const id = idOf(element);
    const module = element.origin?.file ?? document.file;
    const localId = element.origin?.localId ?? id;
    const moduleIdentity = portableFileIdentity(document.file, module);
    const type = VALUE_TYPES[element.name];
    if (type) {
      const src = element.attributes.src;
      const value = element.name === "text" ? textContent(element).trim() : undefined;
      if (element.name !== "text" && typeof src !== "string") {
        fail("plan_value_source", `<${element.name} id="${id}"> requires src.`);
      }
      values.push({
        id,
        type,
        ...(typeof src === "string" ? { source: src } : {}),
        ...(value !== undefined ? { value } : {}),
        identity: sha256(`${moduleIdentity}\0${localId}`),
        module,
        localId,
      });
      continue;
    }
    const manifest = kernels.get(element.name);
    if (!manifest) {
      fail(
        "plan_unknown_kernel",
        `No imported .svk defines <${element.name}>.`,
      );
    }
    validateKernelShape(element, manifest);
    const dependencies = referencesIn(element.children, element.attributes)
      .map((reference) => dependencyOf(reference.path, unique))
      .filter((value): value is string => value !== undefined && value !== id);
    const defaultAttributes = Object.fromEntries(manifest.parameters
      .filter((parameter) => parameter.defaultValue !== undefined)
      .map((parameter) => [parameter.name, parameter.defaultValue!]));
    const attributes = { ...defaultAttributes, ...element.attributes };
    const effectiveParameters = Object.fromEntries(manifest.parameters.flatMap((parameter) => {
      const value = attributes[parameter.name];
      if (value === undefined) return [];
      const sources = [
        ...(parameter.defaultValue !== undefined
          ? [{
              kind: "kernel-default" as const,
              source: manifest.sourcePath,
              value: parameter.defaultValue,
            }]
          : []),
        ...(element.parameterSources?.[parameter.name] ?? (
          element.attributes[parameter.name] !== undefined
            ? [{
                kind: "instance" as const,
                source: module,
                value: element.attributes[parameter.name]!,
              }]
            : []
        )),
      ];
      return [[parameter.name, { value, sources }]];
    }));
    instances.push({
      id,
      kernel: manifest.name,
      identity: sha256(`${moduleIdentity}\0${localId}`),
      module,
      localId,
      attributes,
      effectiveParameters,
      children: element.children,
      dependencies: [...new Set(dependencies)],
      ...(element.origin?.expansionDigest
        ? { expansionDigest: element.origin.expansionDigest }
        : {}),
      ...(element.origin?.callSite && element.origin.definitionSite
        ? {
            sourceMap: {
              callSite: element.origin.callSite,
              definitionSite: element.origin.definitionSite,
            },
          }
        : {}),
    });
  }

  const rootCandidates = instances.filter((instance) => kernels.get(instance.kernel)?.root);
  if (rootCandidates.length !== 1) {
    fail(
      "plan_root_cardinality",
      `Expected exactly one root Kernel instance, received ${rootCandidates.length}.`,
    );
  }
  const root = rootCandidates[0]?.id;
  if (!root) fail("plan_root_missing", "Plan root is missing.");

  const instanceIds = new Set(instances.map((instance) => instance.id));
  const valueIds = new Set(values.map((value) => value.id));
  for (const instance of instances) {
    for (const reference of referencesIn(instance.children, instance.attributes)) {
      const consumerManifest = kernels.get(instance.kernel);
      const expected = expectedReferenceType(consumerManifest, reference.via);
      if (reference.path === "script") {
        if (expected && !compatibleType("NarrativeIR", expected.type)) {
          fail(
            "plan_port_type",
            `Reference "script" produces NarrativeIR, but ${instance.id}.${expected.name} requires ${expected.type}.`,
          );
        }
        continue;
      }
      if (reference.path.startsWith("script.")) {
        const temporal = /^(selection|moment|segment)\.([A-Za-z_][A-Za-z0-9_.-]*)$/u.exec(
          reference.path.slice("script.".length),
        );
        const exists = temporal?.[1] === "selection"
          ? narrative.selections[temporal[2]!] !== undefined
          : temporal?.[1] === "moment"
            ? narrative.moments[temporal[2]!] !== undefined
            : temporal?.[1] === "segment"
              ? narrative.segments.some((segment) => segment.id === temporal[2])
              : false;
        if (!exists) {
          fail(
            "plan_script_reference",
            `Instance "${instance.id}" references unknown Script path "${reference.path}".`,
          );
        }
        const actualType = temporal?.[1] === "selection"
          ? "SelectionSet"
          : temporal?.[1] === "moment"
            ? "MomentSet"
            : "ScriptSegment";
        if (expected && !compatibleType(actualType, expected.type)) {
          fail(
            "plan_port_type",
            `Reference "${reference.path}" produces ${actualType}, but ${instance.id}.${expected.name} requires ${expected.type}.`,
          );
        }
        continue;
      }
      const dependency = dependencyOf(reference.path, unique);
      if (!dependency) {
        fail(
          "plan_reference_unknown",
          `Instance "${instance.id}" references unknown declaration "${reference.path}".`,
        );
      }
      if (valueIds.has(dependency)) {
        if (reference.path !== dependency) {
          fail(
            "plan_value_projection",
            `Value "${dependency}" has no output path "${reference.path.slice(dependency.length + 1)}".`,
          );
        }
        const value = values.find((candidate) => candidate.id === dependency);
        if (value && expected && !compatibleType(value.type, expected.type)) {
          fail(
            "plan_port_type",
            `Reference "${reference.path}" produces ${value.type}, but ${instance.id}.${expected.name} requires ${expected.type}.`,
          );
        }
        continue;
      }
      const producer = instances.find((candidate) => candidate.id === dependency);
      const manifest = producer ? kernels.get(producer.kernel) : undefined;
      const tail = reference.path === dependency
        ? ""
        : reference.path.slice(dependency.length + 1);
      const outputPort = outputPortForPath(manifest, tail);
      if (!outputPort) {
        fail(
          "plan_output_port",
          `Reference "${reference.path}" does not name an output port of "${dependency}".`,
        );
      }
      if (expected && !compatibleType(outputPort.type, expected.type)) {
        fail(
          "plan_port_type",
          `Reference "${reference.path}" produces ${outputPort.type}, but ${instance.id}.${expected.name} requires ${expected.type}.`,
        );
      }
    }
  }

  const edges: PlanIR["edges"] = [];
  for (const instance of instances) {
    for (const reference of referencesIn(instance.children, instance.attributes)) {
      const dependency = dependencyOf(reference.path, unique);
      if (!dependency) continue;
      if (instanceIds.has(dependency) || valueIds.has(dependency)) {
        const producer = instances.find((candidate) => candidate.id === dependency);
        const producerManifest = producer ? kernels.get(producer.kernel) : undefined;
        const tail = producer && reference.path !== dependency
          ? reference.path.slice(dependency.length + 1)
          : undefined;
        const outputPort = tail
          ? outputPortForPath(producerManifest, tail)
          : undefined;
        const value = values.find((candidate) => candidate.id === dependency);
        const consumerManifest = kernels.get(instance.kernel);
        const input = expectedReferenceType(consumerManifest, reference.via);
        edges.push({
          from: dependency,
          to: instance.id,
          via: reference.via,
          ...(outputPort ? { fromPort: outputPort.name } : value ? { fromPort: "value" } : {}),
          ...(input ? { toPort: input.name } : { toPort: reference.via }),
          ...(outputPort?.type
            ? { type: outputPort.type }
            : value
              ? { type: value.type }
              : {}),
        });
      }
    }
  }

  const reachable = new Set<string>();
  const visit = (id: string): void => {
    if (reachable.has(id)) return;
    reachable.add(id);
    const instance = instances.find((item) => item.id === id);
    for (const dependency of instance?.dependencies ?? []) visit(dependency);
  };
  visit(root);
  const reachableInstances = instances.filter((instance) => reachable.has(instance.id));
  const reachableEdges = edges.filter((edge) => reachable.has(edge.from) && reachable.has(edge.to));
  const rootManifest = kernels.get(rootCandidates[0]!.kernel)!;
  const basisInputs = rootManifest.ports.filter((port) =>
    port.direction === "input" && port.type.split("|").includes("TemporalBasisProduction"));
  const semanticInputs = rootManifest.ports.filter((port) =>
    port.direction === "input" && port.type.split("|").includes("ExactSemanticMap"));
  if (
    basisInputs.length !== 1
    || basisInputs[0]?.cardinality !== "one"
    || semanticInputs.length !== 1
    || semanticInputs[0]?.cardinality !== "one"
  ) {
    fail(
      "composition_temporal_contract",
      `Composition Kernel "${rootManifest.name}" must select exactly one TemporalBasisProduction and one ExactSemanticMap.`,
    );
  }
  const trackEdges = reachableEdges.filter((edge) => edge.type === "Track");
  const illegalTrackConsumer = trackEdges.find((edge) => edge.to !== root);
  if (illegalTrackConsumer) {
    fail(
      "track_terminal_contract",
      `Track "${illegalTrackConsumer.from}" is consumed by non-Composition instance "${illegalTrackConsumer.to}".`,
    );
  }
  const duplicateTrack = trackEdges.find((edge, index) =>
    trackEdges.findIndex((candidate) => candidate.from === edge.from && candidate.to === edge.to) !== index);
  if (duplicateTrack) {
    fail(
      "duplicate_track_in_composition",
      `Composition "${root}" references Track "${duplicateTrack.from}" more than once.`,
    );
  }
  const usedKernels = new Set(reachableInstances.map((instance) => instance.kernel));
  return {
    contract: "svml.plan.v1",
    source: document.file,
    values: values.filter((value) => reachable.has(value.id)),
    instances: reachableInstances,
    kernels: [...kernels.values()]
      .filter((manifest) => usedKernels.has(manifest.name))
      .map((manifest) => ({
        name: manifest.name,
        abiVersion: manifest.abiVersion,
        manifestHash: manifest.sourceHash,
        implementationHash: manifest.implementationHash,
        profile: manifest.profile,
        ...(manifest.capability ? { capability: manifest.capability } : {}),
        ports: manifest.ports,
        parameters: manifest.parameters,
        children: manifest.children,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    root,
    expansions: document.expansions ?? [],
    edges: reachableEdges,
  };
}

export function topologicalInstances(plan: PlanIR): PlanInstance[] {
  const byId = new Map(plan.instances.map((instance) => [instance.id, instance]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const output: PlanInstance[] = [];
  const visit = (id: string): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) fail("plan_cycle", `Cycle detected at "${id}".`);
    visiting.add(id);
    const instance = byId.get(id);
    if (!instance) return;
    for (const dependency of instance.dependencies) {
      if (byId.has(dependency)) visit(dependency);
    }
    visiting.delete(id);
    done.add(id);
    output.push(instance);
  };
  visit(plan.root);
  return output;
}

export function reference(value: unknown): Reference | undefined {
  return value && typeof value === "object" && (value as Reference).kind === "reference"
    ? value as Reference
    : undefined;
}
