# Development plan

## Phase 1 — Core extraction

- Create a small Python package with separate parser, reconciliation, file I/O, and CLI modules.
- Support a single `align-dotenv <target> --template <template>` operation.
- Keep local raw values and unknown variables; use the template's layout and atomic file replacement.
- Add baseline unit and CLI tests without external runtime dependencies.

## Phase 2 — Correctness and CLI safety (implemented)

- Expand fixtures for raw values, Unicode, empty values, LF/CRLF, duplicate keys, and final newlines.
- Add explicit `keep` (default), `remove`, and `error` policies for unknown assignments.
- Add non-writing `--check`, validate file paths, and keep user errors and output value-free.
- Test atomic failure cleanup, permissions, unchanged files, and idempotency.
- Document the narrow syntax scope and template-controlled line endings.

## Phase 2.5 — Local syntax safety (implemented)

- Refuse to align unsupported meaningful local lines and multiline-looking quoted values.
- Apply the same validation under `--check` and every unknown-key policy; never print values.
- Allow local blank lines and ordinary comments to follow the template layout.

## Phase 3 — Distribution and OSS readiness (released as v0.1.0)

- Validate metadata, wheel/sdist, and isolated installation; document PyPI/uv/pipx installation.
- Add README, MIT LICENSE, CONTRIBUTING, CI, and an explicit-release-only Trusted Publishing workflow.
- Keep version `0.1.0` in `pyproject.toml`; polish CLI help/output later if needed.
- **Release-ready:** repository and local distribution checks complete.
- **GitHub release:** [v0.1.0](https://github.com/Geonhui-Lee/align-dotenv/releases/tag/v0.1.0) published.
- **PyPI publication:** [align-dotenv 0.1.0](https://pypi.org/project/align-dotenv/0.1.0/) published through Trusted Publishing; public-index installation and CLI smoke test passed.

## Phase 4 — Project-wide discovery (released as v0.2.0)

- Discover `.env*.example` and `.env*.template` recursively with conventional directory exclusions.
- Align existing targets only; fail on ambiguous mappings and preflight every pair before writing.
- Support project-wide `--check` and unknown-key policies without changing single-file behavior.
- **GitHub release:** [v0.2.0](https://github.com/Geonhui-Lee/align-dotenv/releases/tag/v0.2.0) published.
- **PyPI publication:** [align-dotenv 0.2.0](https://pypi.org/project/align-dotenv/0.2.0/) published through Trusted Publishing; public-index installation and both CLI modes passed smoke tests.

## Native Node behavioral parity preparation

- Python v0.2.0 remains the reference and production implementation.
- Shared runtime-neutral fixtures and their Python consumer pin exact text,
  errors, CLI safety and second-pass behavior without restructuring the package.
- See [NODE_PORT.md](NODE_PORT.md) for the audit, known limitations, module mapping
  and gated implementation sequence.

## Native Node pure core (implemented, development-only)

- Added `node/src/parser.ts` and `node/src/reconcile.ts` without Python changes.
- Initially a private Node 24+ workspace, strict ESM build and built-in Node tests.
  TypeScript-only development tooling; no runtime dependencies or binary entry point.
- Both runtimes consume the shared reconciliation fixtures; the pure Node suite
  checks 34 string-level cases. Byte-input cases now run through the file layer.
- Current Node release CI covers Ubuntu/Windows on Node 22/24 (see below);
  Python CI remains intact. The former macOS gate is retired by scope decision.
- The Node implementation is not production-ready.

## Native Node single-file layer (implemented; Ubuntu/Windows validation passed)

- Added `node/src/files.ts`: strict UTF-8 with retained BOM/newline bytes,
  lstat target rejection, permitted explicit-mode template symlinks, bigint same-file
  identity, unchanged/check no-op behavior and mode-preserving native replacement.
- Same-directory exclusive/random temporary files; no delete-target fallback.
  Observed late unsafe target changes are rejected and owned temporary files cleaned.
- Added filesystem shared-fixture tests for all 36 cases, including invalid UTF-8
  in either input under every policy/check setting, and focused failure/link tests.
- Added `@types/node` as a dev dependency; runtime dependencies remain zero.
- Filesystem-phase baseline under WSL/Linux: 176 Node tests and 47 Python tests passed.
  Ubuntu/Windows GitHub Actions results now pass; macOS is out of release scope.
  See [NODE_PORT.md](NODE_PORT.md) for Windows rename/mode limits, diagnostic
  differences, TOCTOU caveats and validation status. Do not infer Windows/macOS
  correctness from WSL results; macOS is not currently tested or claimed supported.
- The project phase below reuses common filesystem primitives; existing single-file
  public behavior/tests remain intact. Cross-platform validation is recorded below.

## Native Node project layer (implemented; Ubuntu/Windows validation passed)

- `node/src/project.ts` implements recursive template discovery, all five excluded
  directories, directory-symlink avoidance, deterministic pathlib-like ordering,
  ambiguity and discovered-template-as-target rejection, and missing-target skipping.
- Preserves unusual directory-name candidates without descending into template-like
  directories; project template symlinks are rejected, unlike explicit file mode.
- `planProject` validates/reconciles every existing pair before any writes and returns
  frozen pairs/changed updates/skipped count. Errors carry safe relative labels.
- `applyProject` rechecks each changed target, then uses staged content/mode with the
  same writer as `alignFile`. Shared primitives live in `internal/file-operations.ts`,
  not new public testing hooks. Application is individually atomic, not transactional;
  later failures do not rollback earlier updates. Race/Windows mode/rename limits remain.
- 87 new project tests: 54 shared-fixture checks and 33 focused temporary-tree tests.
  Locally under WSL/Linux, all 263 Node tests and 47 Python tests pass. A one-off
  150-tree discovery comparison matches Python (seed `20261006`).
- Actions Ubuntu: passed. Windows: passed. macOS: outside tested matrix.
  The authoritative run is recorded under synchronized release preparation below.
  Current Ubuntu/Windows Node 22/24 CI includes the project suite. New Windows
  symlink fixture skips require actual capability failure; POSIX mode assertion skips
  are explicit. Python production sources remain unchanged; the later authorized
  synchronized metadata update is recorded below.
- CLI and package readiness are implemented below; publication and releases remain
  **not performed**.

## Native Node CLI layer (implemented privately; Ubuntu/Windows validation passed)

- `node/src/cli.ts` orchestrates existing file/project modules through async `main`;
  a small cwd/output context supports direct tests. `bin.ts` retains a shebang and
  only assigns `process.exitCode`. No npm `bin` mapping was needed.
- Supported invocation/options, explicit/project summaries, skipped grammar and
  exit codes 0/1/2 match Python. Project mode uses process cwd; checks never apply.
- Structured errors retain safe diagnostics. `ProjectValidationError.failureKind`
  identifies wrapped UTF-8/I/O failures without raw causes, enabling generic CLI
  normalization just like Python. Argument errors omit user tokens; help is concise
  static text rather than byte-identical argparse output. See NODE_PORT.md for
  unspecified argparse precedence/short-cluster limitations.
- 115 new CLI tests: 107 process integration tests plus 8 direct API/build tests.
  Locally in WSL/Linux, 378 Node tests and 47 Python tests pass, including previous
  suites. A one-off 182-scenario Python-vs-Node CLI comparison passes for exit codes,
  bytes and stable output. Native Windows CRLF output is specified/tested by platform,
  not locally validated under WSL.
- Actions Ubuntu: passed. Windows: passed. macOS: outside tested matrix;
  filesystem/project/CLI and installed npm-shim gates passed in real Actions.
  The Ubuntu/Windows matrix automatically includes all CLI tests. Python CI is
  unchanged. Runtime dependencies remain zero; workspace remains private.
- Package readiness is now implemented below, without production behavior changes.

## Native npm package readiness (READY FOR NPM RELEASE; manual bootstrap prepared)

- `node/package.json`: production metadata, name `align-dotenv`, MIT/author/GitHub
  URLs, repository subdirectory, `engines >=22`, compiled `align-dotenv` bin and
  restricted dist/LICENSE file list. Final release preparation explicitly sets
  `private: false`; automated npm publishing remains disabled for v0.3.0.
  Prepared npm version `0.3.0` equals Python after the explicitly authorized metadata
  update; no Python production behavior changes.
- Byte-identical `node/LICENSE`; npm-facing README clearly marks publication as
  not performed and documents installation/CLI/safety/platform/exit-code behavior.
- Real artifact: 17 files (7 JS, 7 declarations, README, LICENSE, package.json).
  No sources, fixtures, tests, sourcemaps, Python or installed dependencies ship.
  Prepack builds automatically. No source or compiler required in consumers.
- `npm run test:package`: 9 tests inspect gzip/tar contents/security/imports/version,
  then fresh offline installation and npm-generated bin/shim execution. All shared
  success bytes plus explicit/project/check/policy/error scenarios are covered.
- Node minimum 22 justified by APIs/current LTS status; exact 22.0.0 build/source/
  packed tests pass locally with npm 10. Current npm publisher requirements are
  separate from runtime minimum. Runtime dependencies still zero; dev deps unchanged.
- CI has distinct workspace/packed steps on Ubuntu/Windows and Node 22/24. macOS
  is not in the tested release matrix; no `os` restriction added. Local WSL results
  do not validate Windows. Actions Ubuntu: passed. Windows: passed.
- Name lookup 2026-10-06: npm 404, no public package found; ownership/reservability
  not guaranteed and must be reconfirmed. No package/name reservation performed.
- Joint release guard now requires tag == Python == npm == lockfile version in
  release mode. `0.3.0` was selected explicitly after the platform gate passed.
- Trusted Publishing/provenance draft in `publish-npm.yml` is release-only and
  requires explicit variable opt-in plus non-private manifest, protected environment
  and tag/version checks. Existing PyPI protections are retained and strengthened
  with the shared version guard. No secrets, settings or uploads activated.
- Status: **READY FOR NPM RELEASE**; private removal now authorized and prepared.
  Actual publication and account-side setup remain maintainer actions.

## Synchronized v0.3.0 preparation (not released)

- Committed port: `926d7aef877db7222ba728c9a50f04641e38777b` on
  `chore/node-port-behavioral-contract`, pushed to origin (not develop).
- [CI 37423326194](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37423326194)
  passed before any version bump: Ubuntu/22, Ubuntu/24, Windows/22, Windows/24.
  All packed steps passed, including installed `.cmd`/npm exec proof on Windows.
  Ubuntu: 378 source + 9 packed tests, no skips. Windows: 375 source passed,
  3 POSIX permission assertions skipped, all 9 packed passed, no packed skips.
  Python 3.10–3.14 and packaging passed. No CI failures or safety weakening.
- Python/npm/lockfile versions prepared as `0.3.0` only after that real green gate.
  `scripts/check-versions.mjs` and 9 tests provide dependency-free CI/release reuse.
- Root/Node README position npm as a first-class development CLI, not a supported
  public JS import API. Official tested Node OSes: Linux/Ubuntu and Windows; macOS
  excluded from test scope without metadata installation restrictions.
- Manual steps now follow the bootstrap sequence below; Trusted Publisher setup
  comes after npm 0.3.0 exists. No account changes, publication, tags or releases
  were performed. Both distributions' upload success must be verified before
  marking v0.3.0 released; they are not a cross-registry transaction.
- Final preparation commit `c1ced078c6238ecd26572c4cdafd82d2b78e3921` pushed;
  [CI 37424356302](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37424356302)
  passed all four Ubuntu/Windows Node 22/24 entries, including version guard,
  workspace, packed fresh installation and actual npm shim invocation. Python
  3.10–3.14 and packaging passed. No CI failures/fixes.
- Final local checks passed: 47 Python + compile/import, 378 Node workspace,
  9 packed and 9 guard tests; intended 17-file 0.3.0 artifact inspected outside
  checkout. No generated artifacts or dotenv files tracked; no value markers in
  logs. `private: true` retained, npm opt-in variable unset, nothing published,
  tagged or released. Status: **READY FOR FINAL RELEASE AUTHORIZATION**.

## Final v0.3.0 release commit preparation (not published)

- Explicitly authorized `private: false` in `node/package.json`; package identity
  stays `align-dotenv@0.3.0`. Lockfile versions/identity already match; no runtime
  dependency or Python production change. Earlier private-protected state above
  is historical, superseded by this release preparation.
- npm v0.3.0 is the first package publication: manual interactive bootstrap with
  maintainer npm account authentication + 2FA. Trusted Publisher configuration
  requires the package to exist and cannot perform this first publication.
- Keep `ENABLE_NPM_PUBLISHING` unset/disabled for the v0.3.0 GitHub Release and
  reruns. Do not republish manually published 0.3.0 from Actions.
- After v0.3.0: configure npm Trusted Publisher owner `Geonhui-Lee`, repository
  `align-dotenv`, workflow `publish-npm.yml`, environment `npm`, with protected
  environment approval and direct publishing permission. Enable
  `ENABLE_NPM_PUBLISHING=true` only for a future unpublished version's explicit
  GitHub Release. Future releases use OIDC and automatic npm provenance.
- PyPI workflow remains explicit GitHub Release-driven with unchanged safeguards;
  npm workflow opt-in remains unchanged. No npm tokens/credentials added.
- Release commands/ordered maintainer steps: `CONTRIBUTING.md`. No publication,
  tags or releases performed. Final private:false local validation passed: 47
  Python tests plus compile/import, 378 workspace tests, 9 packed tests and shared
  version check. Tarball has 17 files, 13,278 compressed / 41,984 unpacked bytes;
  README/LICENSE present, zero runtime dependencies, no payload/local-path markers,
  no generated artifacts/.env tracked, Python production unchanged. Packed metadata
  assertion strictly checks private:false. Repository npm opt-in variable is unset.
- Status: **READY FOR MANUAL NPM BOOTSTRAP**, subject to final pushed-commit CI.

## Later ideas (not part of v0.2.0)

### Likely next

- Value-redacted `--diff`.
- Better project-mode diagnostics and summaries.

### Future configurability

- Configuration file support.
- Custom discovery rules, ignored paths/directories, and template suffixes.

### Future target management

- Creation of missing dotenv targets and explicit opt-in initialization behavior.
- Interactive behavior.
