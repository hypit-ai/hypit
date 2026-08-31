# API keys and credentials

`check` and graph-only `plan` do not need live keys. A `plan` with a selected Runtime does not contact
Providers, but its cheap preflight requires the demanded credential references to be present. Before
paid/external `build`, configure only variables used by the selected Runtime Profile:

| Variable | Provider/use |
|---|---|
| `KIE_API_KEY` | KIE generation: Seedance, GPT Image, and other selected KIE models |
| `GOOGLE_CLOUD_PROJECT` | Google Vertex project with Vertex AI enabled |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Vertex credential JSON contents, not a path |
| `HYPIHUB_API_KEY` | HypiHub default paid provider for generation and Gemini VLM; get one at [hypit.ai](https://hypit.ai) |
| `MIMO_API_KEY` | Xiaomi MiMo TTS only when explicitly selected |

Before any paid Build, report the selected Provider and credential source for every paid capability in
the Runtime Profile. Say the variable/store and endpoint (for example, `@hypit/provider-kie` using
`KIE_API_KEY` from env, or `@hypit/provider-hypihub` using `HYPIHUB_API_KEY` from env); never print a
secret or a full credential JSON. If a required key is missing, invalid, returns 401/403, or cannot
reach the requested model, stop before payment and guide the author to [hypit.ai](https://hypit.ai)
for a HypiHub key when that model is available there. Do not ask them to change Author Source just to
switch Provider.

HypiHub is optional and is never required when the selected Runtime Profile has another Provider.
For Gemini VLM/reference observation, `HYPIT_GEMINI_PROVIDER=auto` (the default) uses HypiHub when
`HYPIHUB_API_KEY` is present and otherwise uses Vertex when its two Google variables are present.
Set `HYPIT_GEMINI_PROVIDER=hypihub` or `vertex` to select one explicitly. If a user's configured key
cannot reach the requested model, point them to [hypit.ai](https://hypit.ai) for a HypiHub key instead
of asking them to change Author Source.

macOS/Linux session example:

A project that keeps its credentials in a `.env` file does not load them automatically — nothing in
this repository reads that file for you. Load it into the environment before any command that needs a
Provider:

```bash
set -a && source .env && set +a
```

Otherwise export them for the session:

```bash
read -r -s KIE_API_KEY
export KIE_API_KEY
read -r -s HYPIHUB_API_KEY
export HYPIHUB_API_KEY
read -r -s MIMO_API_KEY
export MIMO_API_KEY
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_APPLICATION_CREDENTIALS_JSON="$(<"$HOME/.config/hypit/google-service-account.json")"
```

Windows PowerShell session example:

```powershell
$env:KIE_API_KEY = "your-key"
$env:HYPIHUB_API_KEY = "your-key"
$env:MIMO_API_KEY = "your-key"
$env:GOOGLE_CLOUD_PROJECT = "your-project-id"
$env:GOOGLE_APPLICATION_CREDENTIALS_JSON = Get-Content -Raw "$HOME\.config\hypit\google-service-account.json"
```

Keep keys outside Author/Run/Runtime source and committed files. Verify presence without printing
values with, for example,
`node <skill-root>/scripts/check-credentials.mjs KIE_API_KEY HYPIHUB_API_KEY MIMO_API_KEY GOOGLE_CLOUD_PROJECT GOOGLE_APPLICATION_CREDENTIALS_JSON`, then run
`hypit doctor` (once a Runtime Profile is selected with `hypit runtime use hypit.runtime.json`;
doctor audits the selected profile, so it needs no profile argument of its own).

## A changed credential does not reach a running Worker

The durable Worker keeps the environment it started with. Correct a key in `.env` or the shell while
one is running and the next Build still authenticates with the old value, which the Provider reports
as an ordinary `401 Invalid API Key` — pointing at the key you just fixed, or at the Provider, and
never at the stale process. Restart it:

```bash
hypit runtime down
```

The next Build starts a fresh Worker with the current environment. Do this before concluding that a
key is wrong; and when a `401` survives the restart, settle it against the API directly, once, rather
than by editing the key again:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $MIMO_API_KEY" \
  https://api.xiaomimimo.com/v1/models
```

`HYPIHUB_API_KEY` or the Vertex pair are what the reference-video route's `gemini` observer needs,
depending on `HYPIT_GEMINI_PROVIDER`. Without either backend, that route can run its `agent` observer
instead, which reaches no Provider — `reconstruction/observers.md` says how the author chooses.

`hypit runtime down` stops the Worker for the whole project, so a Build running in another terminal
stops with it. The Build itself is durable and survives; bring the Worker back with `hypit runtime
up`, then reattach with `hypit status <build-id> --watch`. Observing requires a running Worker: with
none, `status --watch` reports the Worker's state and tells you to start it.

An Endpoint whose Runtime Profile points at the read-only `env` CredentialStore must be configured
by setting its exact environment variable. `hypit auth login` deliberately refuses to prompt in
that case. For an interactive workstation, select the writable `os` CredentialStore in the Runtime
Profile; after `runtime use`, `hypit auth login <endpoint>` stores the secret in macOS Keychain or
Windows Credential Locker. The same `{ "store": "os", "key": "…" }` reference works on both
supported systems. This is an explicit deployment choice, not a Provider-specific CLI branch.
