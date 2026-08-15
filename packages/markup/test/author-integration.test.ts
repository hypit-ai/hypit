import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  start,
} from "@narratage/core";
import {
  AuthorGraphError,
  elaborateAuthorGraph,
  sealGraphFragment,
} from "@narratage/elaborator";
import type { GraphFragment } from "@narratage/elaborator";
import type {
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@narratage/protocol";
import {
  MarkupFrontendError,
  MarkupSurfaceRegistry,
  decodeMarkup,
} from "@narratage/markup";
import type {
  StructuredElement,
  MarkupAttributeValue,
} from "@narratage/markup";

const laboratory = { name: "example.text-laboratory", version: "1" } as const;
const sampleType = { module: laboratory, name: "Sample" } satisfies TypeRef;
const measurementType = { module: laboratory, name: "Measurement" } satisfies TypeRef;
const reportType = { module: laboratory, name: "Report" } satisfies TypeRef;
const measureProducer = { module: laboratory, name: "measure" } satisfies ProducerRef;
const reportProducer = { module: laboratory, name: "write-report" } satisfies ProducerRef;
const sampleSurfaceDigest = digestOf("example.text-laboratory/sample-surface@1");
const measureSurfaceDigest = digestOf("example.text-laboratory/measure-surface@1");
const reportSurfaceDigest = digestOf("example.text-laboratory/report-surface@1");
const laboratorySurfaces = [
  { name: "sample", tag: "Sample", mode: "structured", outputs: [sampleType] },
  { name: "measure", tag: "Measure", mode: "structured", outputs: [] },
  { name: "report", tag: "Report", mode: "structured", outputs: [] },
] as const;

const manifest: ModuleManifest = {
  format: "narratage.module@1",
  name: laboratory.name,
  version: laboratory.version,
  dependencies: [],
  types: [
    { name: sampleType.name },
    { name: measurementType.name },
    { name: reportType.name },
  ],
  capabilities: [],
  producers: [
    {
      name: measureProducer.name,
      inputs: [{ name: "sample", type: sampleType }],
      outputs: [{ name: "measurement", type: measurementType }],
      needs: [],
    },
    {
      name: reportProducer.name,
      inputs: [{ name: "measurement", type: measurementType }],
      outputs: [{ name: "report", type: reportType }],
      needs: [],
    },
  ],
};

function singleOperationFragment(
  inputName: string,
  inputType: TypeRef,
  producer: ProducerRef,
  resultName: string,
  resultType: TypeRef,
): GraphFragment {
  return sealGraphFragment({
    inputs: [{ name: inputName, type: inputType }],
    operations: [{
      id: "produce",
      producer,
      inputs: { [inputName]: { kind: "fragment-input", name: inputName } },
      result: { kind: "output", name: resultName },
    }],
    exports: [{
      name: "result",
      type: resultType,
      root: { kind: "fragment-operation", operation: "produce" },
    }],
  });
}

const measureFragment = singleOperationFragment(
  "sample",
  sampleType,
  measureProducer,
  "measurement",
  measurementType,
);
const reportFragment = singleOperationFragment(
  "measurement",
  measurementType,
  reportProducer,
  "report",
  reportType,
);

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${element.name}.${name} must be a string`);
  return value;
}

function referenceAttribute(element: StructuredElement, name: string): string {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference" || value.path.length === 0) {
    throw new Error(`${element.name}.${name} must be a reference`);
  }
  return value.path;
}

function componentOutput(path: string): { readonly component: string; readonly output: string } {
  const separator = path.lastIndexOf(".");
  if (separator <= 0 || separator === path.length - 1) throw new Error(`${path} must name component.output`);
  return { component: path.slice(0, separator), output: path.slice(separator + 1) };
}

function registry(options: { readonly omitMeasureFragment?: boolean } = {}): MarkupSurfaceRegistry {
  const values = new MarkupSurfaceRegistry();
  values.registerStructured({
    module: laboratory,
    declaration: laboratorySurfaces[0],
    handler: ({ element }) => ({
    records: [{
      id: stringAttribute(element, "id"),
      type: sampleType,
      value: { kind: "inline", value: stringAttribute(element, "value") },
      range: element.range,
    }],
    components: [],
    fragments: [],
    }),
  });
  values.registerStructured({
    module: laboratory,
    declaration: laboratorySurfaces[1],
    handler: ({ element }) => {
    const id = stringAttribute(element, "id");
    return {
      records: [],
      components: [{
        id,
        fragment: measureFragment.id,
        inputs: { sample: { kind: "record", id: referenceAttribute(element, "sample") } },
        outputs: { result: `${id}.result` },
        range: element.range,
      }],
      fragments: options.omitMeasureFragment === true ? [] : [measureFragment],
    };
    },
  });
  values.registerStructured({
    module: laboratory,
    declaration: laboratorySurfaces[2],
    handler: ({ element }) => {
    const id = stringAttribute(element, "id");
    const measurement = componentOutput(referenceAttribute(element, "measurement"));
    return {
      records: [],
      components: [{
        id,
        fragment: reportFragment.id,
        inputs: {
          measurement: {
            kind: "component-output",
            component: measurement.component,
            output: measurement.output,
          },
        },
        outputs: { result: `${id}.result` },
        range: element.range,
      }],
      fragments: [reportFragment],
    };
    },
  });
  return values;
}

const closure = createResolvedClosure([manifest]);

function decode(text: string, surfaceRegistry = registry()) {
  return decodeMarkup(
    { name: "laboratory.svml", text },
    {
      closure,
      registry: surfaceRegistry,
      resolveModule: () => laboratory,
    },
  );
}

test("Markup Surfaces compile forward author references into a Core BuildPlan", async () => {
  const decoded = await decode(`<svml>
    <import as="lab" from="example.text-laboratory@1"/>
    <lab:Sample id="soil" value="soil"/>
    <lab:Report id="final" measurement={measurement.result}/>
    <lab:Measure id="measurement" sample={soil}/>
  </svml>`);

  assert.deepEqual(decoded.components.map((component) => component.id), ["final", "measurement"]);
  assert.deepEqual(decoded.fragments.map((fragment) => fragment.id).sort(), [
    measureFragment.id,
    reportFragment.id,
  ].sort());

  const program = link(closure, decoded.records);
  const catalog = new Map(decoded.fragments.map((fragment) => [fragment.id, fragment]));
  const elaborated = elaborateAuthorGraph(program, decoded.components, (id) => catalog.get(id));
  const state = start(program, elaborated, sealBuildRequest({
    graph: elaborated.id,
    targets: [{ output: "final.result" }],
  }));

  assert.deepEqual(
    state.plan.steps.map((step) => step.producer.name).sort(),
    [measureProducer.name, reportProducer.name].sort(),
  );
  const measurementStep = state.plan.steps.find((step) => step.producer.name === measureProducer.name);
  const reportStep = state.plan.steps.find((step) => step.producer.name === reportProducer.name);
  assert.equal(reportStep?.inputs.measurement, measurementStep?.outputs.measurement);
});

test("component source reflow does not change decoded component meaning", async () => {
  const compact = await decode(`<svml><import as="lab" from="example.text-laboratory@1"/><lab:Sample id="soil" value="soil"/><lab:Measure id="measurement" sample={soil}/></svml>`);
  const multiline = await decode(`<svml>
    <import as="lab" from="example.text-laboratory@1"/>
    <lab:Sample
      id="soil"
      value="soil"
    />
    <lab:Measure
      id="measurement"
      sample={soil}
    />
  </svml>`);
  assert.deepEqual(compact.components, multiline.components);
});

test("Markup rejects a component whose Surface omits its Fragment definition", async () => {
  await assert.rejects(
    decode(`<svml>
      <import as="lab" from="example.text-laboratory@1"/>
      <lab:Sample id="soil" value="soil"/>
      <lab:Measure id="measurement" sample={soil}/>
    </svml>`, registry({ omitMeasureFragment: true })),
    (error: unknown) => error instanceof MarkupFrontendError
      && error.code === "MARKUP_COMPONENT_FRAGMENT_MISSING",
  );
});

test("unknown component references remain inert until whole-document Author linking", async () => {
  const decoded = await decode(`<svml>
    <import as="lab" from="example.text-laboratory@1"/>
    <lab:Report id="final" measurement={missing.result}/>
  </svml>`);
  const program = link(closure, decoded.records);
  const catalog = new Map(decoded.fragments.map((fragment) => [fragment.id, fragment]));
  assert.throws(
    () => elaborateAuthorGraph(program, decoded.components, (id) => catalog.get(id)),
    (error: unknown) => error instanceof AuthorGraphError
      && error.code === "UNKNOWN_AUTHOR_COMPONENT",
  );
});

test("Markup rejects duplicate component identities before Author linking", async () => {
  await assert.rejects(
    decode(`<svml>
      <import as="lab" from="example.text-laboratory@1"/>
      <lab:Sample id="soil" value="soil"/>
      <lab:Measure id="measurement" sample={soil}/>
      <lab:Measure id="measurement" sample={soil}/>
    </svml>`),
    (error: unknown) => error instanceof MarkupFrontendError
      && error.code === "MARKUP_COMPONENT_DUPLICATE",
  );
});
