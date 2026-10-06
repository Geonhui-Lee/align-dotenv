# Contributing

## v0.4.0 release candidate

The active distribution version is 0.4.0; v0.3.x sections below are historical.
See [release preparation](.agents/RELEASE_V040.md) for exact artifact selection,
three-package npm ordering, immutable partial-publication recovery and external
requirements. Both publishers consume artifacts from successful exact-commit CI
runs without rebuilding. They require explicit `ENABLE_V040_RELEASE=true` and
confirmed `release-policy.json` approvals, in addition to existing npm opt-in and
the protected `npm`/`pypi` environments. Ordinary pushes cannot publish.

`THIRD_PARTY_NOTICES.md` is currently an incomplete licensing inventory; binary
redistribution remains blocked until it is completed and reviewed. npm platform
tarballs carry this draft, adding one explicit allowlisted file; main remains the
three-file launcher package. No release, tag or publication is authorized here.

## Unreleased executable-backed npm migration

`src/align_dotenv/` is canonical. `node/npm/` defines the thin launcher and two
optional x64 executable packages. `node/` is a private, dependency-free validation
workspace; the TypeScript implementation and reference-only tooling are retired.
See [Phase 2 notes](.agents/NPM_EXECUTABLE.md) for fresh same-commit staging,
tar allowlists, offline install/ci, no-Python proof and native CI. No binaries or
tarballs belong in Git. Composer/macOS/ARM are not included; Linux portability
is limited by the proven Ubuntu 24.04/glibc environment. Publication is blocked
pending coordinated platform-package release automation.

Use Python 3.10–3.14. For a local editable installation, create an environment
and run `python -m pip install -e .` (or `uv pip install -e .` after activating it).
No runtime dependencies are required.

Run the tests before opening a pull request:

```bash
python -m unittest discover -s tests -v
python -m compileall -q src tests
```

Keep parsing, reconciliation, filesystem operations, and CLI output separate.
Include tests for behavior changes, especially failure paths. Reconciliation must
remain idempotent. If local syntax cannot be safely understood or preserved,
reject it instead of silently dropping it. Never use actual secrets in fixtures,
logs, or issue reports, and do not print dotenv values in errors.

Shared Python/executable/npm parity cases live in [`fixtures/`](fixtures/README.md).
Keep expected bytes and safe errors runtime-neutral; use case IDs rather than
payloads in assertion diagnostics. Historical port evidence is in
[`.agents/NODE_PORT.md`](.agents/NODE_PORT.md); retirement is in
[`.agents/PHASE3.md`](.agents/PHASE3.md).

For launcher tests (Node 22+, distribution manifests in `node/npm/`):

```bash
npm --prefix node ci
npm --prefix node test
npm --prefix node run test:package
```

See [`node/README.md`](node/README.md) for CLI usage and safety limitations.
Published npm v0.3.1 remains immutable. The development npm package delegates to
canonical Python executables and has no fallback or JavaScript dotenv API.
With fresh staging and both native tarballs configured, `test:package` packs the artifact,
inspects its actual contents, installs it offline into a fresh external consumer,
then tests npm's generated bin/shim through scripts and npm exec. Do not replace
this gate with repository-only invocation. Without staging the native gate skips;
that is not native proof. Tarballs are
generated in owned temporary directories, cleaned afterward and ignored by git.

Native npm CI covers Ubuntu 24.04 x64 and Windows Server 2022 x64 on Node 22/24/26.
WSL ARM64 cannot prove either x64 artifact. Keep the package-local MIT license
equal to the root LICENSE. The main tarball contains only package.json, LICENSE
and bin/align-dotenv.js; each platform tarball includes metadata.json, one binary
and THIRD_PARTY_NOTICES.md alongside its manifest and MIT license.
Sources/tests/shared fixtures/planning files must stay out of the tarballs.

## Synchronized releases (maintainers)

### Standalone executable prototype (v0.4.0 Phase 1)

Python is the sole canonical behavior implementation; development npm delegates
to its executable. See [`.agents/EXECUTABLE_ARCH.md`](.agents/EXECUTABLE_ARCH.md) for
the bundler decision and platform limits. In a clean Python 3.13.15
build environment:

```bash
python -m pip install -r scripts/requirements-executable.txt
python -m pip install .
python -m unittest discover -s tests -v
python scripts/build-executable.py
```

Set `ALIGN_DOTENV_EXE` to the absolute generated artifact path (under
`dist/executable/`), then run:

```bash
python -m unittest discover -s tests -p test_executable.py -v
```

Build natively on each target. Ubuntu x86_64 and Windows x86_64 validation is a
separate CI workflow, not authorization to publish binaries. Do not commit
generated executables or claim readiness before all required gates actually pass.
The executable embeds Python; consumers do not install Python.

### Published Python/npm procedure

The procedure below records the historical dual release. Executable-backed npm
publication remains blocked pending separate coordinated platform release review;
Phase 3 is not publication authorization.

**v0.3.0 is released** on [GitHub](https://github.com/Geonhui-Lee/align-dotenv/releases/tag/v0.3.0),
[PyPI](https://pypi.org/project/align-dotenv/0.3.0/), and
[npm](https://www.npmjs.com/package/align-dotenv/v/0.3.0). Its manual npm account +
2FA bootstrap is historical; do not repeat it or rerun the v0.3.0 publisher.
Published npm versions are immutable. The Node port and published-state root
README have since been merged into `develop`.

The historical procedure used one explicitly published GitHub Release to trigger
both `publish.yml` (PyPI Trusted Publishing, environment `pypi`) and
`publish-npm.yml` (npm Trusted Publishing with provenance, environment `npm`).
Ordinary pushes cannot publish. Do not manually upload distributions or add
long-lived tokens. Preserve protected-environment approval requirements.

1. Prepare documentation and synchronized version metadata in `pyproject.toml`,
   `node/package.json`, and both lockfile version fields. Do not alter production
   behavior for a documentation-only release.
2. Run the Python suite, compile/import checks, Node workspace and packed-package
   tests. Inspect the actual tarball and installed README and CLI in a fresh
   consumer. Keep generated tarballs out of Git.
3. Run `node scripts/check-versions.mjs` and
   `node scripts/check-versions.mjs --tag vX.Y.Z` with the intended version.
   Release mode (`--release`) additionally requires `RELEASE_TAG` in the environment.
   Both publishing workflows enforce tag == Python == npm == lockfile versions.
4. Commit/push and require green Ubuntu/Windows x Node 22/24 workspace and packed
   gates, Python 3.10–3.14, and Python packaging at the exact release commit.
5. Before tagging, verify repository variable `ENABLE_NPM_PUBLISHING=true` and
   npm Trusted Publisher identity **Geonhui-Lee / align-dotenv / publish-npm.yml /
   npm**. Confirm the package permits publication (`private: false`). Only direct
   publishing permission matches this workflow; stage-only is a different policy.
6. Tag the validated commit once, following repository convention, then publish
   the explicit GitHub Release. Never move a published tag or replay an old
   version's release event. Approve protected environments if required; do not
   bypass them.
7. Observe both workflows and verify public versions, npm `latest`, provenance,
   and clean npm/Python installs before marking the release complete. Uploads are
   not atomic: diagnose partial failures without republishing existing versions.

The npm publisher uses GitHub-hosted Node 24 with npm >=11.5.1, `contents: read`
and `id-token: write`, no npm access token, and
`npm publish --provenance --access public`. Supported runtime Node >=22 is distinct
from OIDC's Node >=22.14.0 requirement. See
[official npm guidance](https://docs.npmjs.com/trusted-publishers/).

v0.3.1 is a documentation patch preparing the first automated dual release. Its
npm-facing README is end-user documentation, not a release-engineering runbook.
