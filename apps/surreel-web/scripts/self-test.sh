#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

pnpm test
pnpm check

health="$(curl -fsS --max-time 20 https://studio.getvideos.app/api/health)"
python3 - "$health" <<'PY'
import json, sys
health = json.loads(sys.argv[1])
missing = [
    name
    for name, want in {
        "status": "ok",
        "agentAvailable": True,
        "agent": "Tardigrade",
        "browser": "Browser Use",
        "model": "deepseek/deepseek-v4.1-flash:nitro",
    }.items()
    if health.get(name) != want
]
skills = health.get("skills") or []
needed = ["gpt-image-people", "ugc-realistic", "ugc-ad-formats"]
if missing:
    raise SystemExit(f"health mismatch: {missing} body={health}")
if any(name not in skills for name in needed):
    raise SystemExit(f"health missing skills {needed}: {skills}")
print("health ok", health["browser"], health["agent"], len(skills), "skills")
PY

projects="$(curl -fsS --max-time 20 https://studio.getvideos.app/api/projects)"
python3 - "$projects" <<'PY'
import json, sys
body = json.loads(sys.argv[1])
projects = body.get("projects")
if not isinstance(projects, list):
    raise SystemExit("projects list missing")
print("projects ok", len(projects))
PY
