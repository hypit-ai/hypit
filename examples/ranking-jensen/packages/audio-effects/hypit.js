const packageName = "@hypit/audio-effects";
const gainSymbol = { package: packageName, symbol: "gain" };
const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
function gainExpression(parameters) {
  if (parameters.kind === "constant") return String(parameters.gain);
  const control = "{{control:gain}}";
  const frames = parameters.keyframes;
  let expression = String(frames.at(-1).gain);
  for (let index = frames.length - 2; index >= 0; index -= 1) {
    const left = frames[index]; const right = frames[index + 1];
    const from = seconds(left.at); const to = seconds(right.at);
    const linear = `(${left.gain}+(${right.gain-left.gain})*(${control}-${from})/${to-from})`;
    expression = `if(lt(${control}\\,${to})\\,${linear}\\,${expression})`;
  }
  return expression;
}
const timeKey = at => `${at.ticks} × ${at.timeBase.numerator}/${at.timeBase.denominator} s`;

function gainInspector({ process, parameters }) {
  const gainField = (id, value, operation) => ({
    id, label: "Gain", control: "number", value, minimum: 0, step: 0.01, unit: "×", operation,
  });
  const fields = [{ id: "kind", label: "Mode", control: "readout", value: parameters.kind }];
  if (parameters.kind === "constant") {
    fields.push(gainField("gain", parameters.gain, value => ({ kind: "gain.set", value })));
  }
  const collections = parameters.kind === "keyframes" ? [{
    id: "keyframes", label: "Keyframes",
    rows: parameters.keyframes.map(({ at, gain }) => {
      const id = timeKey(at);
      return { id, label: id, fields: [
        gainField(`gain:${id}`, gain, value => ({ kind: "gain.keyframe.set", at: id, value })),
      ] };
    }),
  }] : [];
  return [{ id: "parameters", label: `Gain · ${process.id}`, domain: "how", fields, collections }];
}

function editGain(operation, { parameters }) {
  if (!Number.isFinite(operation.value) || operation.value < 0) throw new Error("Gain must be finite and nonnegative.");
  if (operation.kind === "gain.set" && parameters.kind === "constant") return { ...parameters, gain: operation.value };
  if (operation.kind === "gain.keyframe.set" && parameters.kind === "keyframes") {
    const keyframes = [...parameters.keyframes];
    const index = keyframes.findIndex(({ at }) => timeKey(at) === operation.at);
    if (index >= 0) {
      keyframes[index] = { ...keyframes[index], gain: operation.value };
      return { ...parameters, keyframes };
    }
  }
  throw new Error("Gain edit does not address a current value.");
}

export const hypitPackage = {
  package: packageName,
  contributions: [
    { kind: "hypit.nle-authoring", value: {
      kind: "hypit.nle-authoring", package: packageName, components: [], componentValues: [],
      operators: [{ operator: gainSymbol, timeWindow: () => true, editParameters: editGain }],
    } },
    { kind: "hypit.nle-inspector-presentation", value: {
      kind: "hypit.nle-inspector-presentation", package: packageName, components: [], componentValues: [],
      operators: [{ operator: gainSymbol, project: gainInspector }],
    } },
    { kind: "hypit.nle-render", value: { audioProcesses: [{
      symbol: "gain",
      render: (_process, { parameters }) => ({
        controls: parameters.kind === "keyframes" ? ["gain"] : [],
        filter: { filter: `{{input:signal}}volume='${gainExpression(parameters)}':eval=frame{{output}}` },
      }),
    }] } },
  ],
  catalog: [{ id: "gain", kind: "hypit.nle-process", title: "Gain", value: {
    medium: "audio", operator: gainSymbol, parameters: { kind: "constant", gain: 1 },
  } }],
};
