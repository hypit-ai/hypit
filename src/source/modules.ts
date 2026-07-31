import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fail } from "../diagnostics.js";
import type {
  AttributeValue,
  Reference,
  SourceDocument,
  SourceElement,
  SourceModuleRecord,
  SourceNode,
} from "../model.js";
import { sha256 } from "../util.js";
import { attributeString, childElements } from "./query.js";
import { parseDocument, parseRootSource } from "./parse-document.js";

type LoadedContent = {
  declarations: SourceElement[];
  kernelImports: SourceElement[];
  modules: SourceModuleRecord[];
};

function isExternalSource(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value);
}

function resolvedImport(moduleFile: string, from: string): string {
  return isExternalSource(from) || isAbsolute(from)
    ? from
    : resolve(dirname(moduleFile), from);
}

function canonicalUri(value: string): string {
  return isExternalSource(value) ? value : pathToFileURL(resolve(value)).href;
}

function cloneReference(
  value: AttributeValue,
  qualify: (path: string) => string,
): AttributeValue {
  if (!value || typeof value !== "object" || value.kind !== "reference") return value;
  return { kind: "reference", path: qualify(value.path) } satisfies Reference;
}

function cloneNode(
  node: SourceNode,
  args: {
    moduleFile: string;
    prefix: string;
    localDeclarations: Set<string>;
    importedNamespaces: Set<string>;
    topLevel: boolean;
  },
): SourceNode {
  if (node.kind === "text") return { ...node };
  const qualify = (path: string): string => {
    if (path.startsWith("script.")) {
      fail(
        "content_script_dependency",
        `Content module ${args.moduleFile} cannot depend on importer Script reference "${path}".`,
      );
    }
    const owner = path.split(".")[0] ?? "";
    if (args.localDeclarations.has(owner) || args.importedNamespaces.has(owner)) {
      return `${args.prefix}${path}`;
    }
    return path;
  };
  const attributes = Object.fromEntries(
    Object.entries(node.attributes).map(([name, value]) => [
      name,
      cloneReference(value, qualify),
    ]),
  );
  const localId = args.topLevel && typeof node.attributes.id === "string"
    ? node.attributes.id
    : undefined;
  if (localId) attributes.id = `${args.prefix}${localId}`;
  if (
    args.topLevel
    && ["image", "video", "audio", "alignment"].includes(node.name)
    && typeof attributes.src === "string"
    && !isAbsolute(attributes.src)
    && !isExternalSource(attributes.src)
  ) {
    attributes.src = resolve(dirname(args.moduleFile), attributes.src);
  }
  return {
    ...node,
    attributes,
    children: node.children.map((child) => cloneNode(child, {
      ...args,
      topLevel: false,
    })),
    origin: {
      file: args.moduleFile,
      ...(localId ? { localId } : {}),
    },
  };
}

function absoluteImport(element: SourceElement, moduleFile: string): SourceElement {
  const from = attributeString(element, "from");
  return {
    ...element,
    attributes: {
      ...element.attributes,
      from: resolvedImport(moduleFile, from),
    },
    origin: { file: moduleFile },
  };
}

async function loadContentModule(
  file: string,
  prefix: string,
  stack: string[],
): Promise<LoadedContent> {
  const absolute = resolve(file);
  if (stack.includes(absolute)) {
    fail(
      "content_import_cycle",
      `Content import cycle: ${[...stack, absolute].join(" -> ")}`,
    );
  }
  const source = await readFile(absolute, "utf8");
  const root = parseRootSource(absolute, source);
  if (root.name !== "content") {
    fail("content_root", `${absolute} must use a <content> root.`);
  }
  const imports = childElements(root, "import");
  const dependencies = imports.map((element) =>
    canonicalUri(resolvedImport(absolute, attributeString(element, "from"))));
  const declarations = childElements(root).filter((element) => element.name !== "import");
  const localDeclarations = new Set(declarations.map((element) => {
    const id = element.attributes.id;
    if (typeof id !== "string") {
      fail("content_declaration_id", `${absolute} contains <${element.name}> without id.`);
    }
    return id;
  }));
  const importedNamespaces = new Set<string>();
  const nested: LoadedContent[] = [];
  const kernelImports: SourceElement[] = [];
  for (const element of imports) {
    const from = attributeString(element, "from");
    const extension = extname(from);
    if (extension === ".svk") {
      kernelImports.push(absoluteImport(element, absolute));
      continue;
    }
    if (extension === ".svs") {
      fail(
        "content_sheet_import_unsupported",
        `${absolute} imports ${from}; sheet imports inside .svc are not enabled yet.`,
      );
    }
    if (extension !== ".svc") {
      fail("content_import_type", `${absolute} imports unsupported module ${from}.`);
    }
    const alias = element.attributes.as;
    if (alias !== undefined && typeof alias !== "string") {
      fail("content_import_alias", `${absolute} import alias must be a string.`);
    }
    const namespace = alias ?? "";
    if (namespace) importedNamespaces.add(namespace);
    nested.push(await loadContentModule(
      resolve(dirname(absolute), from),
      `${prefix}${namespace ? `${namespace}.` : ""}`,
      [...stack, absolute],
    ));
  }
  const cloned = declarations.map((element) => cloneNode(element, {
    moduleFile: absolute,
    prefix,
    localDeclarations,
    importedNamespaces,
    topLevel: true,
  }) as SourceElement);
  return {
    declarations: [...nested.flatMap((item) => item.declarations), ...cloned],
    kernelImports: [
      ...nested.flatMap((item) => item.kernelImports),
      ...kernelImports,
    ],
    modules: [
      {
        kind: "svc",
        uri: canonicalUri(absolute),
        contentHash: sha256(source),
        dependencies,
      },
      ...nested.flatMap((item) => item.modules),
    ],
  };
}

function uniqueKernelImports(elements: SourceElement[]): SourceElement[] {
  const output: SourceElement[] = [];
  const seen = new Set<string>();
  for (const element of elements) {
    const from = attributeString(element, "from");
    if (seen.has(from)) continue;
    seen.add(from);
    output.push(element);
  }
  return output;
}

export async function loadSourceClosure(file: string): Promise<SourceDocument> {
  const document = await parseDocument(file);
  const localChildren: SourceNode[] = [];
  const importedDeclarations: SourceElement[] = [];
  const importedKernels: SourceElement[] = [];
  const modules: SourceModuleRecord[] = [{
    kind: "svml",
    uri: canonicalUri(document.file),
    contentHash: sha256(document.source),
    dependencies: childElements(document.root, "import").map((element) =>
      canonicalUri(resolvedImport(document.file, attributeString(element, "from")))),
  }];
  for (const node of document.root.children) {
    if (node.kind !== "element" || node.name !== "import") {
      localChildren.push(node.kind === "element"
        ? {
            ...node,
            origin: {
              file: document.file,
              ...(typeof node.attributes.id === "string"
                ? { localId: node.attributes.id }
                : {}),
            },
          }
        : node);
      continue;
    }
    const from = attributeString(node, "from");
    if (extname(from) !== ".svc") {
      localChildren.push(absoluteImport(node, document.file));
      continue;
    }
    const alias = node.attributes.as;
    if (alias !== undefined && typeof alias !== "string") {
      fail("content_import_alias", `${document.file} import alias must be a string.`);
    }
    const loaded = await loadContentModule(
      resolve(dirname(document.file), from),
      typeof alias === "string" && alias ? `${alias}.` : "",
      [],
    );
    importedDeclarations.push(...loaded.declarations);
    importedKernels.push(...loaded.kernelImports);
    modules.push(...loaded.modules);
  }
  return {
    ...document,
    root: {
      ...document.root,
      children: [
        ...uniqueKernelImports(importedKernels),
        ...localChildren,
        ...importedDeclarations,
      ],
    },
    modules: [...new Map(modules.map((module) => [module.uri, module])).values()],
  };
}
