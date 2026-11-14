import { sameType } from "@hypit/hypit/module";
import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createMarkupDeclarationFacet } from "@hypit/hypit/generation/markup";
import { canonicalize } from "@hypit/hypit/value";
import { createAuthorDeclarationFacet, declarationField, sealGraphFragment } from "@hypit/hypit/generation/author";
import type { AuthorDeclarationChild, AuthorDeclarationCompiler, AuthorResolvedReference, FragmentOperation } from "@hypit/hypit/generation/author";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import type { ProducerPackage } from "@hypit/hypit/generation/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import type { RefinementPackage } from "@hypit/hypit/generation/refinement";
import type { TypeRef } from "@hypit/hypit/module";
import type { GenerationModuleDefinition, TypedRecord } from "@hypit/hypit/generation/build";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import type { FontStackRef } from "@hypit/media";
import type { Timeline } from "@hypit/timeline";
import { timelineTypes } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import type { SpatialFrame } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { assertTemporalInstantFor } from "@hypit/timeline";
import type { TemporalInstant, TemporalWindow } from "@hypit/timeline";
import { renderChat } from "./render.js";
import type { ChatOptions, Message } from "./render.js";

const module = { name: "@example/chat-scene" } as const;
const types = Object.fromEntries(["Options", "Message", "Messages"].map(name => [name, { module, name }])) as Record<"Options" | "Message" | "Messages", TypeRef>;
const producers = Object.fromEntries(["empty", "append", "render"].map(name => [name, { module, name }])) as Record<"empty" | "append" | "render", { module: typeof module; name: string }>;
export const manifest: GenerationModuleDefinition = { ...module,
  dependencies: [compositionTypes.visualTrack, mediaTypes.fontStack, timelineTypes.timeline, spatialTypes.frame, timelineTypes.instant].map(type => type.module),
  types: Object.values(types).map(type => type.name), capabilities: [], producers: [
    { name: "empty", inputs: [], result: { kind: "output" as const, name: "messages", type: types.Messages } },
    { name: "append", inputs: [{ name: "messages", type: types.Messages }, { name: "message", type: types.Message },
      { name: "at", type: timelineTypes.instant }, { name: "timeline", type: timelineTypes.timeline }], result: { kind: "output" as const, name: "messages", type: types.Messages } },
    { name: "render", inputs: [{ name: "messages", type: types.Messages }, { name: "options", type: types.Options },
      { name: "timeline", type: timelineTypes.timeline }, { name: "within", type: spatialTypes.frame },
      { name: "window", type: timelineTypes.window }, { name: "font", type: mediaTypes.fontStack }], result: { kind: "output" as const, name: "visual", type: compositionTypes.visualTrack } },
  ],
};
const valueOf = <T>(record: TypedRecord | undefined): T => {
  if (record?.value === undefined) throw new Error("Chat inputs are missing.");
  return record.value as T;
};
const value = (data: unknown) => ((canonicalize(data)));
const component: { producers?: ProducerPackage; refinements?: RefinementPackage } = { producers: [
  { producer: producers.empty, handler: () => ({ kind: "output", value: value([]) }) },
  { producer: producers.append, handler: ({ inputs }) => {
    const message = valueOf<Omit<Message, "at">>(inputs.message), at = valueOf<TemporalInstant>(inputs.at);
    const messages = valueOf<Message[]>(inputs.messages);
    assertTemporalInstantFor(at, { timeline: valueOf<Timeline>(inputs.timeline) });
    if (messages.some(item => item.id === message.id) || (messages.at(-1)?.at.frame ?? -1) > at.frame) throw new Error("Chat messages need unique ids and chronological arrival times.");
    return { kind: "output", value: value([...messages, { ...message, at }]) };
  } },
  { producer: producers.render, handler: ({ inputs }) => ({ kind: "output", value: value(renderChat(valueOf<Timeline>(inputs.timeline),
    valueOf<SpatialFrame>(inputs.within), valueOf<TemporalWindow>(inputs.window), valueOf<FontStackRef>(inputs.font),
    valueOf<Message[]>(inputs.messages), valueOf<ChatOptions>(inputs.options))) }) },
] };


type DeclarationNode = Parameters<AuthorDeclarationCompiler["bindings"]>[0] | AuthorDeclarationChild;
function literal(element: DeclarationNode, name: string): string {
  const field = declarationField(element, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) throw new Error(`${element.name}.${name} must be text.`);
  return field.value.trim();
}
async function reference(element: DeclarationNode, name: string, type: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const field = declarationField(element, name);
  if (field?.kind !== "reference") throw new Error(`${element.name}.${name} must be a reference.`);
  const found = await resolve(field.path);
  if (found === undefined || !sameType(found.type, type)) throw new Error(`${element.name}.${name} has the wrong Type.`);
  return found;
}
const authorDeclaration: AuthorDeclarationCompiler = {
  module, declaration: "scene", outputs: [compositionTypes.visualTrack, ...Object.values(types)],
  shape: {
    summary: "Builds one authored conversation scene.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the scene." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the Timeline." },
      { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Places the scene." },
      { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontStack], summary: "Selects the font stack." },
      { name: "during", kind: "expression", required: true, accepts: [timelineTypes.window], summary: "Selects the scene window." },
      { name: "title", kind: "literal", required: true, summary: "Sets the title." },
      { name: "entrance-frames", kind: "literal", required: false, summary: "Sets the entrance duration." },
    ],
    children: [{
      name: "Message", cardinality: "many", summary: "Adds one message.",
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the message." },
        { name: "sender", kind: "literal", required: true, summary: "Sets the sender." },
        { name: "text", kind: "literal", required: true, summary: "Sets the copy." },
        { name: "side", kind: "literal", required: true, values: ["left", "right"], summary: "Places the bubble." },
        { name: "at", kind: "expression", required: true, accepts: [timelineTypes.instant], summary: "Selects the arrival Instant." },
      ],
    }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: `${id}.visual`, ref: { kind: "component-output", component: id, output: "visual" }, type: compositionTypes.visualTrack }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const timeline = await reference(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const within = await reference(declaration, "within", spatialTypes.frame, resolveReference);
    const font = await reference(declaration, "font", mediaTypes.fontStack, resolveReference);
    const window = await reference(declaration, "during", timelineTypes.window, resolveReference);
    const entrance = declarationField(declaration, "entrance-frames");
    const options: ChatOptions = { id, title: literal(declaration, "title"),
      entranceFrames: Number(entrance?.kind === "literal" ? entrance.value : "10") };
    const records = [{ id: `${id}.options`, type: types.Options, value: value(options), range: declaration.range }];
    const fragmentInputs = [{ name: "timeline", type: timelineTypes.timeline }, { name: "within", type: spatialTypes.frame },
      { name: "font", type: mediaTypes.fontStack }, { name: "window", type: timelineTypes.window }, { name: "options", type: types.Options }];
    const bindings: Record<string, import("@hypit/hypit/generation/author").AuthorValueRef> = {
      timeline: timeline.ref, within: within.ref, font: font.ref, window: window.ref, options: { kind: "record", id: `${id}.options` },
    };
    const input = (name: string) => ({ kind: "fragment-input" as const, name });
    const operation = (name: string) => ({ kind: "fragment-operation" as const, operation: name });
    const operations: FragmentOperation[] = [{ id: "empty", producer: producers.empty, inputs: {}, result: { kind: "output", name: "messages" } }];
    let previous = "empty";
    let index = 0;
    for (const child of declaration.children) {
      if (child.name !== "Message") throw new Error("Chat Scene accepts Message children.");
      const messageId = literal(child, "id");
      const side = literal(child, "side");
      if (side !== "left" && side !== "right") throw new Error("Message side must be left or right.");
      const at = await reference(child, "at", timelineTypes.instant, resolveReference);
      const key = `message-${++index}`;
      records.push({ id: `${id}.${key}`, type: types.Message,
        value: value({ id: messageId, sender: literal(child, "sender"), text: literal(child, "text"), side }), range: child.range ?? declaration.range });
      fragmentInputs.push({ name: key, type: types.Message }, { name: `${key}-at`, type: timelineTypes.instant });
      bindings[key] = { kind: "record", id: `${id}.${key}` };
      bindings[`${key}-at`] = at.ref;
      operations.push({ id: key, producer: producers.append,
        inputs: { messages: operation(previous), message: input(key), at: input(`${key}-at`), timeline: input("timeline") },
        result: { kind: "output", name: "messages" } });
      previous = key;
    }
    if (index === 0) throw new Error("Chat Scene requires a Message.");
    operations.push({ id: "render", producer: producers.render, inputs: {
      messages: operation(previous), options: input("options"), timeline: input("timeline"),
      within: input("within"), font: input("font"), window: input("window"),
    }, result: { kind: "output", name: "visual" } });
    const fragment = sealGraphFragment({ inputs: fragmentInputs, operations,
      exports: [{ name: "visual", type: compositionTypes.visualTrack, root: operation("render") }] });
    return { records, components: [{ id, fragment, inputs: bindings, outputs: { visual: `${id}.visual` }, range: declaration.range }] };
  },
};
const markupDeclaration = { name: "scene", tag: "Scene" } as const;
export const hypitPackage = { facets: [
    createModuleFacet(manifest), createGenerationModuleFacet(manifest),createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? []),
    createAuthorDeclarationFacet(authorDeclaration), createMarkupDeclarationFacet({ module, declaration: markupDeclaration })] };
export default hypitPackage;
