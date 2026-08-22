import { dirname, isAbsolute, relative, resolve } from "node:path";

import type {
  StudioParameter,
  StudioParameterDeclaration,
  StudioEntityDraft,
  StudioPlacement,
  StudioEditHandle,
} from "@hypit/studio-adapter";
import { parseSvs } from "@hypit/svs";

import type { Range } from "./shared.js";
import type { Placement } from "./observe.js";

export type StudioSourceFile = {
  readonly path: string;
  readonly text: string;
  readonly language: "svml" | "svs" | "svrun";
  readonly imports?: readonly { readonly alias: string; readonly source: string }[];
};

type AuthorElement = {
  readonly id?: string;
  readonly sourcePath: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly references: Readonly<Record<string, string>>;
  readonly attributeValueRanges: Readonly<Record<string, Range>>;
};

function authoredElements(placements: readonly Placement[]): readonly AuthorElement[] {
  return placements.flatMap((placement) => [
    {
      ...(placement.id === undefined ? {} : { id: placement.id }),
      sourcePath: placement.sourcePath,
      attributes: placement.attributes,
      references: placement.referenceAttributes,
      attributeValueRanges: placement.attributeValueRanges,
    },
    ...placement.children.map((child) => ({
      ...(child.id === undefined ? {} : { id: child.id }),
      sourcePath: child.sourcePath,
      attributes: child.attributes,
      references: child.referenceAttributes,
      attributeValueRanges: child.attributeValueRanges,
    })),
  ]);
}

function sameRange(left: Range | undefined, right: Range | undefined): boolean {
  return left !== undefined && right !== undefined && left.start === right.start && left.end === right.end;
}

function elementFor(placement: StudioPlacement, draft: StudioEntityDraft): AuthorElement | undefined {
  const candidates: readonly (AuthorElement & { readonly id?: string; readonly range: Range })[] = [
    {
      sourcePath: placement.sourcePath,
      attributes: placement.attributes,
      references: placement.referenceAttributes,
      attributeValueRanges: placement.attributeValueRanges,
      ...(placement.id === undefined ? {} : { id: placement.id }),
      range: placement.range,
    },
    ...placement.children.map((child) => ({
      sourcePath: child.sourcePath,
      attributes: child.attributes,
      references: child.referenceAttributes,
      attributeValueRanges: child.attributeValueRanges,
      ...(child.id === undefined ? {} : { id: child.id }),
      range: child.range,
    })),
  ];
  return candidates.find((candidate) => sameRange(candidate.range, draft.elementRange))
    ?? candidates.find((candidate) => candidate.id === draft.authoredId);
}

function languageOf(path: string): StudioSourceFile["language"] {
  if (path.endsWith(".svs")) return "svs";
  if (path.endsWith(".svrun")) return "svrun";
  return "svml";
}

function sourceFor(
  root: string,
  path: string,
  files: readonly StudioSourceFile[],
  base?: string,
): StudioSourceFile | undefined {
  const absolute = isAbsolute(path)
    ? resolve(path)
    : resolve(base === undefined ? root : dirname(base), path);
  return files.find((file) => resolve(file.path) === absolute)
    ?? files.find((file) => file.path === relative(root, absolute));
}

function svsText(source: string): string {
  const header = /^\s*<\?svml[\s\S]*?\?>/u.exec(source);
  if (header === null) return source;
  return `${header[0].replace(/[^\r\n]/gu, " ")}${source.slice(header[0].length)}`;
}

function recipeParameters(input: {
  readonly root: string;
  readonly files: readonly StudioSourceFile[];
  readonly current: StudioSourceFile;
  readonly draft: StudioEntityDraft;
  readonly referenceName: string;
  readonly referencePath: string;
  readonly placements: readonly Placement[];
}): readonly StudioParameter[] {
  const local = input.placements.find((candidate) => candidate.id === input.referencePath);
  if (local !== undefined) {
    const next = ["recipe", "default", "style", "appearance", "motion", "program"]
      .map((name) => local.referenceAttributes[name])
      .find((value) => value !== undefined);
    if (next !== undefined && next !== input.referencePath) {
      return recipeParameters({
        ...input,
        current: sourceFor(input.root, local.sourcePath, input.files) ?? input.current,
        referencePath: next,
      });
    }
  }
  const [alias, ...parts] = input.referencePath.split(".");
  if (alias === undefined || parts.length === 0) return [];
  const imported = input.current.imports?.find((item) => item.alias === alias);
  if (imported === undefined) return [];
  const source = sourceFor(input.root, imported.source, input.files, input.current.path);
  if (source === undefined || source.language !== "svs") return [];
  const recipePath = parts.join(".");
  const parsed = parseSvs(source.path, svsText(source.text));
  const recipe = parsed.recipes.find((item) => item.value.path === recipePath);
  if (recipe === undefined) return [];
  return recipe.properties.map((property) => {
    const preimage = source.text.slice(property.valueRange.start, property.valueRange.end);
    const raw = preimage.trim();
    const control = raw === "true" || raw === "false"
      ? "boolean" as const
      : /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(raw) ? "number" as const : "text" as const;
    return {
      id: `${input.draft.id}:${input.referenceName}:${property.name}`,
      name: property.name,
      label: `${input.referenceName} · ${property.name}`,
      control,
      value: raw,
      language: "svs" as const,
      writable: true,
      source: {
        path: relative(input.root, resolve(source.path)),
        range: property.valueRange,
        preimage,
      },
    } satisfies StudioParameter;
  });
}

function referencedParameters(input: {
  readonly root: string;
  readonly files: readonly StudioSourceFile[];
  readonly draft: StudioEntityDraft;
  readonly referenceName: string;
  readonly referencePath: string;
  readonly declarations: readonly StudioParameterDeclaration[];
  readonly placements: readonly Placement[];
}): readonly StudioParameter[] {
  const targetId = input.referencePath.split(".").at(-1);
  if (targetId === undefined) return [];
  const target = authoredElements(input.placements).find((candidate) => candidate.id === targetId);
  if (target === undefined) return [];
  const file = sourceFor(input.root, target.sourcePath, input.files);
  if (file === undefined) return [];
  return input.declarations.flatMap((declaration) => {
    const range = target.attributeValueRanges[declaration.name];
    if (range === undefined) return [];
    const preimage = file.text.slice(range.start, range.end);
    const reference = target.references[declaration.name];
    const value = reference === undefined ? (target.attributes[declaration.name] ?? preimage) : reference;
    const writable = declaration.writable === true && reference === undefined;
    return [{
      id: `${input.draft.id}:${input.referenceName}:${targetId}:${declaration.name}`,
      name: declaration.name,
      label: `${input.referenceName} · ${declaration.label ?? declaration.name}`,
      control: declaration.control ?? "text",
      value,
      language: languageOf(target.sourcePath),
      writable,
      ...(declaration.options === undefined ? {} : { options: declaration.options }),
      ...(declaration.unit === undefined ? {} : { unit: declaration.unit }),
      source: {
        path: relative(input.root, resolve(target.sourcePath)),
        range,
        preimage,
      },
      ...(!writable
        ? { disabledReason: reference === undefined ? "该几何值由组件声明为只读。" : "引用由作者在 SVML 中绑定，面板不替换引用关系。" }
        : {}),
    } satisfies StudioParameter];
  });
}

/**
 * Expose only attributes a package explicitly registered. The source range is
 * still discovered by the generic markup frontend, while the meaning and
 * editability remain package-owned Studio ABI data.
 */
export function parametersForDraft(input: {
  readonly root: string;
  readonly files: readonly StudioSourceFile[];
  readonly placement: StudioPlacement | undefined;
  readonly draft: StudioEntityDraft;
  readonly declarations: readonly StudioParameterDeclaration[];
  readonly placements?: readonly Placement[];
}): readonly StudioParameter[] {
  const placement = input.placement;
  if (placement === undefined || input.declarations.length === 0) return [];
  const element = elementFor(placement, input.draft);
  if (element === undefined) return [];
  const file = sourceFor(input.root, element.sourcePath, input.files);
  if (file === undefined) return [];

  const direct = input.declarations.flatMap((declaration) => {
    const name = declaration.name;
    const range = element.attributeValueRanges[name];
    if (range === undefined) return [];
    const preimage = file.text.slice(range.start, range.end);
    const reference = element.references[name];
    const value = reference === undefined
      ? (element.attributes[name] ?? preimage)
      : reference;
    const isReference = reference !== undefined;
    const writable = declaration.writable === true && !isReference;
    return [{
      id: `${input.draft.id}:${name}`,
      name,
      label: declaration.label ?? name,
      control: declaration.control ?? "text",
      value,
      language: languageOf(element.sourcePath),
      writable,
      ...(declaration.options === undefined ? {} : { options: declaration.options }),
      ...(declaration.unit === undefined ? {} : { unit: declaration.unit }),
      source: {
        path: relative(input.root, resolve(element.sourcePath)),
        range,
        preimage,
      },
      ...(!writable
        ? { disabledReason: isReference ? "引用由作者在 SVML 中绑定，面板不替换引用关系。" : "该参数由组件声明为只读。" }
        : {}),
    } satisfies StudioParameter];
  });
  const recipes = input.declarations.flatMap((declaration) => {
    const referencePath = element.references[declaration.name];
    if (referencePath === undefined) return [];
    const reference = declaration.referenced === undefined
      ? []
      : referencedParameters({
        root: input.root,
        files: input.files,
        draft: input.draft,
        referenceName: declaration.label ?? declaration.name,
        referencePath,
        declarations: declaration.referenced,
        placements: input.placements ?? [],
      });
    const recipe = ["appearance", "visual-appearance", "motion", "style", "recipe", "program", "default"].includes(declaration.name)
      ? recipeParameters({
        root: input.root,
        files: input.files,
        current: file,
        draft: input.draft,
        referenceName: declaration.label ?? declaration.name,
        referencePath,
        placements: input.placements ?? [],
      })
      : [];
    return [...reference, ...recipe];
  });
  return [...direct, ...recipes];
}

const ABSOLUTE_DURATION = /^\s*\d+(?:\.\d+)?(?:f|ms|s)\s*$/u;

/**
 * Timing handles are deliberately narrower than timing parameters. A literal
 * absolute start/end can be rewritten as frames without changing its semantic
 * source; a Selection/Moment expression cannot be moved from a downstream
 * rectangle. `at + for` has one legal edge: changing `for` changes only its end.
 */
export function timingEditHandles(
  parameters: readonly StudioParameter[],
  declared: readonly import("@hypit/studio-adapter").StudioEditOperation[] = ["move", "trim-start", "trim-end"],
): readonly StudioEditHandle[] {
  const byName = new Map<string, StudioParameter>();
  for (const parameter of parameters) {
    // Timing source attributes live in SVML. A nested Recipe may legitimately
    // also have a property named `start`; it must never shadow the author
    // window when a clip is being dragged.
    if (parameter.language === "svml" && !byName.has(parameter.name)) byName.set(parameter.name, parameter);
  }
  const start = byName.get("start");
  const end = byName.get("end");
  const at = byName.get("at");
  const duration = byName.get("for");
  const absolute = (parameter: StudioParameter | undefined): parameter is StudioParameter =>
    parameter !== undefined && parameter.writable && ABSOLUTE_DURATION.test(parameter.value);
  const allowed = new Set(declared);
  const disabled = (id: string, operation: StudioEditHandle["operation"], reason: string): StudioEditHandle => ({
    id, operation, enabled: false, disabledReason: reason,
  });
  const handles: StudioEditHandle[] = [];
  if (absolute(start) && absolute(end)) {
    if (allowed.has("move")) handles.push({
      id: "move", operation: "move", enabled: true, coordinate: "program-frame",
      snapTo: ["frame", "semantic-anchor", "item-edge"], sources: [start.source, end.source],
    });
    if (allowed.has("trim-start")) handles.push({
      id: "trim-start", operation: "trim-start", enabled: true, coordinate: "program-frame",
      snapTo: ["frame", "semantic-anchor", "item-edge"], sources: [start.source],
    });
    if (allowed.has("trim-end")) handles.push({
      id: "trim-end", operation: "trim-end", enabled: true, coordinate: "program-frame",
      snapTo: ["frame", "semantic-anchor", "item-edge"], sources: [end.source],
    });
  } else if (at !== undefined && !at.writable && absolute(duration)) {
    if (allowed.has("move")) handles.push(disabled("move", "move", "起点由 At 引用决定，不能独立移动。"));
    if (allowed.has("trim-start")) handles.push(disabled("trim-start", "trim-start", "起点由 At 引用决定，不能独立裁剪。"));
    if (allowed.has("trim-end")) handles.push({
      id: "trim-end", operation: "trim-end", enabled: true, coordinate: "program-frame",
      snapTo: ["frame", "semantic-anchor", "item-edge"], sources: [duration.source],
    });
  } else {
    const reason = parameters.some((parameter) => parameter.name === "during" && !parameter.writable)
      ? "时间窗由 Selection、Segment、Moment 或 Program 投影提供。请修改来源或投影，不拖动消费结果。"
      : "没有可逆的绝对时间端点源码范围。";
    if (allowed.has("move")) handles.push(disabled("move", "move", reason));
    if (allowed.has("trim-start")) handles.push(disabled("trim-start", "trim-start", reason));
    if (allowed.has("trim-end")) handles.push(disabled("trim-end", "trim-end", reason));
  }
  if (allowed.has("slip")) handles.push(disabled("slip", "slip", "素材内部时间尚未声明为可回写的作者参数。"));
  if (allowed.has("split")) handles.push(disabled("split", "split", "切分会创建新的作者实体，当前没有唯一的 SVML 写回方案。"));
  if (allowed.has("delete")) handles.push(disabled("delete", "delete", "删除需要同时处理作者元素与全部引用，当前保持只读。"));
  if (allowed.has("duplicate")) handles.push(disabled("duplicate", "duplicate", "复制需要生成新的作者身份和引用，当前保持只读。"));
  if (allowed.has("canvas-transform")) handles.push(disabled("canvas-transform", "canvas-transform", "画布几何由 Frame/Point 作者值控制，当前没有唯一可写范围。"));
  return handles;
}
