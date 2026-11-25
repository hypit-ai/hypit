import { blobTypes } from "@hypit/hypit/blob";
import { sealGenerationMediaBinding, sealGenerationRequestDraft } from "@hypit/generation";
import type { GenerationMediaPort } from "@hypit/generation";
import { canonicalize } from "@hypit/hypit/protocol";
import type { StructuredElement, StructuredSurfaceHandler } from "@hypit/hypit/markup";
import { exactModelMediaInputNames } from "@hypit/generation/model";
import { createSamSegmentFragment } from "./segment-fragment.js";
import { SAM_SEGMENT_MAX_OBJECTS, samSegmentEndpoint as endpoint } from "./index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const ATTRIBUTES = ["id", "prompt", "also", "propagation", "min-confidence", "source", "format"] as const;
const OBJECT_ATTRIBUTES = ["name", "frame", "box", "points"] as const;
const PROPAGATION = ["both", "forward", "backward"] as const;

/** One geometry-named object, in the form the provider scales to source pixels. */
type GeometryObject = {
  readonly name: string;
  readonly frame: number;
  readonly box?: readonly [number, number, number, number];
  readonly points?: readonly { readonly x: number; readonly y: number; readonly negative?: true }[];
};

/**
 * Lowercase slug used as the output binding name. It has to satisfy the identifier rules the graph
 * uses for bindings, so punctuation is folded rather than carried through.
 */
function slugOf(subject: string, value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  assert(slug.length > 0, `${subject} "${value}" has no usable name`);
  return slug;
}

function localName(value: string): string {
  return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
}

function conceptList(element: StructuredElement): readonly string[] {
  const prompt = element.attributes.prompt;
  assert(typeof prompt === "string" && prompt.trim().length > 0,
    `${element.name} requires prompt, or Object children naming each object by box or points`);
  const also = element.attributes.also;
  assert(also === undefined || typeof also === "string", `${element.name}.also must be a comma-separated string`);
  const authored = [prompt, ...(typeof also === "string" ? also.split(",") : [])]
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  assertDuplicates(element.name, authored);
  return authored;
}

/** Case-insensitive duplicates are rejected with a named object, not a slug-collision message. */
function assertDuplicates(elementName: string, names: readonly string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    assert(!seen.has(key), `${elementName} repeats the object "${name}"`);
    seen.add(key);
  }
}

function unit(value: string, subject: string): number {
  const parsed = Number(value);
  assert(Number.isFinite(parsed) && parsed >= 0 && parsed <= 1,
    `${subject} must be a number from 0 to 1, got "${value}"`);
  return parsed;
}

function frameOf(child: StructuredElement): number {
  const raw = child.attributes.frame;
  if (raw === undefined) return 0;
  assert(typeof raw === "string" && /^\d+$/u.test(raw.trim()),
    `${child.name}.frame must be a whole frame number, got "${String(raw)}"`);
  return Number(raw.trim());
}

function boxOf(child: StructuredElement, value: string): readonly [number, number, number, number] {
  const parts = value.split(",").map((item) => item.trim());
  assert(parts.length === 4, `${child.name}.box must be x1,y1,x2,y2`);
  const [x1, y1, x2, y2] = parts.map((part) => unit(part, `${child.name}.box`));
  assert(x1! < x2! && y1! < y2!, `${child.name}.box must satisfy x1 < x2 and y1 < y2`);
  return [x1!, y1!, x2!, y2!];
}

function pointsOf(
  child: StructuredElement,
  value: string,
): readonly { readonly x: number; readonly y: number; readonly negative?: true }[] {
  const points = value.split(";").map((item) => item.trim()).filter((item) => item.length > 0);
  assert(points.length > 0 && points.length <= 16, `${child.name}.points must carry 1 to 16 points`);
  return points.map((point) => {
    const parts = point.split(",").map((item) => item.trim());
    const flag = parts.length === 3 ? parts[2] : undefined;
    assert(parts.length === 2 || (parts.length === 3 && flag === "neg"),
      `${child.name}.points entries are "x,y" or "x,y,neg"`);
    const x = unit(parts[0]!, `${child.name}.points`);
    const y = unit(parts[1]!, `${child.name}.points`);
    return flag === "neg" ? { x, y, negative: true as const } : { x, y };
  });
}

function objectsOf(element: StructuredElement): readonly GeometryObject[] {
  const objects: GeometryObject[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      assert(child.value.trim().length === 0, `${element.name} accepts only Object children`);
      continue;
    }
    assert(localName(child.name) === "Object", `${element.name} accepts only Object children`);
    for (const name of Object.keys(child.attributes)) {
      assert((OBJECT_ATTRIBUTES as readonly string[]).includes(name), `${child.name} does not accept ${name}`);
    }
    assert(!child.children.some((item) => item.kind === "element" || item.value.trim()),
      `${child.name} must be empty`);
    const name = child.attributes.name;
    assert(typeof name === "string" && name.trim().length > 0, `${child.name} requires name`);
    const box = child.attributes.box;
    const points = child.attributes.points;
    assert((box === undefined) !== (points === undefined),
      `${child.name} needs exactly one of box or points`);
    assert(box === undefined || typeof box === "string", `${child.name}.box must be literal`);
    assert(points === undefined || typeof points === "string", `${child.name}.points must be literal`);
    objects.push({
      name: name.trim(),
      frame: frameOf(child),
      ...(typeof box === "string" ? { box: boxOf(child, box) } : {}),
      ...(typeof points === "string" ? { points: pointsOf(child, points) } : {}),
    });
  }
  assertDuplicates(element.name, objects.map((object) => object.name));
  assert(objects.length > 0, `${element.name} declares no Object child`);
  assert(objects.length <= SAM_SEGMENT_MAX_OBJECTS,
    `${element.name} declares ${objects.length} objects; at most ${SAM_SEGMENT_MAX_OBJECTS} are supported`);
  return objects;
}

export const decodeSamSegmentSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const { id, source, format } = element.attributes;
  for (const name of Object.keys(element.attributes)) {
    assert((ATTRIBUTES as readonly string[]).includes(name), `${element.name} does not accept ${name}`);
  }
  assert(typeof id === "string" && id.trim().length > 0, `${element.name} requires id`);

  const hasChildren = element.children.some((item) => item.kind === "element");
  const hasPrompt = element.attributes.prompt !== undefined || element.attributes.also !== undefined;
  assert(!(hasChildren && hasPrompt),
    `${element.name} takes either prompt/also or Object children, not both: a SAM request cannot mix noun phrases with box or point prompts`);

  const propagation = element.attributes.propagation;
  assert(propagation === undefined || (typeof propagation === "string"
    && (PROPAGATION as readonly string[]).includes(propagation)),
    `${element.name}.propagation must be one of ${PROPAGATION.join(", ")}`);

  let minimumConfidence: number | undefined;
  if (element.attributes["min-confidence"] !== undefined) {
    const raw = element.attributes["min-confidence"];
    assert(typeof raw === "string", `${element.name}.min-confidence must be a number from 0 to 1`);
    minimumConfidence = Number(raw);
    assert(Number.isFinite(minimumConfidence) && minimumConfidence >= 0 && minimumConfidence <= 1,
      `${element.name}.min-confidence must be a number from 0 to 1, got "${raw}"`);
  }

  const objects = hasChildren ? objectsOf(element) : [];
  const concepts = hasChildren ? [] : conceptList(element);
  const names = hasChildren ? objects.map((object) => object.name) : [...concepts];
  const slugs = names.map((name) => slugOf(element.name, name));
  assert(new Set(slugs).size === slugs.length,
    `${element.name} objects collide after slugging (${slugs.join(", ")}); rename one of them`);

  if (propagation === "backward") {
    assert(hasChildren && objects.some((object) => object.frame > 0),
      `${element.name}.propagation="backward" needs an Object anchored on a frame after the first; the service rejects it otherwise`);
  }

  assert(typeof source === "object" && source !== null && source.kind === "reference",
    `${element.name}.source must be a video reference`);
  const resolved = resolveReference(source.path);
  assert(resolved !== undefined && resolved.type.name === blobTypes.blob.name
    && resolved.type.module.name === blobTypes.blob.module.name
    && resolved.type.module.version === blobTypes.blob.module.version, `${element.name}.source must be a Blob`);
  if (resolved.record !== undefined) {
    assert(resolved.record.value.kind === "blob" && resolved.record.value.mediaType.startsWith("video/"),
      `${element.name}.source must be video media`);
  }
  assert(format === undefined || typeof format === "string", `${element.name}.format must be literal`);

  const draft = sealGenerationRequestDraft(endpoint.ports, {
    ...(hasChildren
      ? { objects: objects.map((object) => JSON.stringify(object)) }
      : { prompt: [...concepts] }),
    ...(propagation === undefined ? {} : { propagation: [propagation] }),
    ...(minimumConfidence === undefined ? {} : { minConfidence: [minimumConfidence] }),
    format: [format ?? "WEBM"],
  });
  const binding = sealGenerationMediaBinding(
    endpoint.ports.ports.find((port) => port.name === "source")! as GenerationMediaPort,
    { role: "video" },
  );
  const names2 = exactModelMediaInputNames("source");
  const fragment = createSamSegmentFragment(endpoint, slugs);
  return {
    records: [
      { id: `${id}.draft`, type: endpoint.draftType, value: { kind: "inline", value: canonicalize(draft) }, range: element.range },
      { id: `${id}.source-binding`, type: endpoint.mediaBindings.source!.type,
        value: { kind: "inline", value: canonicalize(binding) }, range: element.range },
    ],
    fragments: [fragment],
    components: [{
      id,
      fragment: fragment.id,
      inputs: {
        draft: { kind: "record", id: `${id}.draft` },
        [names2.binding]: { kind: "record", id: `${id}.source-binding` },
        [names2.artifact]: resolved.ref,
      },
      outputs: Object.fromEntries(slugs.map((slug) => [slug, `${id}.${slug}`])),
      range: element.range,
    }],
  };
};
