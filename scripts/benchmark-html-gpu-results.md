# Partial automated HTML GPU measurements

Measured on Apple M1 Pro / 32 GiB / macOS 27.0, with production renderer code at `608b5959`. The automated run was stopped at the user's request after 17 completed jobs. All 17 passed. The interrupted fourth repetition of the previous configuration is excluded.

Eight staggered/reversed 1080p video layers, 600 frames. Export seconds include Provider preparation, capture, encoding, muxing, full output decode validation and storage. Fresh isolated Node processes are used per job. Normal desktop applications remained open.

| Source / pending budget | Completed repetitions | Median seconds | Range, seconds | Median peak RSS, MiB | Median peak physical footprint, MiB | Decoder starts per export |
| --- | --- | --- | --- | --- | --- | --- |
| 1 GiB / 256 MiB | 3 | 22.287 | 20.046 to 23.114 | 1053 | 833 | 53 |
| 2.25 GiB / 128 MiB (defaults) | 3 | 16.097 | 15.490 to 17.835 | 1000 | 826 | 14 |
| 3 GiB / 128 MiB | 3 | 16.016 | 15.709 to 20.835 | 1000 | 830 | 14 |
| 4 GiB / 128 MiB | 4 | 17.254 | 15.686 to 25.486 | 994 | 827 | 14 |

The default configuration reduced the measured median from 22.287 to 16.097 seconds, approximately 28%. Three repetitions completed for both configurations; the planned five-repetition comparison remains incomplete. The 3 GiB median differs from the default by about 0.08 seconds in these observations. These results support retaining the current provisional defaults and do not establish an optimum.

Default configuration frame-ID checks passed: 5,400 timeline/source observations for eight layers, 1,800 observations for the two-video project and 600 timeline observations for complex MG. The ordinary video export took 12.13 seconds; the automatic-worker MG export took 18.61 seconds. Completed jobs left no observed descendants. The operator-cancelled job is recorded separately.

Memory is sampled every 250 ms across the export host and its descendants, including Electron processes that create separate process groups. RSS and macOS physical footprint are distinct from retained sample allocation and exclusive GPU memory. Only the corrected process-tree sampling run is summarized here.

The remaining queue repetitions, worker screening/finalists, 4K control exports, fastest-candidate frame-ID checks, low-budget cases, concurrent exports and fault/recovery cases were not reached in this run. Earlier manual results for those areas remain documented separately in PR #437.

The runner and fixture adapter passed Node syntax checks and the completed jobs above. The complete automatic sequence remains unvalidated. Raw job inputs, logs, results, memory samples and interrupted-job diagnostics are retained locally under `dist/autonomous-gpu-benchmark-v2/`. Runner usage is documented in `benchmark-html-gpu.md`.
