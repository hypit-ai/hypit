# HTML GPU export measurements

Status: completed. Renderer baseline: `608b595988a5c0d15a3f8880a1066d977fee59c4`. Target repetitions: 5.

Host: Apple M1 Pro, 32 GiB RAM, darwin 27.0.0, Node v26.0.0.

Completed jobs: 76. Successful exports: 80. Expected injected failures: 2. Failed jobs: 0.

## Current defaults and interpretation

Retain a 2.25 GiB source-sample budget and a 128 MiB pending-frame budget. The five-observation staggered-video median decreased from 23.114 to 17.835 seconds, a 22.8% reduction. Decoder iterator starts decreased from 53 to 14. The 3/4 GiB cases also used 14 starts. Logical sample budgets do not establish total process or GPU memory usage.

For 1080p MG with four workers, 128/256/512 MiB pending queues produced five-observation medians of 16.044/16.259/16.150 seconds. Retain automatic worker selection: its five-observation MG median was 16.690 seconds, versus 20.377 for four workers and 18.265 for six. Other explicit worker counts have single screening observations. The timing ranges overlap, and sessions include uncontrolled desktop load; these measurements do not establish a universal optimum.

The automatic video strategy remains one scene. The two/four-worker staggered-video screening exports took 28.974/48.136 seconds. The 4K video control exported 300 frames; the scaled 4K MG control exported 600 frames. Their results are summarized separately below.

## Repository validation

Repository type checking passed. The initial local full suite completed with 1,121 passes, two process-test timeouts and 24 skips. Those two tests passed in an isolated sequential run together with the Provider suite: 64 passed, 11 skipped. The cause of the initial timeouts is unconfirmed. Both Windows and Linux full CI checks, independent npm package verification and the other CI checks passed at `feefcbb9`; subsequent harness/report commits receive their own CI run.

The existing default-value assertions were updated to the selected budgets. Report grouping now includes the fixture name. Resume identities cover actual production source, harness, inputs and host rather than documentation-only commit changes. Legacy state migrated after comparing the original source, harness, fixture fingerprint and host. Resuming the completed experiment retained all 76 jobs and started no exports.

The complete dataset contains 76 passed jobs, 80 successful exports, two expected injected failures and 31,200 independently checked frame identifiers with zero mismatches. No completed job left observed descendants. Earlier Windows/Linux package checks do not establish GPU hardware compatibility; the GPU measurements here cover Apple Silicon macOS.

## Measurement settings

Export seconds include Provider preparation, capture, encoding, muxing, full output decode validation and storage. Independent frame-ID checks run afterward. Each job starts a fresh Node process; the prepared Electron cache persists. Normal desktop activity remains uncontrolled.

Memory is sampled every 250 ms across the export host and its descendants, including Electron processes with independent process groups. RSS, macOS physical footprint and retained sample allocation are distinct quantities. Exclusive device memory is not measured.

The four-layer 4K video case composes 1080p sources. The scaled 4K MG case retains authored Canvas raster resolutions. Timing-only jobs keep output in memory; independent verification jobs also save MP4 files.

## Timing and memory results

| Group | Fixture | Configuration | Frames per export | Completed | Failed | Median seconds | Range, seconds | Median peak RSS, MiB | Median peak physical footprint, MiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| defaults | video | {} | 600 | 1 | 0 | 12.132 | 12.132 to 12.132 | 961.953 | 658.547 |
| source | staggered | {"workers":1,"maxDecodedSourceBytes":1073741824,"maxPendingFrameBytes":268435456} | 600 | 5 | 0 | 23.114 | 20.046 to 29.098 | 1049.422 | 832.172 |
| source | staggered | {} | 600 | 5 | 0 | 17.835 | 15.490 to 23.682 | 995.719 | 825.501 |
| source | staggered | {"workers":1,"maxDecodedSourceBytes":3221225472,"maxPendingFrameBytes":134217728} | 600 | 5 | 0 | 20.835 | 15.709 to 37.089 | 929.641 | 821.501 |
| source | staggered | {"workers":1,"maxDecodedSourceBytes":4294967296,"maxPendingFrameBytes":134217728} | 600 | 5 | 0 | 18.651 | 15.686 to 25.486 | 993.078 | 825.703 |
| queue | mg | {"workers":4,"maxPendingFrameBytes":134217728} | 600 | 5 | 0 | 16.044 | 14.705 to 21.481 | 1765.703 | 1840.161 |
| queue | mg | {"workers":4,"maxPendingFrameBytes":268435456} | 600 | 5 | 0 | 16.259 | 15.376 to 21.019 | 1719.000 | 1892.521 |
| queue | mg | {"workers":4,"maxPendingFrameBytes":536870912} | 600 | 5 | 0 | 16.150 | 14.894 to 16.829 | 1778.578 | 1849.005 |
| workers | mg | {"workers":1} | 600 | 1 | 0 | 26.855 | 26.855 to 26.855 | 896.109 | 849.235 |
| workers | mg | {"workers":2} | 600 | 1 | 0 | 21.917 | 21.917 to 21.917 | 1300.406 | 1238.658 |
| workers | mg | {"workers":3} | 600 | 1 | 0 | 16.295 | 16.295 to 16.295 | 1530.266 | 1540.020 |
| workers | mg | {"workers":4} | 600 | 5 | 0 | 20.377 | 14.456 to 24.258 | 1583.844 | 1816.255 |
| workers | mg | {"workers":6} | 600 | 5 | 0 | 18.265 | 15.083 to 21.226 | 2029.563 | 2402.337 |
| workers | mg | {"workers":8} | 600 | 1 | 0 | 17.077 | 17.077 to 17.077 | 2284.375 | 2902.840 |
| workers | mg | {"workers":"auto"} | 600 | 5 | 0 | 16.690 | 16.103 to 18.608 | 2738.469 | 2914.778 |
| video-workers | staggered | {"workers":2} | 600 | 1 | 0 | 28.974 | 28.974 to 28.974 | 986.266 | 1297.597 |
| video-workers | staggered | {"workers":4} | 600 | 1 | 0 | 48.136 | 48.136 to 48.136 | 1473.688 | 1913.459 |
| defaults | aligned | {} | 600 | 1 | 0 | 13.349 | 13.349 to 13.349 | 962.688 | 815.828 |
| defaults | mg4k | {} | 600 | 1 | 0 | 46.725 | 46.725 to 46.725 | 2715.266 | 5292.106 |
| defaults | uhd | {} | 300 | 1 | 0 | 19.586 | 19.586 to 19.586 | 988.422 | 1170.298 |
| workers | mg | {"workers":5} | 600 | 1 | 0 | 16.053 | 16.053 to 16.053 | 2085.453 | 2171.366 |
| workers | mg | {"workers":7} | 600 | 1 | 0 | 15.687 | 15.687 to 15.687 | 2512.344 | 2696.010 |

Each fixture is summarized separately. Worker finalists were selected from one screening observation; their initial observations are subject to selection bias. Source and queue configurations are interleaved. These measurements describe the tested fixtures and do not establish a universal optimum.

## Frame identifiers and cleanup

Independent frame-ID observations: 31200. Failed verification records: 0. Observed processes remaining after completed jobs: 0.

| Job | Export | Observations | Mismatches | Verification error |
| --- | --- | --- | --- | --- |
| accuracy-defaults | accuracy-defaults | 5400 | 0 |  |
| defaults-video | defaults-video | 1800 | 0 |  |
| mg-defaults | mg-defaults | 600 | 0 |  |
| accuracy-workers-6 | accuracy-workers-6 | 600 | 0 |  |
| accuracy-workers-4 | accuracy-workers-4 | 600 | 0 |  |
| accuracy-queue-fastest | accuracy-queue-fastest | 600 | 0 |  |
| accuracy-low-cache | accuracy-low-cache | 1080 | 0 |  |
| accuracy-small-queue | accuracy-small-queue | 120 | 0 |  |
| accuracy-fastest | accuracy-fastest | 5400 | 0 |  |
| concurrent-2 | concurrent-2-0 | 1800 | 0 |  |
| concurrent-2 | concurrent-2-1 | 1800 | 0 |  |
| concurrent-4 | concurrent-4-0 | 1800 | 0 |  |
| concurrent-4 | concurrent-4-1 | 1800 | 0 |  |
| concurrent-4 | concurrent-4-2 | 1800 | 0 |  |
| concurrent-4 | concurrent-4-3 | 1800 | 0 |  |
| concurrent-faults | fault-peer | 1800 | 0 |  |
| recovery | recovery | 1800 | 0 |  |
| accuracy-workers-auto | accuracy-workers-auto | 600 | 0 |  |

## Additional cases

| Job | Passed | Exports | Batch seconds | Peak RSS, MiB | Peak physical footprint, MiB |
| --- | --- | --- | --- | --- | --- |
| warmup | true | 1 | 3.500 | 834.484 | 560.438 |
| accuracy-defaults | true | 1 | 16.045 | 988.125 | 800.938 |
| mg-defaults | true | 1 | 18.630 | 2742.813 | 2866.371 |
| accuracy-workers-6 | true | 1 | 18.996 | 1952.984 | 2395.212 |
| accuracy-workers-4 | true | 1 | 21.000 | 1598.844 | 1855.787 |
| accuracy-queue-fastest | true | 1 | 19.164 | 1818.563 | 1799.818 |
| accuracy-low-cache | true | 1 | 37.242 | 873.203 | 730.188 |
| accuracy-small-queue | true | 1 | 9.752 | 1445.641 | 1150.067 |
| accuracy-fastest | true | 1 | 18.080 | 881.594 | 821.688 |
| concurrent-2 | true | 2 | 28.753 | 1443.922 | 1085.193 |
| concurrent-4 | true | 4 | 30.303 | 2702.125 | 2379.132 |
| concurrent-faults | true | 3 | 17.159 | 1637.203 | 827.317 |
| recovery | true | 1 | 14.624 | 959.219 | 635.063 |
| accuracy-workers-auto | true | 1 | 15.274 | 2764.234 | 2947.278 |

Injected cancellation and renderer termination pass when the intended export fails, its action was triggered, peers complete correctly and cleanup succeeds. Recovery is measured in a subsequent job.

## Experiment sessions

Started: 2026-10-24T21:01:42.289Z. Finished: 2026-10-26T12:45:24.615Z.

Resumed: 2026-10-26T12:13:57.835Z, checkout `feefcbb933a04fe4e513b19d3d9d265ee4788768`. Committed benchmark scripts and corrected stale default assertions; renderer/dependency trees and original input fingerprint verified unchanged.

Resumed: 2026-10-26T12:37:05.806Z, checkout `ca0e9cbc2bea42a3256c3a784ea14fb6f153768d`. Extend worker screening to every integer from 1 through 8 and repeat the automatic baseline; correct report grouping. Production code and fixture inputs verified unchanged.

Completed observations span interrupted and resumed sessions. Medians and ranges retain both sessions; desktop load may differ between them.

Failed jobs: none.

Raw case inputs, logs, results, environment snapshots and memory samples are stored in state.json and jobs/ beside the generated report. Runner usage is documented in benchmark-html-gpu.md.
