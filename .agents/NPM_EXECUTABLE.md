# v0.4.0 Phase 2 — executable-backed npm

## Boundary and layout

Phase 1 final commit `4158c96e29eb609b32331057ab4aa1c1f45ca7c6` was fast-forwarded
into `develop`. Its develop baseline passed in
[run 37455041075](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37455041075).
Phase 2 branch: `build/npm-executable-wrapper`. Versions remain **0.3.1** until
release preparation; unreleased tarballs must not overwrite the existing release.

- `node/`: private TypeScript reference/development workspace, retaining all
  production source and tests. Its packed test is a historical reference gate.
- `node/npm/`: real `align-dotenv` distribution: JavaScript launcher, no dotenv
  business logic, and exact-version optional dependencies.
- `node/npm/platforms/linux-x64/`: `@align-dotenv/linux-x64` (`os: linux`, `cpu: x64`).
- `node/npm/platforms/win32-x64/`: `@align-dotenv/win32-x64` (`os: win32`, `cpu: x64`).

Separating manifests keeps unpublished optional packages out of development
`npm ci`. Production tarballs contain no TypeScript business code and never fall
back to it. The launcher resolves a same-version package, spawns with argument
arrays and `shell: false`, inherits stdio, and preserves exit codes. Fixed
redacted launch errors return 2. No install scripts or runtime network downloads.
POSIX signals are forwarded and reflected; Windows signals retain Node/OS limits.
Node >=22 stays unchanged; lowering it adds scope without a strong migration benefit.

## Staging and integrity

```
python scripts/build-executable.py --output-dir dist/executable
node scripts/pack-npm.mjs dist/executable dist/npm
```

Staging requires a fresh output directory, matching HEAD/version, unchanged
tracked Python source/version, SHA-256/size, and x64 ELF/PE headers. Metadata
records exact filename, size, digest, OS/architecture, project version, source
commit and Python/PyInstaller versions. This is an integrity/build relationship,
not a cryptographic attestation or runtime checksum verifier.

The staged main manifest also records `alignDotenvBuild.version` and
`alignDotenvBuild.sourceCommit`. Changes to tracked launcher/manifests/build
tooling since HEAD are rejected too; unrelated untracked files remain untouched.

Linux builds require binutils `strip` and use PyInstaller `--strip` to remove
CPython/vendor DWARF build paths. Windows PE binaries are never stripped.

Main tarball allowlist: `package.json`, `LICENSE`, `bin/align-dotenv.js`.
Platform allowlist: `package.json`, `LICENSE`, `metadata.json`, and exactly one
`bin/align-dotenv` or `bin/align-dotenv.exe`. Before installation, inspect actual
tar members and scan for known fixture values and personal/checkout paths.
`scripts/audit-executable.py` also scans unpacked PyInstaller modules, not only
compressed strings. No fixtures, source, caches or build workdirs are shipped.

## npm behavior and gates

For unpublished offline tests, install the main and matching platform tarball
together. The local exact-version package satisfies the optional dependency
without a registry entry. Consumers generate lockfiles, remove node_modules and
run offline `npm ci` with an isolated cache. Optional omission is permitted by
npm but invocation must fail clearly. At release time publish both platform
packages before the main package. Scope ownership, new Trusted Publishers and
coordinated publication still require separate release preparation.

`.github/workflows/npm-executable.yml` builds real same-commit executables on
Ubuntu 24.04 x64 and Windows Server 2022 x64, with Node 22/24/26. External clean
consumers use only a copied Node runtime on PATH (cmd.exe is absolute); python,
python3 and py must be inaccessible. PYTHONHOME/PYTHONPATH are invalid. Tests run
actual npx, npm exec, scripts, Linux shim and Windows npm-generated `.cmd` shim.
They cover offline install/ci, explicit/project/check/unknown policies, every
shared fixture, redacted errors, links, native modes, no-write and late preflight.
The 24 existing artifact tests retain atomic replacement, cleanup and Windows
locked-target coverage. The complete native TypeScript reference gates remain.

Four-way comparisons use TypeScript CLI, canonical Python CLI, standalone and
installed npm wrapper. File bytes and safe domain outputs match exactly; only
terminal CRLF translation is normalized. Source argv[0] and a byte-identical
standalone copy use the public command name to avoid artifact-name usage changes.
Python owns help/argparse presentation. Historical TypeScript help adds a project
paragraph and parser usage/error grammar can differ; the wrapper must match the
executable exactly, not recreate historical help in JavaScript.

Run `npm run test:package` in `node/` with ALIGN_DOTENV_NPM_STAGE,
ALIGN_DOTENV_EXE and ALIGN_DOTENV_PYTHON set to fresh staging/build/interpreter.
Without staging, the native npm gate explicitly skips; this is never native proof.
Local WSL ARM64 cannot validate either x64 distribution.

## Status and limits

Native Phase 2 validation is pending until observed on a pushed commit. CI
configuration alone is not readiness. Artifacts have seven-day retention only.
No package, tag or release publication is authorized: the reference workspace is
private and the npm publisher also refuses this layout pending release automation.

Composer and TypeScript retirement are future work. macOS, Linux ARM64, Windows
ARM64, musl and older Linux are not claimed. Ubuntu 24.04 uses glibc 2.39 and
bundled Python requires GLIBC_2.38. Signing/AV, extraction restrictions,
third-party notices and reproducible/attested release builds remain concerns.
