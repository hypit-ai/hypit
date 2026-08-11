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

```bash
read -r -s KIE_API_KEY
export KIE_API_KEY
read -r -s MIMO_API_KEY
export MIMO_API_KEY
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_APPLICATION_CREDENTIALS_JSON="$(<"$HOME/.config/narratage/google-service-account.json")"
```

Windows PowerShell session example:

```powershell
$env:KIE_API_KEY = "your-key"
$env:MIMO_API_KEY = "your-key"
$env:GOOGLE_CLOUD_PROJECT = "your-project-id"
$env:GOOGLE_APPLICATION_CREDENTIALS_JSON = Get-Content -Raw "$HOME\.config\narratage\google-service-account.json"
```

Keep keys outside Author/Run/Runtime source and committed files. Verify presence without printing
values with, for example,
`node .agents/skills/narratage/scripts/check-credentials.mjs KIE_API_KEY MIMO_API_KEY`, then run
`node --run narratage -- doctor <profile>`.
