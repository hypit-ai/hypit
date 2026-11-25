# Research: supply-chain posture of the Hypit fork (internal pass)

- Repository: `erdhian73/Hypit-Clone-Any-Video-` (fork of `hypit-ai/hypit`), checkout `~/projects/hypit`
- Codebase state researched: commit `17393e5d` (`feat(sam-cutout): …`), 2026-11-12, one commit ahead of upstream
- Date of pass: 2026-11-12 22:05–22:15 UTC
- Scope: **internal only** — repo, lockfiles, CI workflows, publish path, measured install/build/test. No external prior-art pass; that is deferred until a change is being planned.
- Method: every check below was executed on this machine; commands and their raw answers are quoted. Nothing is inferred from the manifests alone.

## 1. What the project is, in supply-chain terms

101 pnpm workspace projects under `packages/*`, `services/*`, `examples/*/packages/*`
(`pnpm-workspace.yaml:2-3,6`), one committed lockfile (`pnpm-lock.yaml`, 7247 lines,
`lockfileVersion: '9.0'`), toolchain pinned by `packageManager: "pnpm@10.33.0"`
(`package.json:179`) and `engines.node >= 22.15.0` (`package.json:239-241`). The root
manifest declares 14 runtime and 85 dev dependencies; the resolved graph audited here
is 334 packages. A second, Python ecosystem lives in
`packages/provider-whisperx-local/runtime/pyproject.toml` (2 dependencies, `uv.lock`
committed at `packages/provider-whisperx-local/runtime/uv.lock`).

## 2. Active campaign applicability

| Campaign | Applicable | Evidence |
|----------|------------|----------|
| Shai-Hulud (npm maintainer takeover) | YES — pattern applies | 334-package npm graph resolved from `pnpm-lock.yaml`; any postinstall in that graph would run in CI. No advisory-listed package matched, and no `requiresBuild` entries exist (`grep -c requiresBuild pnpm-lock.yaml` → 0), so the *vector* applies but no *indicator* matched. |
| TeamPCP (Trivy / Checkmarx / LiteLLM / Bitwarden CLI tag hijack) | NO | `grep -rin "trivy\|checkmarx\|litellm"` over all manifests and workflows → no match; none of those tools is used. GHA is used, but every action ref is SHA-pinned (§3.2). |
| axios (maintainer compromise, 100M weekly downloads) | NO | axios appears only as an *optional peer* of `@vueuse/integrations` (`pnpm-lock.yaml:4477`), never as a resolved package — `grep '^  axios@' pnpm-lock.yaml` → no match. |
| LiteLLM `.pth` persistence | UNKNOWN | No LiteLLM. The only Python surface is the whisperx runtime, pinned `whisperx==3.8.6` (`pyproject.toml:10`) with `uv.lock` committed. No `.pth` file exists in the checkout; the runtime venv is built by `uv` outside the tree, so its site-packages were not scanned — UNKNOWN, and worth scanning if that env is ever materialized on a release runner. |

## 3. Audit workflow results

| Step | PASS | WARN | FAIL | Findings |
|------|------|------|------|----------|
| 1 — Lockfile hygiene | 4 | 0 | 0 | Lockfile committed (`pnpm-lock.yaml`); CI installs with `--frozen-lockfile` at `ci.yml:64`, `npm-package.yml:33` and `npm-package.yml:65`; `setup-node` uses `cache: pnpm`, which keys on the lockfile hash (`ci.yml:61`, `npm-package.yml:32,64`); toolchain pinned in `package.json:179`. Seven `package-lock.json` files remain under `examples/` — stale secondary lockfiles, harmless while CI never installs there, but they should be deleted so nobody reintroduces an npm install path. |
| 2 — Action pinning | 1 | 0 | 0 | 21 `uses:` references; 20 are 40-character SHAs with a version comment (e.g. `ci.yml:52` `actions/checkout@11d5960a…  # v4.4.0`, `publish-npm.yml:39`), and the 21st is the local reusable workflow `uses: ./.github/workflows/npm-package.yml`. Neither `@v4` nor `@main` appears anywhere. |
| 3 — Install-time execution | 2 | 1 | 0 | A scan of all 105 `package.json` files (root, `packages/*`, `services/*`, `examples/*` and `examples/*/packages/*`) finds no `preinstall`/`install`/`postinstall` (only `prepack`, which runs on `npm pack`, not install). No `.npmrc` exists, so pnpm 10's default build-script blocking is what protects installs — measured during this pass: `Ignored build scripts: esbuild@0.21.5, esbuild@0.27.7, koffi@3.2.1`. That default is a pnpm-version property, not a repo guarantee: the repo pins `pnpm@10.33.0`, so it holds, but a CI runner that resolved pnpm 9 would execute them. WARN: add `pnpm.onlyBuiltDependencies` (or `ignore-scripts=true`) to `package.json` so the policy is explicit. No `--ignore-scripts` appears in any workflow. |
| 4 — Dependency velocity | 1 | 1 | 0 | `git log --follow pnpm-lock.yaml` shows 2 commits, `47bfe6e9` (2026-11-11) and `17393e5d` (2026-11-12): a 24 h gap, below the 7-day cooldown. This is a fork commit adding only the sam-cutout provider (§4), not an arbitrary bump, so it is expected — but the repo has no dependabot/renovate config (`.github/dependabot.yml` absent), so every future dependency change arrives ad hoc and nothing enforces a cooldown. |
| 5 — SBOM and provenance | 0 | 0 | 2 | FAIL: no SBOM step (`grep -rE "syft\|cyclonedx\|spdx"` over `.github/workflows/` → no match) and no provenance attestation: `scripts/publish-release-candidate.mjs:95` runs `npm publish … --access public --tag latest` with no `--provenance`, even though the job already holds `id-token: write` (`publish-npm.yml:37`). |

### 3.1 What the publish path already gets right (measured, not assumed)

`publish-npm.yml` does not build at publish time. It downloads the `npm-package`
artifact produced by a prior successful main CI run (`publish-npm.yml:55-58`), verifies
that the release tag equals `v<version>` from the candidate's `release-plan.json`
(`publish-npm.yml:61-79`, tag equality check at `:75-77`), defaults to `--preflight-only` unless publishing is explicitly
requested, and authenticates with OIDC (`id-token: write`) rather than a stored
`NPM_TOKEN`. That is the build-once/publish-that-artifact shape the hardened-CI
reference asks for, and it is one flag away from provenance.

### 3.2 One finding in that path

`npm install --global npm@11` (`publish-npm.yml:84`) installs an unpinned major from the
registry inside the release job. The job does not hold a long-lived npm token (OIDC), but
it does hold `contents: write` and can upload release assets (`publish-npm.yml:99-112`),
so a hijacked `npm@11` tag would execute there. Pin it to an exact version with an
integrity check, or use the npm bundled with the pinned Node 24 image.

## 4. Advisory scan (`pnpm audit --prod --json`)

10 advisories: 4 high, 4 moderate, 2 low, 0 critical. The JSON is saved at
`~/projects/hypit-hypit-audit.json`.

| Severity | Package | Resolved | Patched | Where it comes from |
|---|---|---|---|---|
| high | `sharp` | 0.35.4 | >= 0.35.5 | declared dependency of `packages/browser-capture/package.json:15` and `packages/media-local/package.json:24` (production), plus dev in `packages/studio/package.json:48`, `packages/caption-fine/package.json:41`, `packages/provider-html-local/package.json:46` |
| high | `vite` | 8.2.2 | >= 8.2.4 | `packages/studio/package.json:27` (production dependency of the Studio package) |
| high | `zod` | 3.25.76 | >= 4.6.6 | transitive: `puppeteer-core@25.10.0` → `chromium-bidi@17.0.2`, pulled by `packages/browser-capture` and `packages/provider-html-local` |
| high | `source-map-js` | 1.2.1 | >= 1.2.2 | transitive docs toolchain: `vitepress@1.6.4` → `@vue/compiler-core` (dev only) |
| moderate ×4 | `vite` | 8.2.2 | >= 8.2.4 | same as above (launch-editor / fs.allow advisories) |
| low ×2 | `esbuild` 0.27.7, `vite` 8.2.2 | — | esbuild >= 0.28.1 | `tsx` (dev) and the Studio stack |

Two of these are not a version bump away:

- `zod` — `chromium-bidi` needs zod 3; the patched line is zod 4. Forcing it with a pnpm
  override would break the browser-automation stack. Realistic options: wait for
  `chromium-bidi` to move, or accept the finding and record why (the advisory is memory
  exhaustion while validating oversized constrained strings, reachable only if a caller
  feeds attacker-controlled schema-validated payloads).
- `sharp` — the advisory is in its librsvg dependency; 0.35.5+ is a drop-in patch, and
  five manifests declare it. This is the cheapest high to close.

## 5. Reproducibility of the checkout (measured)

| check | command | result |
|---|---|---|
| lockfile ↔ tree | `pnpm install --frozen-lockfile` (pnpm 10.33.0, Node 24.14.1) | `Lockfile is up to date, resolution step is skipped`, 64 packages added, **4.7 s**, exit 0 |
| install without network | `pnpm install --frozen-lockfile --offline` | **FAILS**: `ERR_PNPM_NO_OFFLINE_TARBALL` for `@hypit/composition@0.1.0` — the local pnpm store is incomplete, so a clean rebuild needs the registry |
| type check | `pnpm run check` (`tsc -p tsconfig.json --noEmit`) | clean, **28.3 s**, exit 0 |
| test suite | `pnpm test` (`node test/run.mjs`, 218 tracked test files) | **1148 tests, 1125 pass, 23 skipped, 0 fail**, 294.7 s wall |

So the checkout is reproducible from the lockfile with network and green on this 2-vCPU
host; the published test numbers are from this machine, not from CI.

## 6. Fork delta

`git log upstream/main..HEAD` → one commit, `17393e5d`, adding
`packages/sam-cutout` (TypeScript) and `examples/*/packages/provider-sam-cutout`
(JavaScript) plus 903 lockfile lines. It declares no new external runtime dependency
beyond the pinned graph already audited; it does add a `tools/webm-to-mov.mjs` that
shells out to ffmpeg — a process-execution surface rather than a dependency surface, and
out of scope for this pass.

## 7. Top 3 priority actions

1. **Publish with provenance and pin the release-time npm.** Add `--provenance` to
   `scripts/publish-release-candidate.mjs:95` (the job already has `id-token: write`),
   and replace `npm install --global npm@11` (`publish-npm.yml:84`) with an exact version.
   Re-check with `supply-chain-sbom-provenance`.
2. **Bump `sharp` to >= 0.35.5** in the five manifests above; it is the one high-severity
   advisory with a drop-in patch. Then re-run `pnpm audit --prod` and commit the refreshed
   `pnpm-lock.yaml`. Follow `supply-chain-dependency-security` for the review.
3. **Make install-time policy explicit and add an SBOM step.** Add
   `pnpm.onlyBuiltDependencies: []` (or the three currently-blocked packages, reviewed) to
   `package.json`, delete the seven stale `examples/**/package-lock.json` files, and add a
   CycloneDX step to the npm-package job. Follow `supply-chain-hardened-ci-cd`.

## 8. Gaps and limits of this pass

- No external prior-art pass; no comparison against how comparable media/agent CLIs
  harden their release pipelines.
- The whisperx runtime's `uv` venv was never built here, so the `.pth` scan is UNKNOWN,
  not clean.
- `pnpm audit` covers published advisories only. It cannot see a live maintainer takeover
  inside the window, which is exactly what Shai-Hulud exploited; the defence is the
  blocked build scripts (§3 step 3) plus lockfile cooldown discipline.
- No container image exists in this repo (`.github/workflows/`, no `Dockerfile*`), so
  container hardening was not applicable; if one is added, `containerization:container-security`
  becomes the next pass.
- Nothing here was remediated. This document records the state at `17393e5d`; the three
  actions in §7 are unstarted.
