# HTML GPU export benchmark

Run from the repository with installed workspace dependencies, Node.js, FFmpeg,
FFprobe and a prepared Electron renderer. The measurement runner uses macOS
process groups and physical-footprint sampling. Use the compiled projects from
the PR #437 video and complex-MG benchmark fixtures.

```sh
node --import tsx scripts/benchmark-html-gpu.mjs \
  --video-project /path/to/video-project \
  --mg-project /path/to/complex-mg \
  --out dist/html-gpu-benchmark
```

Each project supplies `output/program.json`, `output/resources.json` and the
resource files referenced by that map. The video project contains two 360-frame,
1080p30 sources with frame identifiers. Source identifiers occupy the first
320 pixels at the bottom of each source, using ten 32-pixel bits. The composed
video and MG projects contain timeline identifiers at the coordinates documented
in `html-gpu-benchmark-fixtures.mjs`. Preflight checks verify these identifiers
before parameter comparisons start.

The script runs the complete sequence without further input:

1. Warm up and verify default video, eight-layer and MG frame identifiers.
2. Compare four source/queue configurations in five interleaved repetitions.
3. Compare 128, 256 and 512 MiB pending queues in five interleaved repetitions.
4. Screen MG worker counts, then repeat the two fastest candidates to five
   observations each. Compare two/four workers for staggered video.
5. Export aligned video, 4K video composition and scaled 4K MG with defaults.
6. Verify the fastest complete source/queue candidate's layer identifiers.
7. Verify two/four concurrent exports, cancellation and renderer termination
   alongside a successful export, then verify recovery.

`--repetitions` accepts five or more repetitions. Each timed job starts an
isolated Node process. Export wall time includes Provider preparation, capture,
encoding, muxing, full output decode validation and storage. Independent frame-ID
verification runs afterward. Sampling measures the isolated export host and its
descendants. Retained sample allocation, RSS and macOS physical footprint have
different meanings. Device memory is not measured separately.

The source/queue comparison includes the previous 1 GiB / 256 MiB configuration,
the current defaults and explicit 3/4 GiB / 128 MiB configurations. Worker
finalists are selected from one screening observation, so their initial
observations are subject to selection bias. The report preserves all runs and
failed cases. Compare medians and ranges within the measured fixtures.

Every job writes its logs, input, result and memory samples under `jobs/`.
`state.json`, `summary.json` and `REPORT.md` update after each job. Rerunning the
same command resumes remaining jobs when source and input fingerprints match.
Completed failures stay in the report; use a fresh output directory for a new
experiment. Concurrent runners sharing an output directory are rejected.

Each job has a five-minute deadline followed by bounded process-group cleanup.
Signals interrupt the current job and leave remaining work available for resume.
Before each job, the runner requires at least 2 GiB of free output-volume space.
Exports used for independent verification are saved; timing-only exports stay in
memory. The runner records failed exports and proceeds through independent cases.
A frame-ID preflight failure stops the experiment before parameter comparisons.

The script produces local reports. PR descriptions and repository changes are
published separately after reviewing those reports.
