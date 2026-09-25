import { artifactTypes } from "@hypit/artifact";
import {
  sealGenerationPortTable,
  sealGenerationRequestDraft,
  sealGenerationMediaBinding,
} from "@hypit/generation";
import type {
  GenerationPortTable,
  GenerationPortValue,
  GenerationMediaPort,
  GenerationRequestDraft,
} from "@hypit/generation";
import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import type {
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  StructuredElement,
} from "@hypit/markup";
import {
  defineExactModelModule,
  createExactModelPrimaryGenerationFragment,
  exactModelTextInputName,
  exactModelMediaInputNames,
} from "@hypit/model-kit";
import type {
  ExactModelMediaInput,
  ExactModelTextInput,
} from "@hypit/model-kit";
import type { CanonicalValue } from "@hypit/protocol";
import { textTypes } from "@hypit/text";

export interface DirectModel extends GenerationPortTable {
  readonly path: string;
  readonly fields: Readonly<
    Record<
      string,
      {
        readonly field: string;
        readonly array?: boolean;
        readonly veo?: boolean;
      }
    >
  >;
  readonly gated?: boolean;
  readonly operation?: string;
}
export function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function createDirectModels(
  name: string,
  catalog: readonly DirectModel[],
  validate?: (model: DirectModel, input: GenerationRequestDraft) => void,
) {
  const module = { name, version: "1" } as const;
  const definition = defineExactModelModule({
    module,
    endpoints: catalog.map((m, i) => ({
      key: m.model,
      requestTypeName: `Model${i}Request`,
      producerName: `generate-${i}`,
      ports: sealGenerationPortTable(m),
      ...(validate
        ? {
            validateInputs: (input: GenerationRequestDraft) =>
              validate(m, input),
          }
        : {}),
    })),
  });
  const str = (e: StructuredElement, n: string) => {
    const v = e.attributes[n];
    assert(
      typeof v === "string" && v.length > 0,
      `${e.name}.${n} must be a string`,
    );
    return v;
  };
  const handler: StructuredSurfaceHandler = ({ element, resolveReference }) => {
    const id = str(element, "id"),
      model = str(element, "model"),
      endpoint = definition.endpoints[model];
    assert(endpoint, `Unknown exact model ${model}`);
    const values: Record<string, GenerationPortValue[]> = {};
    const media: {
      input: ExactModelMediaInput;
      source: SurfaceResolvedReference;
      binding: ReturnType<typeof sealGenerationMediaBinding>;
    }[] = [];
    const texts: {
      input: ExactModelTextInput;
      source: SurfaceResolvedReference;
    }[] = [];
    const resolve = (
      e: StructuredElement,
      attribute: string,
      type: SurfaceResolvedReference["type"],
    ) => {
      const v = e.attributes[attribute];
      assert(
        typeof v === "object" && v !== null && v.kind === "reference",
        `${e.name}.${attribute} must reference an Output`,
      );
      const ref = resolveReference(v.path);
      assert(
        ref &&
          ref.type.module.name === type.module.name &&
          ref.type.module.version === type.module.version &&
          ref.type.name === type.name,
        `${e.name}.${attribute} has the wrong type`,
      );
      return ref;
    };
    for (const [key, v] of Object.entries(element.attributes)) {
      if (key === "id" || key === "model") continue;
      const port = endpoint.ports.ports.find((p) => p.name === key);
      assert(
        port && port.value.kind !== "media",
        `Unsupported ${model} attribute ${key}`,
      );
      if (typeof v === "object" && v !== null && v.kind === "reference") {
        assert(
          port.value.kind === "text",
          `${key} accepts a Text reference only`,
        );
        texts.push({
          input: { name: key, port: key },
          source: resolve(element, key, textTypes.text),
        });
        continue;
      }
      assert(typeof v === "string", `${key} must be a literal`);
      const kind = port.value;
      let value: string | number | boolean = v;
      if (kind.kind === "boolean") {
        assert(v === "true" || v === "false", `${key} must be true or false`);
        value = v === "true";
      } else if (
        kind.kind === "number" ||
        (kind.kind === "enum" &&
          kind.values.every((x) => typeof x === "number"))
      ) {
        assert(v.trim() !== "", `${key} is empty`);
        value = Number(v);
      }
      values[key] = [value];
    }
    for (const child of element.children) {
      if (child.kind === "text") {
        assert(
          child.value.trim() === "",
          `${element.name} uses named attributes or Input children for text`,
        );
        continue;
      }
      assert(
        child.name.split(":").at(-1) === "Input",
        `Unsupported child ${child.name}`,
      );
      const key = str(child, "port"),
        port = endpoint.ports.ports.find((p) => p.name === key);
      assert(port, `Unknown ${model} port ${key}`);
      if (port.value.kind === "media") {
        const fields: Record<string, string | number | boolean> = {};
        for (const [key, v] of Object.entries(child.attributes)) {
          if (key === "port" || key === "source") continue;
          const field = port.value.itemFields?.find((f) => f.name === key);
          assert(field && typeof v === "string", `Unknown media field ${key}`);
          fields[key] =
            field.value.kind === "boolean"
              ? v === "true"
              : field.value.kind === "number"
                ? Number(v)
                : v;
          if (field.value.kind === "boolean")
            assert(v === "true" || v === "false", `${key} must be boolean`);
        }
        assert(
          child.children.every(
            (c) => c.kind === "text" && c.value.trim() === "",
          ),
          "Media Input must be empty",
        );
        media.push({
          input: { name: `media${media.length}`, port: key },
          source: resolve(child, "source", artifactTypes.blob),
          binding: sealGenerationMediaBinding(port as GenerationMediaPort, {
            role: port.value.accepts[0]!,
            ...(Object.keys(fields).length ? { fields } : {}),
          }),
        });
      } else {
        assert(
          port.value.kind === "text",
          `Input text requires a text port, got ${key}`,
        );
        assert(
          Object.keys(child.attributes).every((k) => k === "port"),
          `Text Input only takes port`,
        );
        assert(
          child.children.every((c) => c.kind === "text"),
          "Text Input cannot contain elements",
        );
        (values[key] ??= []).push(
          child.children
            .map((c) => (c.kind === "text" ? c.value : ""))
            .join("")
            .trim(),
        );
      }
    }
    const draft = sealGenerationRequestDraft(endpoint.ports, values);
    endpoint.validateDraft(draft);
    const records = [
      {
        id: `${id}.draft`,
        type: endpoint.draftType,
        value: {
          kind: "inline" as const,
          value: draft as unknown as CanonicalValue,
        },
        range: element.range,
      },
    ];
    const inputs: Record<string, SurfaceResolvedReference["ref"]> = {
      draft: { kind: "record", id: `${id}.draft` },
    };
    for (const t of texts)
      inputs[exactModelTextInputName(t.input.name)] = t.source.ref;
    for (const m of media) {
      const names = exactModelMediaInputNames(m.input.name),
        bid = `${id}.${m.input.name}.binding`;
      records.push({
        id: bid,
        type: endpoint.mediaBindings[m.input.port]!.type,
        value: {
          kind: "inline",
          value: m.binding as unknown as CanonicalValue,
        },
        range: element.range,
      });
      inputs[names.binding] = { kind: "record", id: bid };
      inputs[names.artifact] = m.source.ref;
    }
    const fragment = createExactModelPrimaryGenerationFragment(
      endpoint,
      media.map((m) => m.input),
      texts.map((t) => t.input),
    );
    const output = endpoint.ports.result;
    return {
      records,
      fragments: [fragment],
      components: [
        {
          id,
          fragment: fragment.id,
          inputs,
          outputs: { [output]: `${id}.${output}` },
          range: element.range,
        },
      ],
    };
  };
  const declaration = {
    name: "generate",
    tag: "Generate",
    mode: "structured" as const,
    outputs: Object.values(definition.endpoints).flatMap((e) => [
      e.draftType,
      ...Object.values(e.mediaBindings).map((b) => b.type),
    ]),
    vocabulary: {
      summary: "Generate media with an exact model and its declared ports.",
      attributes: [
        {
          name: "id",
          kind: "identifier" as const,
          required: true,
          summary: "Output prefix.",
        },
        {
          name: "model",
          kind: "literal" as const,
          required: true,
          summary: `Exact model: ${catalog.map((m) => m.model).join(", ")}`,
        },
      ],
      ports: [],
      example:
        '<direct:Generate id="shot" model="MODEL" prompt="A clear product shot"/>',
      text: "Use exact model scalar attributes, Text references, or Input children; see the model catalog.",
    },
  };
  return {
    definition,
    module,
    hypitPackage: {
      format: "hypit.node-package@1" as const,
      modules: [{ manifest: definition.manifest }],
      components: [definition.component],
      hostFacets: [
        definition.hostFacet,
        createMarkupSurfaceHostFacet({ module, declaration, handler }),
      ],
    },
  };
}
