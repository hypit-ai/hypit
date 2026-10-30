import type {
  VisualElement,
  VisualMaskElement,
  VisualMediaElement,
  VisualProgramElement,
  VisualSurfaceElement,
  VisualTextElement,
  VisualTextFlowElement,
  VisualPathTextElement,
} from "@hypit/composition";

import { htmlVisual } from "./html-visual.js";

export type HtmlStyleDeclaration = {
  readonly name: string;
  readonly value: string | number;
};

export type HtmlAttribute = {
  readonly name: string;
  readonly value: string;
};

export type HtmlEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export type HtmlKeyframe = {
  readonly atFrame: number;
  readonly easing?: HtmlEasing;
  readonly style: readonly HtmlStyleDeclaration[];
};

export type HtmlAnimation = {
  readonly keyframes: readonly HtmlKeyframe[];
};

export type HtmlElementBase = {
  readonly id: string;
  readonly style: readonly HtmlStyleDeclaration[];
  readonly attributes?: readonly HtmlAttribute[];
  readonly animation?: HtmlAnimation;
};

export type HtmlBoxElement = HtmlElementBase & {
  readonly kind: "box";
  readonly children: readonly HtmlElement[];
};

type HtmlOwned<T extends VisualElement> = T extends VisualElement
  ? Omit<T, "style" | "attributes" | "animation"> & HtmlElementBase
  : never;

export type HtmlProgramElement = HtmlElementBase & {
  readonly kind: "program";
  readonly program: VisualProgramElement["program"];
  readonly slots: readonly { readonly name: string; readonly element: HtmlElement }[];
};

export type HtmlMaskElement = HtmlElementBase & {
  readonly kind: "mask";
  readonly mode: VisualMaskElement["mode"];
  readonly mask: HtmlElement;
  readonly content: HtmlElement;
};

export type HtmlTerminalElement =
  | HtmlProgramElement
  | HtmlMaskElement
  | HtmlOwned<VisualTextElement>
  | HtmlOwned<VisualTextFlowElement>
  | HtmlOwned<VisualPathTextElement>
  | HtmlOwned<VisualMediaElement>
  | HtmlOwned<VisualSurfaceElement>;

export type HtmlElement = HtmlBoxElement | HtmlTerminalElement;

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("\"", "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

function assertStyle(style: readonly HtmlStyleDeclaration[], label: string): void {
  const names = new Set<string>();
  for (const declaration of style) {
    if (!/^-?[a-z][a-z0-9-]*$/u.test(declaration.name) || names.has(declaration.name)) {
      throw new Error(`${label} contains an invalid or repeated CSS property ${declaration.name}.`);
    }
    names.add(declaration.name);
    if (typeof declaration.value === "number") {
      if (!Number.isFinite(declaration.value)) throw new Error(`${label}.${declaration.name} is not finite.`);
      continue;
    }
    if (declaration.value.length === 0
      || /[;<>{}\\]|!important|[\u0000-\u001f\u007f]/iu.test(declaration.value)
      || /(?:url|var|env|attr|image-set)\s*\(/iu.test(declaration.value)) {
      throw new Error(`${label}.${declaration.name} is not a self-contained CSS value.`);
    }
  }
}
function assertAttributes(attributes: readonly HtmlAttribute[] | undefined, label: string): void {
  const names = new Set<string>();
  for (const attribute of attributes ?? []) {
    if (!/^(?:data-[a-z0-9-]+|aria-[a-z0-9-]+|role|title|lang|dir)$/u.test(attribute.name)
      || attribute.name.startsWith("data-hypit-") || names.has(attribute.name)) {
      throw new Error(`${label} contains an invalid or repeated HTML attribute ${attribute.name}.`);
    }
    names.add(attribute.name);
  }
}

const css = (style: readonly HtmlStyleDeclaration[]): string =>
  style.map(({ name, value }) => `${name}:${String(value)}`).join(";");

function stripHtmlOwnership(
  element: HtmlTerminalElement,
  close: (root: HtmlElement) => VisualProgramElement,
): VisualElement {
  const { style: _style, attributes: _attributes, animation: _animation, ...owned } = element;
  if (owned.kind === "program") {
    return { ...owned, slots: owned.slots.map((slot) => ({ name: slot.name, element: close(slot.element) })) } as VisualProgramElement;
  }
  if (owned.kind === "mask") {
    return { ...owned, mask: close(owned.mask), content: close(owned.content) } as VisualMaskElement;
  }
  return owned as VisualElement;
}

function htmlElementChildren(element: HtmlElement): readonly HtmlElement[] {
  if (element.kind === "box") return element.children;
  if (element.kind === "program") return element.slots.map((slot) => slot.element);
  if (element.kind === "mask") return [element.mask, element.content];
  return [];
}

function collectHtmlElementIds(element: HtmlElement, ids: Set<string>): void {
  if (!element.id || ids.has(element.id)) throw new Error(`HTML visual repeats element id ${element.id}.`);
  ids.add(element.id);
  for (const child of htmlElementChildren(element)) collectHtmlElementIds(child, ids);
}

/**
 * Close one package-owned HTML/CSS element tree behind the generic visual Programme envelope.
 * Composition observes only the programme and typed terminal slots; CSS, attributes and keyframes
 * remain implementation details of the HTML rendering package.
 */
export function htmlVisualElement(root: HtmlElement): VisualProgramElement {
  const authoredIds = new Set<string>();
  collectHtmlElementIds(root, authoredIds);
  const carrierIds = new Set<string>();

  const close = (ownedRoot: HtmlElement): VisualProgramElement => {
    const slots: { name: string; element: VisualElement }[] = [];
    const rules: string[] = [];
    const animations: { selector: string; keyframes: Record<string, string | number>[]; duration: number }[] = [];
    let serial = 0;

    const render = (element: HtmlElement): string => {
      assertStyle(element.style, `HTML visual ${element.id}`);
      assertAttributes(element.attributes, `HTML visual ${element.id}`);
      serial += 1;
      const key = String(serial);
      const selector = `[data-hypit-html-element="${key}"]`;
      if (element.style.length > 0) rules.push(`${selector}{${css(element.style)}}`);
      const attributes = (element.attributes ?? [])
        .map(({ name, value }) => ` ${name}="${escapeHtml(value)}"`).join("");
      if (element.animation !== undefined) {
        if (element.animation.keyframes.length < 2) throw new Error(`HTML visual ${element.id} animation requires two keyframes.`);
        let previous = -1;
        const keyframes = element.animation.keyframes.map((keyframe) => {
          if (!Number.isSafeInteger(keyframe.atFrame) || keyframe.atFrame <= previous) {
            throw new Error(`HTML visual ${element.id} animation frames are not strictly ordered.`);
          }
          previous = keyframe.atFrame;
          assertStyle(keyframe.style, `HTML visual ${element.id} keyframe`);
          return Object.fromEntries([
            ...keyframe.style.map(({ name, value }) => [name, value] as const),
            ...(keyframe.easing === undefined ? [] : [["easing", keyframe.easing] as const]),
            ["offset", keyframe.atFrame / element.animation!.keyframes.at(-1)!.atFrame] as const,
          ]);
        });
        animations.push({ selector, keyframes, duration: element.animation.keyframes.at(-1)!.atFrame });
      }
      if (element.kind === "box") {
        return `<div data-hypit-html-element="${key}" data-hypit-html-element-id="${escapeHtml(element.id)}"${attributes}>${element.children.map(render).join("")}</div>`;
      }
      if (element.kind !== "text" && element.kind !== "text-flow" && element.kind !== "path-text") {
        rules.push(`${selector}>[data-hypit-element-id]{display:block;width:100%;height:100%;object-fit:inherit}`);
      }
      const name = `slot-${slots.length + 1}`;
      slots.push({ name, element: stripHtmlOwnership(element, close) });
      return `<div data-hypit-html-element="${key}" data-hypit-html-element-id="${escapeHtml(element.id)}"${attributes}>{{${name}}}</div>`;
    };

    const html = render(ownedRoot);
    const setup = animations.length === 0 ? undefined : `
    const definitions = data.animations;
    const animations = definitions.map(definition => {
      const element = root.querySelector(definition.selector);
      if (element === null) throw new Error('HTML visual animation target is missing: ' + definition.selector);
      const animation = element.animate(definition.keyframes, { duration: definition.duration, fill: 'both' });
      animation.pause();
      return { animation, duration: definition.duration };
    });
    return localFrame => {
      for (const entry of animations) entry.animation.currentTime = Math.max(0, Math.min(entry.duration, localFrame));
    };`;
    let carrierId = `${ownedRoot.id}:html-program`;
    let suffix = 2;
    while (authoredIds.has(carrierId) || carrierIds.has(carrierId)) {
      carrierId = `${ownedRoot.id}:html-program:${suffix}`;
      suffix += 1;
    }
    carrierIds.add(carrierId);
    return {
      id: carrierId,
      kind: "program",
      program: htmlVisual({ html, ...(rules.length === 0 ? {} : { css: rules.join("\n") }),
        ...(setup === undefined ? {} : { setup, data: { animations } }) }),
      slots,
    };
  };

  return close(root);
}
