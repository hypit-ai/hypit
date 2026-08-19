# API keys and credentials

`check` and `plan` do not need live keys. Before paid/external `build`, configure only variables used
by the selected Runtime Profile:

| Variable | Provider/use |
|---|---|
| `KIE_API_KEY` | KIE generation: Seedance, GPT Image, and other selected KIE models |
| `GOOGLE_CLOUD_PROJECT` | Google Vertex project with Vertex AI enabled |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Vertex credential JSON contents, not a path |
| `MIMO_API_KEY` | Xiaomi MiMo TTS only when explicitly selected |

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
read -r -s MIMO_API_KEY
export MIMO_API_KEY
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_APPLICATION_CREDENTIALS_JSON="$(<"$HOME/.config/hypit/google-service-account.json")"
```

Windows PowerShell session example:

```powershell
$env:KIE_API_KEY = "your-key"
$env:MIMO_API_KEY = "your-key"
$env:GOOGLE_CLOUD_PROJECT = "your-project-id"
$env:GOOGLE_APPLICATION_CREDENTIALS_JSON = Get-Content -Raw "$HOME\.config\hypit\google-service-account.json"
```

Keep keys outside Author/Run/Runtime source and committed files. Verify presence without printing
values with, for example,
`node .agents/skills/hypit/scripts/check-credentials.mjs KIE_API_KEY MIMO_API_KEY`, then run
`hypit doctor <profile>`.

An Endpoint whose Runtime Profile points at the read-only `env` CredentialStore must be configured
by setting its exact environment variable. `hypit auth login` deliberately refuses to prompt in
that case. For an interactive workstation, select the writable macOS Keychain CredentialStore in
the Runtime Profile; after `runtime use`, `hypit auth login <endpoint>` can store the secret.
This is an explicit deployment choice, not a Provider-specific CLI branch.
