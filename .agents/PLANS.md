# Development plan

## Released milestones

### v0.1.0 — core CLI and safety

- Python parser, reconciliation, file I/O and CLI modules; explicit target/template
  operation, local-value/state preservation and per-file atomic replacement.
- Unknown-key keep/remove/error policies, non-writing check mode, safe diagnostics,
  unsupported-local-syntax refusal, link/identity/permission/no-op tests.
- MIT packaging, contributor guidance, CI and release-only PyPI Trusted Publishing.
- [GitHub v0.1.0](https://github.com/Geonhui-Lee/align-dotenv/releases/tag/v0.1.0)
  and [PyPI 0.1.0](https://pypi.org/project/align-dotenv/0.1.0/) published.

### v0.2.0 — project mode

- Recursive `.env*.example` / `.env*.template` discovery with conventional directory
  exclusions, missing-target skips, ambiguity rejection and full preflight before
  writes. Per-file application is not a cross-file transaction.
- [GitHub v0.2.0](https://github.com/Geonhui-Lee/align-dotenv/releases/tag/v0.2.0)
  and [PyPI 0.2.0](https://pypi.org/project/align-dotenv/0.2.0/) published.

### v0.3.0 — native Node CLI (released)

- [GitHub v0.3.0](https://github.com/Geonhui-Lee/align-dotenv/releases/tag/v0.3.0),
  [PyPI 0.3.0](https://pypi.org/project/align-dotenv/0.3.0/), and
  [npm 0.3.0](https://www.npmjs.com/package/align-dotenv/v/0.3.0) are published.
- Release/tag source: `18678bb3dda22ab8b60762e0c0ecc3d8382b5c5c`; never move it.
  npm was bootstrapped manually with account authentication + 2FA; PyPI used
  [Trusted Publishing](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37428603117).
  npm automation was skipped for this already-published version. Do not replay it.
- The port and README update were merged via PR #1 into `develop`, preserving the
  release ancestry. [Post-merge CI](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37430410781)
  passed Ubuntu/Windows x Node 22/24, Python 3.10–3.14 and packaging.
- Shared runtime-neutral fixtures and Python/Node consumers cover 36 canonical
  reconciliation/safety cases. Differential validation included 7,000 parser,
  3,000 reconciliation, 150 discovery-tree and 182 CLI scenarios. Known limitations
  are recorded in [NODE_PORT.md](NODE_PORT.md), not perfect-equivalence claims.
- TypeScript pure core, strict UTF-8 filesystem layer, frozen project preflight and
  CLI use Node built-ins only. Python production sources remain the original
  behavior reference; no independent npm version line or stable JS import API.
- Baseline local validation: 47 Python, 378 Node workspace and 9 packed tests.
  Ubuntu passes all source/packed tests; Windows has three POSIX mode assertions
  skipped and no packed skips, with actual generated `.cmd` shim invocation.
- Package root stays `node/`: 17 shipped files (7 JS, 7 declarations, README,
  LICENSE, package.json), zero runtime dependencies, Node >=22. No sources/tests/
  fixtures/maps/dependencies/env files ship. Package-local MIT license equals root.

## v0.3.1 — documentation patch / automated dual release

- Replace stale npm pre-release/bootstrap README with end-user install, usage,
  policies, exit codes, safety, platform and repository guidance.
- Preserve root package links and Python/npm positioning; move maintainer details
  exclusively to contributor/planning documentation.
- Synchronize Python/npm/lockfile to 0.3.1 only after documentation review and
  validation. No production source or CLI behavior changes.
- Before release: Python tests + compile/import; Node clean install/build/workspace/
  packed tests; real tarball/installed README and npm-shim verification; dependency-
  free version guards; green Ubuntu/Windows x Node 22/24 and Python CI at the exact
  pushed commit. macOS remains outside the tested release matrix without metadata
  installation restrictions. WSL results count as Linux only.
- Future automation is configured: explicit GitHub Release triggers PyPI Trusted
  Publishing and npm OIDC/provenance, protected `npm` environment,
  `ENABLE_NPM_PUBLISHING=true`. npm Trusted Publisher identity:
  `Geonhui-Lee / align-dotenv / publish-npm.yml / npm` (maintainer-configured).
  No tokens or manual uploads. Environment approval must never be bypassed.
- Tag only after local/CI/packed/version gates pass; observe both publication
  workflows and verify public versions, `latest`, provenance and fresh installs.
  Do not mark v0.3.1 released before actual upload/public verification success.
  Current status: preparation in progress; no v0.3.1 publication claimed here.
- Reusable release procedure: [CONTRIBUTING.md](../CONTRIBUTING.md).

## Later ideas (not part of the documentation patch)

### Likely next

- Value-redacted `--diff`.
- Better project-mode diagnostics and summaries.

### Future configurability

- Configuration file support.
- Custom discovery rules, ignored paths/directories, and template suffixes.

### Future target management

- Explicit opt-in creation of missing dotenv targets.
- Interactive behavior.
