# Development plan

## v0.4.0 Phase 2 tracking

Phase 1 final commit `4158c96` is incorporated into `develop` by fast-forward;
baseline CI passed in run `37455041075`. Phase 2 branch:
`build/npm-executable-wrapper`. `node/npm/` uses optional `@align-dotenv/linux-x64`
and `@align-dotenv/win32-x64` executable packages. `node/` is a private native
TypeScript reference workspace, retained until Phase 3. Versions remain 0.3.1;
nothing is published. Native Phase 2 validation is pending; see `NPM_EXECUTABLE.md`.

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
  Current baseline: v0.3.1 is released; its production behavior remains unchanged.
- Reusable release procedure: [CONTRIBUTING.md](../CONTRIBUTING.md).

## v0.4.0 — universal executable foundation (Phase 1)

### Architecture direction

`src/align_dotenv/` is the **single canonical behavioral implementation** for all
future distributions. The long-term model is:

```text
                Python source
             src/align_dotenv/
                    │
        ┌───────────┴───────────┐
        │                       │
       PyPI             standalone binaries
                                 │
               ┌─────────────────┼─────────────────┐
               ▼                 ▼                 ▼
              npm             Composer       GitHub Releases
```

- `src/align_dotenv/` remains the authoritative Python implementation.
- Standalone executables are built from that implementation; end users of eventual
  non-Python package-manager distributions will not need Python installed.
- v0.3.1 is the behavioral baseline throughout this migration. No behavioral change
  is introduced unless it fixes a demonstrated pre-existing bug.
- The existing TypeScript implementation in `node/` remains intact and unchanged for
  now. It will not be replaced or removed until an executable-backed npm package has
  been proven behaviorally equivalent on all required platforms.

### Phase 1 scope — standalone executable prototype

Phase 1 proves that the Python implementation can be packaged into a
self-contained standalone executable and that the result preserves the v0.3.1
behavioral contract on real platforms.

**In scope:**
- Evaluate PyInstaller vs Nuitka as packaging technologies.
- Build a standalone `align-dotenv` executable from `src/align_dotenv/`.
- Initial supported targets: Linux x86_64 and Windows x86_64.
- Executable-level subprocess tests reusing the existing fixture corpus.
- CI jobs that build and validate the executable on both required platforms.

**Explicitly out of scope for Phase 1:**
- Migrating the npm package to use the executable.
- Removing or modifying the TypeScript implementation.
- Publishing a new npm, PyPI, or GitHub Release version.
- Adding macOS/ARM support (unless trivial and zero scope expansion).
- Composer, RubyGems, or any other ecosystem packaging.
- Any new CLI feature (including `--diff`).
- Any behavioral change unless required to fix a pre-existing bug.

**Technology selection:** PyInstaller one-file is selected and validated on both
required executable targets. The rationale and
full evaluation are in `.agents/EXECUTABLE_ARCH.md`.

**Status:** Phase 1 native foundation validated at
`6d62a63f82510c3f111ba7b2f96c37f0ddc5ad9c`:
[executable CI](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37449635772)
passed Ubuntu 24.04 x86_64 and Windows Server 2022 x86_64, with all 24 artifact
tests and zero artifact skips on each target. Python, Node and packaging
[baseline CI](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37449635770)
also passed at that exact commit. Artifacts are retained for CI inspection only;
no package, tag or release was published. Details/checksums/limits are in
`EXECUTABLE_ARCH.md`. Subsequent commits must pass the native gates again before
being treated as validated; workflow configuration alone never proves readiness.

The local WSL machine remains Linux ARM64; those development results are separate
from the actual x86_64 CI evidence. Version metadata remains 0.3.1 until release
preparation. npm migration has not begun and is not part of Phase 1. Follow-up
work is on `build/standalone-executable-foundation`, not directly on `develop`.

### Phase 2 — npm executable wrapper (future)

Replace the native TypeScript implementation with a thin npm wrapper that launches
the platform-appropriate standalone executable. Phase 2 begins only after Phase 1
CI gates pass. The TypeScript source remains in `node/` until Phase 2 is proven.

### Phase 3+ — additional ecosystems (future)

Composer, RubyGems, and similar launchers follow the same pattern once the binary
architecture is proven stable in Phase 2.

---

## Later ideas (not part of the v0.4.0 executable work)

### Likely next

- Value-redacted `--diff`.
- Better project-mode diagnostics and summaries.

### Future configurability

- Configuration file support.
- Custom discovery rules, ignored paths/directories, and template suffixes.

### Future target management

- Explicit opt-in creation of missing dotenv targets.
- Interactive behavior.
