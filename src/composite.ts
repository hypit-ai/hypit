import { pathToFileURL } from "node:url";
import { fail } from "./diagnostics.js";
import type { KernelManifest, KernelRegistry } from "./kernel.js";
import { validateKernelShape } from "./plan.js";
import type {
  AttributeValue,
  Reference,
  SourceDocument,
  SourceElement,
  SourceNode,
} from "./model.js";
import { childElements } from "./source/query.js";
import { sha256, stableJson } from "./util.js";

type LoopBinding = {
  name: string;
  value: SourceElement;
};

function reference(value: AttributeValue | undefined): Reference | undefined {
  return value && typeof value === "object" && value.kind === "reference"
    ? value
    : undefined;
}

function canonicalNode(node: SourceNode): unknown {
  if (node.kind === "text") return { kind: "text", value: node.value };
  return {
    kind: "element",
    name: node.name,
    attributes: node.attributes,
    children: node.children.map(canonicalNode),
  };
}

function localReference(path: string, outerId: string, localIds: Set<string>): Reference | undefined {
  const owner = [...localIds]
    .sort((left, right) => right.length - left.length)
    .find((candidate) => path === candidate || path.startsWith(`${candidate}.`));
  if (!owner) return undefined;
  return {
    kind: "reference",
    path: `${outerId}::${owner}${path.slice(owner.length)}`,
  };
}

function evaluate(
  value: AttributeValue,
  args: {
    outer: SourceElement;
    outerId: string;
    localIds: Set<string>;
    loop?: LoopBinding;
  },
): AttributeValue | undefined {
  const ref = reference(value);
  if (!ref) return value;
  const computedScript = /^ports\.([A-Za-z_][A-Za-z0-9_.:-]*)\.segment\[([A-Za-z_][A-Za-z0-9_.:-]*)\.id\]$/u
    .exec(ref.path);
  if (computedScript) {
    if (!args.loop || args.loop.name !== computedScript[2]) {
      fail("composite_expression", `Composite expression "${ref.path}" has no matching loop.`);
    }
    const script = reference(args.outer.attributes[computedScript[1]!]);
    const id = args.loop.value.attributes.id;
    if (!script || typeof id !== "string") {
      fail("composite_expression", `Composite expression "${ref.path}" requires Script and child id.`);
    }
    return { kind: "reference", path: `${script.path}.segment.${id}` };
  }
  const [head, ...tail] = ref.path.split(".");
  if (head === "params" || head === "ports") {
    const name = tail.join(".");
    return args.outer.attributes[name];
  }
  if (args.loop && head === args.loop.name) {
    return args.loop.value.attributes[tail.join(".")];
  }
  return localReference(ref.path, args.outerId, args.localIds) ?? ref;
}

function instantiateNode(
  template: SourceNode,
  args: {
    outer: SourceElement;
    outerId: string;
    localIds: Set<string>;
    aliases: ReadonlyMap<string, string>;
    expansionDigest: string;
    definitionFile: string;
    componentRoot: boolean;
    loop?: LoopBinding;
  },
): SourceNode[] {
  if (template.kind === "text") return template.value.trim() ? [{ ...template }] : [];
  if (template.name === "for") {
    const each = reference(template.attributes.each)?.path;
    const alias = template.attributes.as;
    const match = /^children\.([A-Za-z_][A-Za-z0-9_.:-]*)$/u.exec(each ?? "");
    if (!match || typeof alias !== "string") {
      fail("composite_for", "Composite <for> requires each={children.name} and a quoted as name.");
    }
    return childElements(args.outer, match[1]).flatMap((value) =>
      template.children.flatMap((child) => instantiateNode(child, {
        ...args,
        componentRoot: false,
        loop: { name: alias, value },
      })));
  }
  const name = args.componentRoot
    ? args.aliases.get(template.name) ?? template.name
    : template.name;
  const attributes = Object.fromEntries(Object.entries(template.attributes).flatMap(([key, value]) => {
    const evaluated = evaluate(value, args);
    if (evaluated === undefined) return [];
    if (key === "id" && args.componentRoot) {
      if (typeof evaluated !== "string") fail("composite_id", "Composite internal id must be literal.");
      return [[key, `${args.outerId}::${evaluated}`]];
    }
    return [[key, evaluated]];
  }));
  return [{
    ...template,
    name,
    attributes,
    children: template.children.flatMap((child) => instantiateNode(child, {
      ...args,
      componentRoot: false,
    })),
    origin: {
      file: args.outer.origin?.file ?? "",
      ...(typeof attributes.id === "string" ? { localId: attributes.id } : {}),
      expansionDigest: args.expansionDigest,
      callSite: {
        file: args.outer.origin?.file ?? "",
        start: args.outer.start,
        end: args.outer.end,
      },
      definitionSite: {
        file: args.definitionFile,
        start: template.start,
        end: template.end,
      },
    },
  }];
}

function rewriteReference(value: AttributeValue, aliases: ReadonlyMap<string, string>): AttributeValue {
  const ref = reference(value);
  if (!ref) return value;
  let path = ref.path;
  for (let pass = 0; pass < 32; pass += 1) {
    const owner = [...aliases.keys()]
      .sort((left, right) => right.length - left.length)
      .find((candidate) => path === candidate || path.startsWith(`${candidate}.`));
    if (!owner) break;
    const next = `${aliases.get(owner)!}${path.slice(owner.length)}`;
    if (next === path) break;
    path = next;
  }
  return { kind: "reference", path };
}

function rewriteNode(node: SourceNode, aliases: ReadonlyMap<string, string>): SourceNode {
  if (node.kind === "text") return node;
  return {
    ...node,
    attributes: Object.fromEntries(Object.entries(node.attributes)
      .map(([name, value]) => [name, rewriteReference(value, aliases)])),
    children: node.children.map((child) => rewriteNode(child, aliases)),
  };
}

function expandOne(
  element: SourceElement,
  manifest: KernelManifest,
): {
  nodes: SourceElement[];
  aliases: Record<string, string>;
  expansion: NonNullable<SourceDocument["expansions"]>[number];
} {
  const outerId = element.attributes.id;
  if (typeof outerId !== "string") fail("composite_id", `<${manifest.name}> requires a stable id.`);
  validateKernelShape(element, manifest);
  const compose = manifest.compose;
  if (!compose) fail("composite_shape", `Composite "${manifest.name}" has no compose body.`);
  const templates = childElements(compose).filter((child) => child.name !== "export");
  const localIds = new Set(templates.flatMap((template) => {
    const id = template.attributes.id;
    return typeof id === "string" ? [id] : [];
  }));
  const expansionDigest = sha256(stableJson({
    contract: "svml.composite-expansion.v1",
    manifestHash: manifest.sourceHash,
    instanceId: outerId,
    attributes: element.attributes,
    children: element.children.map(canonicalNode),
  }));
  const importAliases = new Map((manifest.compositeImports ?? []).map((item) => {
    if (!item.kernelName) fail("composite_import", `Composite import "${item.alias}" is unresolved.`);
    return [item.alias, item.kernelName];
  }));
  const nodes = templates.flatMap((template) => instantiateNode(template, {
    outer: element,
    outerId,
    localIds,
    aliases: importAliases,
    expansionDigest,
    definitionFile: manifest.sourcePath,
    componentRoot: true,
  })) as SourceElement[];
  const exports: Record<string, string> = {};
  for (const item of childElements(compose, "export")) {
    const port = item.attributes.port;
    const value = item.attributes.value;
    if (typeof port !== "string" || !reference(value)) {
      fail("composite_export", "Composite <export> requires port and reference value attributes.");
    }
    const evaluated = evaluate(value!, { outer: element, outerId, localIds });
    const target = reference(evaluated)?.path;
    if (!target || exports[port]) fail("composite_export", `Invalid or duplicate export "${port}".`);
    exports[port] = target;
  }
  for (const port of manifest.ports.filter((candidate) => candidate.direction === "output")) {
    if (!exports[port.name]) {
      fail("composite_export_missing", `Composite "${manifest.name}" does not export "${port.name}".`);
    }
  }
  return {
    nodes,
    aliases: Object.fromEntries(Object.entries(exports).map(([port, target]) => [
      `${outerId}.${port}`,
      target,
    ])),
    expansion: {
      instanceId: outerId,
      component: manifest.name,
      manifestHash: manifest.sourceHash,
      expansionDigest,
      internalIds: nodes.map((node) => String(node.attributes.id)),
      exports,
    },
  };
}

export function expandComposites(
  document: SourceDocument,
  kernels: KernelRegistry,
): SourceDocument {
  let children = document.root.children;
  const aliases = new Map<string, string>();
  const expansions: NonNullable<SourceDocument["expansions"]> = [];
  for (let pass = 0; pass < 32; pass += 1) {
    let changed = false;
    const next = children.flatMap((node): SourceNode[] => {
      if (node.kind !== "element") return [node];
      const manifest = kernels.get(node.name);
      if (manifest?.profile !== "composite-v1") return [node];
      changed = true;
      const expanded = expandOne(node, manifest);
      Object.entries(expanded.aliases).forEach(([from, to]) => aliases.set(from, to));
      expansions.push(expanded.expansion);
      return expanded.nodes;
    });
    children = next.map((node) => rewriteNode(node, aliases));
    if (!changed) {
      const compositeModules = [...kernels.values()]
        .filter((manifest) => manifest.profile === "composite-v1")
        .map((manifest) => ({
          kind: "svk" as const,
          uri: pathToFileURL(manifest.sourcePath).href,
          contentHash: manifest.sourceHash,
          dependencies: (manifest.compositeImports ?? []).map((item) =>
            pathToFileURL(item.sourcePath).href),
        }));
      return {
        ...document,
        root: { ...document.root, children },
        modules: [...(document.modules ?? []), ...compositeModules],
        expansions,
      };
    }
  }
  fail("composite_expansion_limit", "Composite expansion exceeded 32 finite passes.");
}
