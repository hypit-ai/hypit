import { fail } from "./diagnostics.js";
import type {
  AudioFragment,
  KernelProjection,
  VisualFragment,
} from "./runtime-contract.js";
import { sha256 } from "./util.js";

function cssBlocks(source: string, scope: string): string {
  let output = "";
  let offset = 0;
  while (offset < source.length) {
    const open = source.indexOf("{", offset);
    if (open < 0) {
      if (source.slice(offset).trim()) {
        fail("kernel_css_syntax", "Projector CSS contains a rule without a block.");
      }
      output += source.slice(offset);
      break;
    }
    let depth = 1;
    let cursor = open + 1;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{") depth += 1;
      else if (source[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) fail("kernel_css_syntax", "Projector CSS contains an unclosed block.");
    const header = source.slice(offset, open);
    const body = source.slice(open + 1, cursor - 1);
    const trimmed = header.trim();
    if (/^@(?:import|font-face|page|property)\b/iu.test(trimmed)) {
      fail("kernel_css_capability", `Projector CSS cannot emit ${trimmed.split(/\s/u)[0]}.`);
    }
    if (/^@(?:keyframes|-webkit-keyframes)\b/iu.test(trimmed)) {
      output += `${header}{${body}}`;
    } else if (trimmed.startsWith("@")) {
      output += `${header}{${cssBlocks(body, scope)}}`;
    } else {
      const selectors = header.split(",").map((selector) => selector.trim()).filter(Boolean);
      if (!selectors.length) fail("kernel_css_selector", "Projector CSS has an empty selector.");
      output += `${selectors.map((selector) => `${scope} ${selector}`).join(", ")}{${body}}`;
    }
    offset = cursor;
  }
  return output;
}

function assertInertHtml(value: string, id: string): void {
  if (
    /<(?:script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select)\b/iu.test(value)
    || /\son[a-z]+\s*=/iu.test(value)
    || /javascript\s*:/iu.test(value)
  ) {
    fail(
      "kernel_html_capability",
      `Visual fragment "${id}" contains executable or document-global HTML.`,
    );
  }
}

function assertStyle(
  style: Record<string, string | number> | undefined,
  id: string,
): void {
  for (const [name, value] of Object.entries(style ?? {})) {
    if (!/^--?[A-Za-z_][A-Za-z0-9_-]*$|^[A-Za-z_][A-Za-z0-9_-]*$/u.test(name)) {
      fail("kernel_style_property", `Visual fragment "${id}" has invalid style property "${name}".`);
    }
    if (/(?:url\s*\(|expression\s*\(|javascript\s*:)/iu.test(String(value))) {
      fail("kernel_style_capability", `Visual fragment "${id}" style "${name}" requests an external capability.`);
    }
  }
}

function normalizeVisual(
  fragment: VisualFragment,
  sharedStyles: string[],
): VisualFragment {
  if (
    !Number.isInteger(fragment.startFrame)
    || !Number.isInteger(fragment.endFrameExclusive)
    || fragment.startFrame < 0
    || fragment.endFrameExclusive < fragment.startFrame
    || !Number.isFinite(fragment.z)
  ) {
    fail("kernel_visual_window", `Visual fragment "${fragment.id}" has an invalid frame window or z.`);
  }
  if (!["image", "video", "html"].includes(fragment.kind)) {
    fail("kernel_visual_kind", `Visual fragment "${fragment.id}" has unknown kind.`);
  }
  if (fragment.kind === "html") assertInertHtml(fragment.html ?? "", fragment.id);
  assertStyle(fragment.style, fragment.id);
  assertStyle(fragment.innerStyle, fragment.id);
  for (const name of Object.keys(fragment.attributes ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(name) || /^on/iu.test(name)) {
      fail("kernel_fragment_attribute", `Visual fragment "${fragment.id}" has forbidden attribute "${name}".`);
    }
  }
  const existingToken = fragment.attributes?.["data-svml-scope"];
  const token = typeof existingToken === "string"
    ? existingToken
    : sha256(fragment.id).slice(0, 16);
  const selector = `[data-svml-scope="${token}"]`;
  const css = [
    fragment.css
      ? (typeof existingToken === "string" ? fragment.css : cssBlocks(fragment.css, selector))
      : "",
    ...sharedStyles.map((value) => cssBlocks(value, selector)),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .join("\n");
  return {
    ...fragment,
    attributes: {
      ...fragment.attributes,
      "data-svml-scope": token,
    },
    ...(css ? { css } : {}),
  };
}

function validateAudio(fragment: AudioFragment): AudioFragment {
  if (
    !Number.isInteger(fragment.startFrame)
    || !Number.isInteger(fragment.endFrameExclusive)
    || fragment.startFrame < 0
    || fragment.endFrameExclusive < fragment.startFrame
  ) {
    fail("kernel_audio_window", `Audio fragment "${fragment.id}" has an invalid frame window.`);
  }
  if (fragment.bus && !["speech", "music", "sfx", "source"].includes(fragment.bus)) {
    fail("kernel_audio_bus", `Audio fragment "${fragment.id}" uses unknown bus "${fragment.bus}".`);
  }
  return fragment;
}

function normalizeSurface(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const surface = value as {
    visuals?: VisualFragment[];
    audios?: AudioFragment[];
    styles?: string[];
  };
  if (Array.isArray(surface.visuals) || Array.isArray(surface.audios) || Array.isArray(surface.styles)) {
    const visualIds = (surface.visuals ?? []).map((fragment) => fragment.id);
    if (new Set(visualIds).size !== visualIds.length) {
      fail("kernel_visual_duplicate_id", "A projected visual surface repeats a fragment id.");
    }
    const audioIds = (surface.audios ?? []).map((fragment) => fragment.id);
    if (new Set(audioIds).size !== audioIds.length) {
      fail("kernel_audio_duplicate_id", "A projected audio tree repeats a fragment id.");
    }
    const styles = Array.isArray(surface.styles) ? surface.styles : [];
    if (surface.visuals) surface.visuals = surface.visuals.map((fragment) =>
      normalizeVisual(fragment, styles));
    if (surface.audios) surface.audios = surface.audios.map(validateAudio);
    surface.styles = [];
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (child !== surface.visuals && child !== surface.audios && child !== surface.styles) {
      normalizeSurface(child);
    }
  }
}

export function validateKernelProjection(
  projection: KernelProjection,
): KernelProjection {
  normalizeSurface(projection);
  return projection;
}
