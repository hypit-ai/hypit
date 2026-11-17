const zero = { ticks: "0", timeBase: { numerator: 1, denominator: 1 } };
function gainOperator(process, context) {
  const controlled = context.parameters.kind === "keyframes";
  return {
    id: `${process.id}:operator`,
    implementation: { package: "@hypit/audio-effects", symbol: "gain" },
    parameters: structuredClone(context.parameters),
    inputs: ["signal"],
    temporalControls: controlled ? { gain: { id: `${process.id}:gain`, duration: structuredClone(context.controlDuration) } } : {},
    temporalSupport: { inputs: { signal: { before: zero, after: zero } }, tail: zero },
  };
}
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
export const hypitPackage = {
  package: "@hypit/audio-effects",
  contributions: [
    { kind: "hypit.nle-lowering", value: { audioProcesses: [{ symbol: "gain", resolve: gainOperator }] } },
    { kind: "hypit.audiovisual-audio", value: { operators: [{
      symbol: "gain",
      compile: operator => ({
        filter: `{{input:signal}}volume='${gainExpression(operator.parameters)}':eval=frame{{output}}`,
      }),
    }] } },
  ],
  catalog: [],
};
