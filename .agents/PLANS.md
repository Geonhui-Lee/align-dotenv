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

## Native Node single-file layer (implemented; platform validation pending)

- Added `node/src/files.ts`: strict UTF-8 with retained BOM/newline bytes,
  lstat target rejection, permitted explicit-mode template symlinks, bigint same-file
  identity, unchanged/check no-op behavior and mode-preserving native replacement.
- Same-directory exclusive/random temporary files; no delete-target fallback.
  Observed late unsafe target changes are rejected and owned temporary files cleaned.
- Added filesystem shared-fixture tests for all 36 cases, including invalid UTF-8
  in either input under every policy/check setting, and focused failure/link tests.
- Added `@types/node` as a dev dependency; runtime dependencies remain zero.
- Filesystem-phase baseline under WSL/Linux: 176 Node tests and 47 Python tests passed.
  Ubuntu/Windows GitHub Actions results remain pending; macOS is out of release scope.
  See [NODE_PORT.md](NODE_PORT.md) for Windows rename/mode limits, diagnostic
  differences, TOCTOU caveats and validation status. Do not infer Windows/macOS
  correctness from WSL results; macOS is not currently tested or claimed supported.
- The project phase below reuses common filesystem primitives; existing single-file
  public behavior/tests remain intact. Review pending filesystem CI before claiming
  cross-platform parity.

## Native Node project layer (implemented; platform validation pending)

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
- Actions Ubuntu: pending. Windows: pending. macOS: outside tested matrix. No branch runs observed
  before this phase; prior filesystem gate and new project gate are both unresolved.
  Current Ubuntu/Windows Node 22/24 CI includes the project suite. New Windows
  symlink fixture skips require actual capability failure; POSIX mode assertion skips
  are explicit. Python CI and all Python production sources/version remain unchanged.
- CLI and package readiness are implemented below; publication and releases remain
  **not performed**.

## Native Node CLI layer (implemented privately; platform validation pending)

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
- Actions Ubuntu: pending. Windows: pending. macOS: outside tested matrix. No branch runs found;
  prior filesystem/project and new CLI cross-platform gates remain unresolved.
  The Ubuntu/Windows matrix automatically includes all CLI tests. Python CI is
  unchanged. Runtime dependencies remain zero; workspace remains private.
- Package readiness is now implemented below, without production behavior changes.

## Native npm package readiness (structurally ready; Actions pending)

- `node/package.json`: production metadata, name `align-dotenv`, MIT/author/GitHub
  URLs, repository subdirectory, `engines >=22`, compiled `align-dotenv` bin and
  restricted dist/LICENSE file list. `private: true` remains; pack/install works.
  Preparatory npm version `0.2.0` equals Python, with no Python version change.
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
  do not validate Windows. Actions Ubuntu: pending. Windows: pending. No runs found.
- Name lookup 2026-10-06: npm 404, no public package found; ownership/reservability
  not guaranteed and must be reconfirmed. No package/name reservation performed.
- Joint release guard will require tag == Python == npm == lockfile version;
  current packed tests check Python/npm equality. Final future release version is
  not yet selected. No independent versioning or release bump introduced.
- Trusted Publishing/provenance plan documented in NODE_PORT.md (OIDC/protected
  environment/explicit release/maintainer bootstrap); no npm workflow, secrets,
  settings or upload activated. Existing PyPI publishing workflow unchanged.
- Status: **STRUCTURALLY READY; CROSS-PLATFORM CI PENDING**. Remaining steps: close
  both OS gates, confirm name/access, choose synchronized version, separately
  authorize removal of private and publisher/bootstrap setup. No publication,
  release commit, tag or GitHub release performed.

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
