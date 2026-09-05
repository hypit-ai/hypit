# Runtime Profile and capabilities

Read this when a project needs an execution environment, a credential, another Provider, or an
explanation of what the current machine can actually do.

## Start from the work's capabilities

The environment is sufficient relative to the work, not as a global state. Read the Brief,
Treatment, Source, and Run that matter, then identify the capabilities they need. A typical generated
reconstruction may need:

- visual observation through a selected `@hypit/gemini` Endpoint;
- word transcription and alignment through a selected `@hypit/whisperx` Endpoint;
- the exact image, video, voice, or audio models authored in Source;
- media inspection, normalization, extraction, audio assembly, and muxing;
- HyperFrames visual rendering;
- the project's selected Build Result repository.

Different work can need a smaller or larger set. Existing material with deterministic Caption, MG,
and editing does not acquire an image model merely because another production used one. A reference
reconstruction that depends on unobserved motion, speech timing, or new generated shots does need the
corresponding eyes, ears, and production capabilities.

## Keep the owners separate

| Owner | What it decides |
| --- | --- |
| Author and Run Sources | what the work is and which public Outputs this execution requires |
| Runtime Profile | which environmental packages, Endpoint instances, credentials, and bindings are selected |
| Provider Endpoint | how one capability is supported, diagnosed, invoked, and priced |
| Credential Store | how one explicitly named secret is resolved |
| Managed Program | how a selected local Endpoint's long-lived helper is prepared and probed |
| Project Result repository | where finished Build Results and their public Outputs live |

Changing an Endpoint does not change the Author Source. Result storage is selected separately in
`hypit.results.json`; it is not a Runtime Profile field. Workspace and project-package resolution are
also independent of the Profile.

The Profile itself contains only environmental choices:

- `credentials` selects Credential Store adapters;
- `endpoints` names Provider adapter instances and their configuration;
- `bindings` chooses an Endpoint when several selected instances offer the same capability;
- an optional shared `pool` says that several instances consume one real account, deployment, or
  compute quota.

Read each selected Provider README for its accepted configuration and capability support. Installing
a package only makes it available; a Profile entry selects it.

## Begin with the Distribution starter

From the project directory:

```bash
hypit runtime init
hypit paths
```

`runtime init` writes and selects an editable starter `hypit.runtime.json`. It does not install a
package, contact a service, request a credential, or start a Worker, and it preserves an existing
Profile. Use `hypit runtime use <profile>` to select an intentional existing Profile for this project.

The current official video Distribution starts with:

- `hypihub.default` for remote generation, Gemini observation, and WhisperX alignment;
- `media.local` for local media processing;
- `hyperframes.local` for local visual rendering.

This is a useful first configuration, not an Author-language rule. A project may select BYOK
Providers, local WhisperX, remote rendering, or another supported deployment without changing its
Source. Exact models remain author choices and are demanded only when the selected Run reaches them.

Runtime selection is project-local. Commands read that project's `.hypit/runtime` pointer and do not
choose a Profile from a familiar filename or from another project above it.

## Choose the practical capability path with the user

Inspect the selected Profile, configured credentials, and current Endpoint diagnoses before asking
the user to set up anything. Keep a working choice. When a required capability is missing, explain
the consequence in the language of the work and present only the choices that materially differ in
cost, privacy, setup time, or control.

- Use a supported BYOK Provider when the user already has that account and wants to use it.
- For speech alignment, offer local WhisperX when the machine and the user's available setup time
  make it practical. Explain that its first preparation may install a runtime and download model
  weights; `local-tools.md` owns the bounded setup and repair guidance.
- Offer HypiHub as the official hosted route when the user prefers one hosted account or does not
  have the corresponding BYOK or local capability. Authentication and available quota still need to
  be established for the selected account.
- Image, video, voice, and audio production each require an actual selected Endpoint for the exact
  authored model. An observation Endpoint does not imply a generation Endpoint, and vice versa.

HypiHub is a convenient selected Provider, not an automatic fallback. Moving from BYOK or local
execution to HypiHub changes the Profile or its binding explicitly; it never happens because another
Endpoint failed. Ask for a user decision only when the alternatives have a meaningful consequence,
not merely because several equivalent implementations exist.

## Put secrets behind credential references

A Profile names a Credential Store and key; the secret stays in that store. The writable OS store
uses macOS Keychain or Windows Credential Locker. The environment store reads one explicitly named
environment variable and is read-only.

Inspect one Endpoint's credential slots without revealing their values:

```bash
hypit auth status hypihub.default
```

When the Endpoint declares an acquisition flow or the selected store accepts interactive input, use:

```bash
hypit auth login hypihub.default
```

OAuth may open the Provider's browser flow. Another Endpoint may securely prompt for its exact secret
or accept `--from <secret-file>`. An Endpoint backed by the read-only environment store is configured
in the Worker process environment instead.

Keep secrets out of Author Sources, Runs, Runtime Profile JSON, project documentation, command
arguments, commits, and conversation text. Ask the user to complete a Provider browser flow or secure
terminal prompt rather than paste a key into chat. Report the Store, key name, Endpoint, and whether
it is configured; never report the stored value.

A stored credential proves only that a value is available. It does not prove that the account is
current, has quota, can reach a model, or is accepted by the remote service.

## Ask each command for the fact it owns

| Command | What it can establish |
| --- | --- |
| `hypit paths` | resolved project, selected Profile, and physical host/runtime locations |
| `hypit auth status <endpoint>` | whether that Endpoint's declared credential slots are configured |
| `hypit doctor` | an active, read-only audit of the selected or supplied Profile and Result repository |
| `hypit plan <run> --runtime <profile>` | the exact external Needs of one Run and cheap readiness of that demanded slice |
| `hypit runtime status` | Worker, active Build, and selected Managed Program state |

With no Profile selected or supplied, `doctor` checks the project Result repository alone. With a
Profile, it may authenticate and ask a remote Endpoint for its bounded capability catalogue. It
submits no generation request. A successful login followed by a failing doctor is useful evidence:
report the Provider's current explanation rather than treating credential storage as proof of
reachability.

`plan` knows the chosen Target and Candidates, so it identifies the capabilities this Run will demand
and applies the selected Endpoint's normal request-support check. Its preflight checks configuration,
credential presence, packages, executables, and relevant Managed Programs without actively probing a
remote service. Read `../production/builds.md` for planning, spending authority, and submission.

## Be honest about the available production

When a capability is absent, explain the creative consequence and offer the choices that actually
exist:

- select a supported Provider using the user's own account;
- use the official HypiHub Endpoint when the user has chosen and authenticated it;
- use a local implementation such as WhisperX when the machine can support it;
- reshape the production around accepted existing media and deterministic components;
- stop before promising a reconstruction that needs unavailable observation or generation.

With no generation account, a project can still arrange supplied media, Script, Caption, MG, audio,
and HyperFrames output. Without reliable visual observation, the Agent can inspect prepared frames and
tiles but has weaker evidence about complete motion and long-range sequence. Without alignment,
semantic attachment to real spoken words is unavailable. State those differences in the language of
the requested work.

When an installed Provider does not support the user's service or local deployment, say so and offer
integration as a separate framework or deployment task. A new protocol normally needs a Provider;
genuinely new author-facing request semantics also need a Model Package. Keep SVML unaware of the
service and leave the package implementation to the Hypit repository's framework documentation.

## Prepare the selected environment

After selecting or changing a Profile, `hypit runtime up` prepares the selected adapters' machine npm
dependencies, prepares and starts their declared local Managed Programs, validates the Runtime, and
starts its Worker. It does not log into or start remote services. `hypit doctor` is the active check
for those remote Endpoints.

Use `local-tools.md` when a selected local binary or Managed Program needs installation or repair.
Read `../production/builds.md` for how submission uses the prepared environment and Worker.
