# v0.4.0 Phase 1: standalone executable foundation

## Decision and evidence boundary

Select **PyInstaller one-file**, provisionally gated on actual Linux x86_64 and
Windows x86_64 validation. Simpler packaging of the existing CPython interpreter
is preferable to a C compilation pipeline for this small, stdlib-only CLI.
Neither a successful build nor source-level reasoning proves filesystem parity.
Nuitka is a credible alternative, not a demonstrated incompatibility.

This is not a release, version bump, npm migration, or completed milestone.
Python source is canonical; native TypeScript remains unchanged. Phase 2 may not
start until both required native executable gates pass at the reviewed commit.

## Repository / v0.3.1 audit

Reviewed README, CONTRIBUTING, PLANS, NODE_PORT, pyproject, all seven Python
production files, four baseline test modules, both shared JSON corpora and their
schema documentation, Python/Node CI and both release publishers. Reviewed all
Node production modules and package metadata as compatibility references only.
Production Python/Node source matches released `e0464574ac621eb80b2b1048a1c1b3608ca6346d`.

- Layout/defaults/known line endings come from templates. Final local occurrence
  supplies raw value and commented/active state; duplicate template lines remain.
  Unknown keep/remove/error and narrow unsupported-syntax refusal stay unchanged.
- Strict UTF-8, LF physical splitting and byte-exact output; BOM is not stripped.
  Unsupported template defaults are still unvalidated (documented fixture quirk).
- Project cwd discovery, both suffixes, all five exclusions, no child-directory
  symlink traversal, missing-target skips, ambiguity and template-as-target refusal.
  Full read/reconcile/mode preflight precedes every write. Apply is **not** a
  cross-file transaction; late apply failure may leave earlier replacements done.
- Targets must be regular, non-symlink files distinct from templates by identity,
  including hard links. Explicit mode permits regular template symlinks; project
  mode rejects them. Unchanged files retain identity/mtime.
- Writer creates a same-directory NamedTemporaryFile, writes UTF-8 without newline
  translation, closes, chmods, os.replace's, then cleans only its temporary path.
  No intentional target delete/truncate fallback. No fsync, ownership/ACL
  preservation, concurrency snapshot, race-proof validation or rollback promise.
- CLI uses existing main unchanged: 0 success/aligned, 1 check changes, 2 invalid
  arguments/input/project/I/O. Operational diagnostics omit dotenv values. Argparse
  still echoes invalid argument tokens; this pre-existing argument behavior is not
  silently redacted by the bundler. Do not put secrets in command-line arguments.
- Existing Python CI previously covered Ubuntu only. Mode expectations and path
  labels in focused tests needed OS-aware assertions for the new Windows gate;
  production behavior is not changed. POSIX mode assertions still run on Linux;
  focused and fixture tests compare captured native modes on both platforms.

## PyInstaller vs Nuitka

Source review uses [PyInstaller usage](https://pyinstaller.org/en/stable/usage.html),
[runtime information](https://pyinstaller.org/en/stable/runtime-information.html),
[license](https://pyinstaller.org/en/stable/license.html), and
[Nuitka manual](https://nuitka.net/user-documentation/user-manual.html) /
[license](https://nuitka.net/doc/download.html#nuitka-standard-license).

| Criterion | PyInstaller one-file | Nuitka one-file / standalone |
| --- | --- | --- |
| Behavioral correctness | Existing bytecode on bundled CPython; fixture/safety gates required | Compiles Python to C, retaining CPython runtime semantics; same gates required |
| Runtime independence | Bundles interpreter/stdlib, no user Python | Standalone/one-file bundles runtime; **default accelerated mode is insufficient** |
| Linux | Native Linux builds; system libc/loader still required | Native Linux builds; compiler and ELF dependency tooling needed |
| Windows | Native PE build using shipped bootloader | Native PE build, compatible MSVC/other supported compiler required |
| CI suitability | pip-only build tooling, no project compiler setup | Hosted runners can provide compilers; extra toolchain/configuration surface |
| Reproducibility | Pin Python/tool dependencies, isolated build; no byte-identical claim | Also pin C compiler/linker/SCons/OS, no byte-identical claim |
| Startup | Extracts per invocation; measurable overhead | One-file also unpacks; caching options can help; not inherently always faster |
| Filesystem semantics | Application still calls original stdlib/OS functions | Expected same stdlib/OS paths, but compilation is another validation surface |
| Symlink/hard-link | Original pathlib samefile and symlink checks; actual OS tests required | Same intended checks, actual OS tests required |
| Modes/permissions | Original S_IMODE/chmod; Windows writability only | Same limitations; neither gives portable ACL preservation |
| UTF-8 | Original strict reads, explicit encoding and newline="" | Same intended code contract, byte fixtures required |
| Atomic replacement | Original closed same-directory temporary + os.replace | Same intended writer; neither changes Windows replacement constraints |
| Automation | One build script, no custom hooks/spec maintenance | Entrypoint plus compiler/configuration/dependency collection pipeline |
| Size | Runtime dominates; record actual artifact bytes per platform | Potentially smaller, not assumed; record measurements before claiming |
| Build time | Local measured build about 6 seconds (ARM64 only) | Compilation expected costlier; measurements are host-specific |
| Maintenance | Small pinned build-only dependency list; runtime upgrades still need gates | More compiler/platform compatibility to maintain; no needed CLI performance gain |
| Licensing | GPL-2.0 with bundling exception, some files Apache-2.0; generated application may remain MIT | Standard Nuitka Apache-2.0; optional commercial components not needed |

Both approaches bundle Python and its dependencies: review PSF and bundled library
notices before publication, and ship required license notices with future release
assets. A single executable is not an exemption from dependency licensing. The
prototype is not published. PyInstaller is **not** described as entirely Apache.

Selection is based on lower maintenance and preserving the existing interpreter
execution model, not size or unmeasured performance claims. Revisit if measured
startup/distribution needs justify compilation. Windows correctness is pending,
not inferred from the tool supporting Windows.

## Build and validate

Use a clean build environment, Python 3.13.15 (CI), and the pinned build-only
dependencies. Build tooling requires Python >=3.11 for tomllib; the Python package
still supports 3.10–3.14 without added runtime dependencies.

```sh
python -m pip install -r scripts/requirements-executable.txt
python -m pip install .
python -m unittest discover -s tests -v
python scripts/build-executable.py
# Set ALIGN_DOTENV_EXE to the absolute built artifact path, then:
python -m unittest discover -s tests -p test_executable.py -v
```

The generated launcher imports `align_dotenv.cli.main`; no behavioral fork or
runtime hook. `--paths src` is analysis-time only. PyInstaller generates its spec
and intermediate outputs in a temporary build directory. UPX is disabled, keeping
ambient tool availability out of the build. No binary goes into Git.

Metadata-derived names are `align-dotenv-v{version}-linux-x64` and
`align-dotenv-v{version}-windows-x64.exe`. Current prototypes correctly say 0.3.1;
no reusable build logic hard-codes 0.4.0. Build on each target OS/architecture:
this script is not a cross compiler. Host-derived ARM names may be used for local
development experiments; they are **not** an added supported target or CI gate.
No macOS build target is introduced. Future release assets can add SHA256SUMS and
license notices after validation; CI retains artifacts and metadata for inspection
only, including byte size, SHA-256, architecture, OS, build versions and commit.

`tests/test_executable.py` substitutes subprocess helpers of existing fixture and
focused CLI/project tests; the two API-only discovery tests are exercised through
the executable CLI instead. It reuses all 36 shared cases with exact expected bytes,
diagnostics/checks/second passes and original project scenarios. Additional direct
Python/binary project comparisons place fixture failures after a valid changed
pair, ensuring late preflight cannot write earlier files. Boundary tests copy the
artifact outside the checkout, poison external imports, empty PATH, set invalid
PYTHONHOME/PYTHONPATH, test paths with spaces, and exercise real filesystem failures.
The Windows locked-handle test denies delete-sharing and checks failed replacement
preserves the original and cleans the temporary. POSIX directory permissions test
is skipped only for root (which bypasses that restriction).

Original in-process safety tests remain necessary for injected chmod/write/replace
failures and operation ordering; subprocess tests cannot see Python mocks. The
same-directory close/chmod/replace/no-target-delete assertion runs on both OSes.

`.github/workflows/executable.yml` adds independent Ubuntu 24.04 x64 and Windows
Server 2022 x64 gates: clean dependencies, normal suite, native build, real artifact
suite and outside-checkout help. Existing Python, Node and publishing workflows
are unchanged. An Ubuntu container with no Python receives only the executable,
not the repository, and runs help/explicit/project checks on exact resulting bytes.
ELF/PE headers assert x86_64; Linux file/ldd/readelf inspection records loader and
libc assumptions. CI artifacts are retained seven days, not published as releases.
No release, tag or package publication step is added.

## Platform limits and remaining risks

- Initial required targets: **Linux x86_64 (Ubuntu 24.04)** and **Windows x86_64
  (Server 2022)**. Minimum consumer OS versions are not established by this matrix.
  Linux glibc is not bundled: do not advertise Alpine/musl or older distributions.
- One-file startup requires writable runtime temporary space; Linux noexec temp
  mounts can block loading. `_MEIPASS` is extraction location, **not cwd**. User
  dotenv replacements use target.parent, never the extraction directory.
- Windows os.replace can fail with sharing locks, read-only attributes, AV or
  unusual/network filesystems. There is no delete-original fallback. Windows chmod
  is not POSIX permissions and does not preserve ACLs. Code signing/AV false
  positives and dependency-license delivery remain future distribution work.
- Normal OS loader/system libraries remain dependencies, but user-installed Python
  does not. Empty PATH and poisoned import tests validate isolation; Windows clean
  OS-image portability still needs validation beyond a hosted development runner.
- No byte-identical reproducibility claim: OS image, paths, Python build and native
  libraries affect outputs. Pinning tools improves repeatability, not proof.

## Validation status

Local host is WSL Linux **ARM64**, not either required x86_64 target. PyInstaller
6.20.0 / hooks 2026.4 / CPython 3.13.15 builds here; all reported local results
are developmental evidence only. Required Ubuntu x64 and Windows x64 CI is pending
until these changes are committed/pushed and observed passing. Do not interpret
existing v0.3.1 CI as executable validation. Working tree is intentionally not
claimed clean; pre-existing uncommitted work was present when this task started.

### Measured development comparison (not a supported-platform gate)

Both builds used CPython 3.13.15 on WSL ARM64 / glibc 2.43. PyInstaller 6.20.0
used the pinned requirements above. Nuitka 4.2.2 used GCC 15, patchelf 0.19.1.0,
two compilation jobs and `--mode=onefile`; its compression step discovered a
system Python 3.14 with compression support (build-time only). Its intermediates
and report stayed under `/tmp/opencode/`, not Git. This is an exploratory build,
not a reproducible supported release pipeline. Evaluation command:

```sh
PYTHONPATH=src python -m nuitka --mode=onefile --jobs=2 \
  --output-dir=/tmp/opencode/align-nuitka-output \
  --output-filename=align-dotenv-nuitka /tmp/opencode/align-nuitka-entry.py
```

The temporary entry script imports `align_dotenv.cli.main` and exits with its result.

| Measurement | PyInstaller | Nuitka |
| --- | --- | --- |
| Artifact bytes | 10,428,080 | 9,046,120 |
| Build elapsed (excluding installation) | ~6 s | 53.17 s |
| `--help` median, 10 local invocations | 142.6 ms | 97.0 ms |
| Same executable suite | 24 passed, 0 skipped | 24 passed, 0 skipped |

Normal Python suite: **48 passed**, including the added writer-order safety test;
24 artifact tests skip when no artifact is configured. Existing **378 Node
workspace + 9 packed + 9 version-guard tests** pass locally on Node 22.23.3 and
26.9.0; Node 22/24 required cross-platform gates remain the unchanged CI matrix. No production code,
package versions or release publishers changed. The Linux/Windows x64 artifact
sizes and CI outcomes are **not available yet**. Neither required platform has
been validated by this local ARM64 work, and Phase 1 is **not complete**.
