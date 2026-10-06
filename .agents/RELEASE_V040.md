# v0.4.0 release candidate — NOT READY

## Entry evidence and version audit

Phase 3 `7129bb5ce1070d03cabe9a29add466a72ec38b7a` was fast-forward merged into
develop. Post-merge baseline `37482798287`, standalone `37482798195`, and all six
native npm jobs `37482798132` passed before branch `release/v0.4.0` was created.

Active version surfaces: pyproject.toml; node/package.json; both workspace lock
versions; node/npm/package.json; Linux/Windows manifests; their exact optional
dependencies; release-policy.json. All are 0.4.0. Executable names and metadata
derive from pyproject rather than a separate version. `check-versions.mjs` guards
all these declarations, including the new policy version and optional versions.
Launcher tests derive version from the main manifest. Historical v0.3.x versions
and synthetic version-guard inputs are not active declarations.

## Architecture and unchanged contract

src/align_dotenv is canonical; PyPI installs source, native binaries embed it, npm
only launches those binaries. No TypeScript dotenv implementation or stable JS
library API exists. No runtime binary download, install script, fallback, new
ecosystem, platform expansion or dotenv semantic change is introduced.

Targets: Ubuntu 24.04 Linux x86_64 and Windows Server 2022 x86_64; npm Node >=22,
native CI Node 22/24/26. CPython 3.13.15, PyInstaller 6.20.0, hooks 2026.4. Linux
build environment glibc 2.39, bundled Python requires GLIBC_2.38. No macOS, ARM,
musl/Alpine or older Linux compatibility claim. No byte-reproducible build claim.

## Exact artifact policy

The `release-candidate` job runs only after both native builds and all six real
npm consumer jobs pass. `prepare-release.py` checks source commit, version,
filename, architecture, size/hash, packed-binary equality, manifest selectors,
exact optional dependencies and file allowlists before creating a fresh bundle.
No artifact from a different commit may be substituted. Native build jobs run
all 24 executable tests plus unpacked/canonical-bytecode audits. The separate
standalone gate remains required; its independent build digests may differ.

Proposed GitHub Release asset set:

- align-dotenv-v0.4.0-linux-x64
- align-dotenv-v0.4.0-windows-x64.exe
- SHA256SUMS (both binaries, metadata and license/notice files)
- BUILD_METADATA.json (version/commit, per-binary OS/arch/toolchain/size/SHA-256,
  package tarball SHA-512 integrities and release-policy state)
- LICENSE (application MIT)
- THIRD_PARTY_NOTICES.md (must be completed before public redistribution)

npm tarballs are CI artifacts, not additional public Release assets:

- align-dotenv: package.json, LICENSE, bin/align-dotenv.js
- @align-dotenv/linux-x64: package.json, LICENSE, THIRD_PARTY_NOTICES.md,
  metadata.json, bin/align-dotenv
- @align-dotenv/win32-x64: package.json, LICENSE, THIRD_PARTY_NOTICES.md,
  metadata.json, bin/align-dotenv.exe

Both platform packages have the exact repository.url needed for provenance.
Candidate artifacts retain 30 days; native inputs retain seven. If unavailable,
rerun validation on the same immutable commit; do not silently rebuild during
publication. Checksums show integrity, not reproducibility or signatures.

## Licensing: unresolved release blocker

Actual Phase 3 archives were inspected. CPython/stdlib, PyInstaller bootloader/
loaders and inspect runtime hook, libcrypto, bzip2, liblzma and zlib are present.
Windows additionally includes VCRUNTIME140.dll, ucrtbase.dll and api-ms-* DLLs.
MIT is not sufficient for binary distribution. CPython requires PSF/historical
agreements and applicable incorporated-code notices; PyInstaller's bootloader
exception permits compiled combinations without imposing its GPL on the app,
but the Apache runtime hook needs its license/copyright. Library-specific notice
obligations and Windows redistribution entitlement need actual-version review.

THIRD_PARTY_NOTICES.md deliberately records the inventory and upstream sources,
not fabricated clearance. Full required texts/notices and Windows entitlement
remain unresolved. Do not treat hyperlinks, an inventory, or CI success as license
compliance. `licensingAuditComplete` stays false; publication fails closed.

## External configuration: unresolved release blockers

Read-only inspection found unscoped align-dotenv exists with maintainer geonhui,
latest 0.3.1; both scoped package registry endpoints returned 404. This does not
prove who owns the align-dotenv scope, first-publication rights, or whether npm
offers an authorized OIDC first-publication route for these new package names.
Maintainer must confirm scope ownership/team access, first-publication setup and
Trusted Publisher registrations for **each** of the three packages. Do not
bootstrap or publish any package as part of this task.

Required identity: Geonhui-Lee / align-dotenv / publish-npm.yml / environment npm,
with direct npm publish permission (stage-only does not match this workflow).
Use GitHub-hosted runners, Node 24/npm >=11.5.1, id-token:write, provenance and no
long-lived npm tokens. Existing main-package setup does not authorize new scoped
packages. npm's current docs say a new publisher must first publish within two
days or expire; verify current settings immediately before authorized release.

GitHub environment inspection found npm has a custom branch-policy rule but no
required-reviewer rule; pypi has no protection rules. Confirm intended approval
requirements and permitted release/tag/deployment branches for both environments.
Repository code does not alter these settings. Confirm PyPI Trusted Publisher:
Geonhui-Lee / align-dotenv / publish.yml / environment pypi. Historical successful
PyPI publishing is evidence, not a substitute for checking current configuration.

ENABLE_NPM_PUBLISHING was already true. New ENABLE_V040_RELEASE remains unset;
both publishers require it. `externalNpmSetupConfirmed` and
`protectedEnvironmentsConfirmed` remain false. Confirmation requires maintainer
evidence, not an invented self-attestation. Repository changes alone are not ready.

References: https://docs.npmjs.com/trusted-publishers and
https://docs.pypi.org/trusted-publishers/ . npm whoami is not an OIDC permission test.

## Derived publication sequence (future authorization only)

1. Resolve licensing and external/protected-environment prerequisites; complete
   notice texts, update reviewed policy approvals and validate the resulting final
   commit afresh. Merge through normal history as separately authorized.
2. Require baseline Python 3.10–3.14/packaging/installed-wheel/version/launcher,
   both standalone gates, and full six-job native npm + assembled candidate jobs.
   Download/inspect the exact bundle and recorded checksums. Dry plan performs no
   registry requests or publication and tests v0.4.0 guards without a real tag.
3. Only on explicit later authorization enable release opt-in, tag the exact
   validated commit and create its GitHub Release. Never move/replay v0.3.x tags.
4. Published Release triggers two protected workflows. Both resolve the existing
   release/tag to a commit and require all three successful push-validation runs
   for that SHA. No new binaries/wheels are built in publishing jobs.
5. npm workflow downloads that run's candidate, verifies tag/source/version/plan/
   approvals, then attaches exact binaries/checksums/metadata/notices without
   overwriting mismatching existing assets. It preflights immutable registry
   versions for all three packages, publishes and verifies linux-x64, publishes
   and verifies win32-x64, **only then** publishes and verifies align-dotenv.
   Registry verification requires exact tarball integrity and provenance.
6. PyPI workflow independently downloads the exact baseline wheel/sdist, reinspects
   metadata and clean installation, verifies prerequisites, checks immutable
   registry state and uses PyPI OIDC after environment approval. PyPI and npm can
   run concurrently: Python does not depend on npm's platform packages.
7. Verify public versions/provenance/latest, supported fresh npm installs/shims,
   PyPI installs, GitHub asset checksums and metadata. Registry visibility may lag.
   Do not call the release complete solely because an upload command succeeded.

## Partial failure handling

Across registries the release is not atomic. A failed/indeterminate npm upload
requires inspecting visibility; restart only the same validated bundle. Already
published byte-identical/provenanced versions are verified and skipped, never
republished. A mismatching immutable version blocks before any new mutation. If a
platform is not visible, main remains unpublished; wait/verify instead of changing
versions or dependencies. Missing provenance or differing bytes requires manual
investigation. GitHub assets are compared before uploads; no --clobber is used.

PyPI similarly skips only when its complete filename/SHA-256 set matches the
validated wheel/sdist; a partial or mismatching set stops for investigation,
without uploading over existing files. Keep the exact validation run/artifact
identities for recovery; regenerated tarballs/wheels may differ in bytes even at
the same source commit. Expired artifacts require explicit revalidation/review,
not weakened comparisons. Protected environments and opt-in are never bypassed.

## Status

This is release preparation, not publication authorization. Final v0.4.0 native
results/artifact digests must be observed at the final pushed preparation commit.
Regardless of those results, licensing, new npm package setup and environment
approval confirmation above are unresolved; READY is forbidden until all pass.
Unrelated untracked uv.lock is never edited, staged or committed.
