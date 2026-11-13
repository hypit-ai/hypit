import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function median(values) {
  values = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

export function summarizeBenchmark(state) {
  const groups = new Map();
  for (const result of state.results) for (const item of result.exports ?? []) {
    if (!item.group) continue;
    const key = `${item.group} / ${item.doc} / ${JSON.stringify(item.config)}`;
    const group = groups.get(key) ?? { key, group: item.group, fixture: item.doc, config: item.config, all: [] };
    group.all.push({ ...item, passed: result.passed, rss: result.peakRssMiB, footprint: result.peakFootprintMiB });
    groups.set(key, group);
  }
  const rows = [...groups.values()].map(({ all, ...group }) => {
    const good = all.filter(item => item.passed);
    const times = good.map(item => item.seconds);
    return { ...group, completed: good.length, failed: all.length - good.length,
      frameCounts: [...new Set(good.map(item => item.frames))],
      medianSeconds: median(times), minSeconds: times.length ? Math.min(...times) : null,
      maxSeconds: times.length ? Math.max(...times) : null,
      medianPeakRssMiB: median(good.map(item => item.rss)),
      medianPeakFootprintMiB: median(good.map(item => item.footprint)),
      decoderStarts: good.map(item => item.videoStats?.reduce((sum, value) => sum + value.decoderStarts, 0)),
      samplesRead: good.map(item => item.videoStats?.reduce((sum, value) => sum + value.samplesRead, 0)),
      retainedSamplePeakBytes: good.map(item => item.videoStats?.reduce((sum, value) => sum + value.peak, 0)),
    };
  });
  const checked = state.results.flatMap(result => (result.exports ?? [])
    .filter(item => item.verification).map(item => ({ job: result.id, item: item.id, passed: result.passed, ...item.verification })));
  return { status: state.status ?? 'running', head: state.head, host: state.host, repetitions: state.repetitions,
    startedAt: state.startedAt, finishedAt: state.finishedAt, resumptions: state.resumptions ?? [],
    completedJobs: state.results.length, failedJobs: state.results.filter(result => !result.passed).map(result => result.id),
    successfulExports: state.results.filter(result => result.passed).flatMap(result => result.exports ?? [])
      .filter(item => !item.error).length,
    expectedFailures: state.results.filter(result => result.passed).flatMap(result => result.exports ?? [])
      .filter(item => item.action && item.error).length,
    verifiedObservations: checked.reduce((sum, item) => sum + (item.observations ?? 0), 0),
    verificationFailures: checked.filter(item => item.error || item.mismatches || !item.passed), checked, rows,
    additionalCases: state.results.filter(result => !(result.exports ?? []).some(item => item.group))
      .map(result => ({ id: result.id, passed: result.passed, seconds: result.seconds,
        exports: result.exports?.length ?? 0, peakRssMiB: result.peakRssMiB, peakFootprintMiB: result.peakFootprintMiB })),
    leaks: state.results.flatMap(result => (result.leaked ?? []).map(process => ({ job: result.id, ...process }))),
  };
}

export function benchmarkMarkdown(summary) {
  const n = value => Number.isFinite(value) ? value.toFixed(3) : 'n/a';
  const host = summary.host;
  const lines = ['# HTML GPU export measurements', '',
    `Status: ${summary.status}. Renderer baseline: \`${summary.head}\`. Target repetitions: ${summary.repetitions}.`, '',
    `Host: ${host.cpu}, ${(host.totalMemoryMiB / 1024).toFixed(0)} GiB RAM, ${host.platform} ${host.release}, Node ${host.node}.`, '',
    `Completed jobs: ${summary.completedJobs}. Successful exports: ${summary.successfulExports}. Expected injected failures: ${summary.expectedFailures}. Failed jobs: ${summary.failedJobs.length}.`, '',
    '## Measurement settings', '',
    'Export seconds include Provider preparation, capture, encoding, muxing, full output decode validation and storage. Independent frame-ID checks run afterward. Each job starts a fresh Node process; the prepared Electron cache persists. Normal desktop activity remains uncontrolled.', '',
    'Memory is sampled every 250 ms across the export host and its descendants, including Electron processes with independent process groups. RSS, macOS physical footprint and retained sample allocation are distinct quantities. Exclusive device memory is not measured.', '',
    'The four-layer 4K video case composes 1080p sources. The scaled 4K MG case retains authored Canvas raster resolutions. Timing-only jobs keep output in memory; independent verification jobs also save MP4 files.', '',
    '## Timing and memory results', '',
    '| Group | Fixture | Configuration | Frames per export | Completed | Failed | Median seconds | Range, seconds | Median peak RSS, MiB | Median peak physical footprint, MiB |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const row of summary.rows) lines.push(`| ${row.group} | ${row.fixture} | ${JSON.stringify(row.config)} | ${row.frameCounts.join(" / ")} | ${row.completed} | ${row.failed} | ${n(row.medianSeconds)} | ${n(row.minSeconds)} to ${n(row.maxSeconds)} | ${n(row.medianPeakRssMiB)} | ${n(row.medianPeakFootprintMiB)} |`);
  lines.push('', 'Each fixture is summarized separately. Worker finalists were selected from one screening observation; their initial observations are subject to selection bias. Source and queue configurations are interleaved. These measurements describe the tested fixtures and do not establish a universal optimum.', '',
    '## Frame identifiers and cleanup', '',
    `Independent frame-ID observations: ${summary.verifiedObservations}. Failed verification records: ${summary.verificationFailures.length}. Observed processes remaining after completed jobs: ${summary.leaks.length}.`, '',
    '| Job | Export | Observations | Mismatches | Verification error |', '| --- | --- | --- | --- | --- |');
  for (const item of summary.checked) lines.push(`| ${item.job} | ${item.item} | ${item.observations ?? 'n/a'} | ${item.mismatches ?? 'n/a'} | ${item.error ?? ''} |`);
  lines.push('', '## Additional cases', '',
    '| Job | Passed | Exports | Batch seconds | Peak RSS, MiB | Peak physical footprint, MiB |',
    '| --- | --- | --- | --- | --- | --- |');
  for (const item of summary.additionalCases) lines.push(`| ${item.id} | ${item.passed} | ${item.exports} | ${n(item.seconds)} | ${n(item.peakRssMiB)} | ${n(item.peakFootprintMiB)} |`);
  lines.push('', 'Injected cancellation and renderer termination pass when the intended export fails, its action was triggered, peers complete correctly and cleanup succeeds. Recovery is measured in a subsequent job.', '', '## Experiment sessions', '',
    `Started: ${summary.startedAt}. Finished: ${summary.finishedAt ?? 'in progress'}.`);
  for (const session of summary.resumptions) lines.push('', `Resumed: ${session.at}, checkout \`${session.head}\`. ${session.reason}`);
  if (summary.resumptions.length) lines.push('', 'Completed observations span interrupted and resumed sessions. Medians and ranges retain both sessions; desktop load may differ between them.');
  lines.push('', `Failed jobs: ${summary.failedJobs.join(', ') || 'none'}.`, '',
    'Raw case inputs, logs, results, environment snapshots and memory samples are stored in state.json and jobs/ beside the generated report. Runner usage is documented in benchmark-html-gpu.md.', '');
  return lines.join('\n');
}

export async function writeBenchmarkReport(directory, state) {
  const summary = summarizeBenchmark(state);
  for (const [name, contents] of [
    ['summary.json', JSON.stringify(summary, null, 2)], ['REPORT.md', benchmarkMarkdown(summary)],
  ]) {
    await writeFile(resolve(directory, name + '.tmp'), contents);
    await rename(resolve(directory, name + '.tmp'), resolve(directory, name));
  }
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(process.argv[2] ?? 'dist/html-gpu-benchmark');
  const state = JSON.parse(await readFile(resolve(directory, 'state.json'), 'utf8'));
  await writeBenchmarkReport(directory, state);
  console.log(resolve(directory, 'REPORT.md'));
}
