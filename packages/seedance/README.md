# @hypit/seedance

The Seedance family exports five exact Capabilities. Each can be imported independently or found in
`seedanceModels`.

| Export | Capability name |
| --- | --- |
| `seedance2` | `seedance-2` |
| `seedance2Fast` | `seedance-2-fast` |
| `seedance2Mini` | `seedance-2-mini` |
| `seedance25` | `seedance-2.5` |
| `seedance25Flash` | `seedance-2.5-flash` |

The request selects `mode: "text"`, `"frames"`, or `"references"`. Supply the prompt and duration
in seconds. Frame mode names a first frame and may name a last frame. References mode accepts named
image, video and audio inputs. Visual references include a boolean `personReference` classification.
The exact Capability validates resolution, duration, ratio and input counts. The selected Provider
checks the account's supported subset before uploading reference media.
